import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { sha256, generateCaseId, hashObject } from '@/lib/hash';

// Directory where raw uploaded files are stored
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicData {
  date:     string;
  type:     string;
  location: string;
  summary:  string;
}

interface SensitiveData {
  description:  string;
  actor:        string;
  victimCount:  string;
  contact:      string;
  relation:     string;
  filePaths:    string[];   // server-side paths to raw files
}

interface SubmitResponse {
  case_id: string;
  status:  'pending';
}

// ─── Validation ───────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function requireField(value: string | null, name: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new ValidationError(`Missing required field: ${name}`);
  return trimmed;
}

// Basic date sanity check: must be a valid past date
function validateDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime()))      throw new ValidationError('Invalid incident date');
  if (d > new Date())          throw new ValidationError('Incident date cannot be in the future');
  return raw.trim();
}

const ALLOWED_TYPES = new Set([
  'Enforced Disappearance',
  'Arbitrary Detention',
  'Torture or Ill-Treatment',
  'Extrajudicial Execution',
  'Forced Displacement',
  'Property Seizure or Destruction',
  'Other',
]);

function validateType(raw: string): string {
  const t = raw.trim();
  if (!ALLOWED_TYPES.has(t)) throw new ValidationError(`Unknown incident type: ${t}`);
  return t;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PREFIXES = [
  'image/', 'video/', 'audio/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function validateMimeType(mime: string): void {
  const ok = ALLOWED_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
  if (!ok) throw new ValidationError(`File type not allowed: ${mime}`);
}

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Collapse internal whitespace and trim.
 * "  foo   bar  " → "foo bar"
 */
function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Capitalise the first letter of each comma-separated segment.
 * "tehran, iran" → "Tehran, Iran"
 */
function normalizeLocation(raw: string): string {
  return raw
    .trim()
    .split(',')
    .map(part =>
      part
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase())
    )
    .join(', ');
}

/**
 * Normalise to ISO 8601 date string (YYYY-MM-DD).
 * Handles inputs like "2025/5/6", "May 6 2025", etc.
 */
function normalizeDate(raw: string): string {
  return new Date(raw).toISOString().split('T')[0];
}

/**
 * Trim and collapse whitespace in an optional field.
 * Returns empty string if the value is null / undefined.
 */
function normalizeOptional(raw: string | null | undefined): string {
  return raw?.trim().replace(/\s+/g, ' ') ?? '';
}

// ─── File storage ─────────────────────────────────────────────────────────────

/**
 * Save a File to disk and return { filePath, rawHash }.
 * The file is stored under uploads/<caseId>/<originalName>
 * The directory is created if it does not exist.
 */
async function saveFile(
  file: File,
  caseId: string
): Promise<{ filePath: string; rawHash: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(`File "${file.name}" exceeds the 50 MB limit`);
  }
  validateMimeType(file.type);

  const buffer  = Buffer.from(await file.arrayBuffer());
  const rawHash = sha256(buffer);

  // Use the hash as the stored filename to guarantee uniqueness and
  // make it trivial to detect duplicates later.
  const ext     = path.extname(file.name) || '';
  const caseDir = path.join(UPLOAD_DIR, caseId);
  fs.mkdirSync(caseDir, { recursive: true });

  const filePath = path.join(caseDir, rawHash + ext);
  fs.writeFileSync(filePath, buffer);

  return { filePath, rawHash };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Parse multipart form data ────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const get = (key: string) => formData.get(key) as string | null;

    // ── 2. Validate & normalise fields ──────────────────────────────────────
    // Validate first, then normalise — so errors reference the raw input.
    const date        = normalizeDate(validateDate(requireField(get('date'),        'date')));
    const type        = validateType(requireField(get('type'),                      'type'));
    const location    = normalizeLocation(requireField(get('location'),             'location'));
    const summary     = normalizeText(requireField(get('summary'),                  'summary'));
    const description = normalizeText(requireField(get('description'),              'description'));

    // Optional fields — normalise but don't require
    const actor       = normalizeOptional(get('actor'));
    const victimCount = normalizeOptional(get('victimCount'));
    const contact     = normalizeOptional(get('contact'));
    const relation    = normalizeOptional(get('relation'));

    // ── 3. Generate case ID ─────────────────────────────────────────────────
    const caseId = generateCaseId();

    // ── 4. Hash & save uploaded files ───────────────────────────────────────
    const files = formData.getAll('files') as File[];
    const savedFiles: Array<{ filePath: string; rawHash: string }> = [];

    for (const file of files) {
      if (!(file instanceof File) || file.size === 0) continue;
      const saved = await saveFile(file, caseId);
      savedFiles.push(saved);
    }

    const rawFileHashes = savedFiles.map(f => f.rawHash).join(',');

    // ── 5. Separate into public and sensitive layers ─────────────────────────
    // Public layer: what case inquiry will show
    const publicData: PublicData = { date, type, location, summary };

    // Sensitive layer: reviewer-only, never exposed via public API
    const sensitiveData: SensitiveData = {
      description,
      actor,
      victimCount,
      contact,
      relation,
      filePaths: savedFiles.map(f => f.filePath),
    };

    // ── 5a. First hash: lock the original submission ─────────────────────────
    // This hash covers every field plus raw file hashes so we can later prove
    // what was received at submission time, before any review or editing.
    const rawSubmissionHash = hashObject({
      date, type, location, summary,
      description, actor, victimCount, relation,
      fileHashes: savedFiles.map(f => f.rawHash),
    });

    // ── 6. Write to database ─────────────────────────────────────────────────
    // public_hash and sensitive_hash (second hash) are computed on approval,
    // not here — we store raw JSON for now.
    const insert = db.prepare(`
      INSERT INTO cases
        (id, raw_submission_hash, raw_file_hashes, public_data, sensitive_data, status)
      VALUES
        (@id, @rawSubmissionHash, @rawFileHashes, @publicData, @sensitiveData, 'pending')
    `);

    insert.run({
      id:                 caseId,
      rawSubmissionHash:  rawSubmissionHash,
      rawFileHashes:      rawFileHashes || null,
      publicData:         JSON.stringify(publicData),
      sensitiveData:      JSON.stringify(sensitiveData),
    });

    // ── 7. Respond ───────────────────────────────────────────────────────────
    const response: SubmitResponse = { case_id: caseId, status: 'pending' };
    return NextResponse.json(response, { status: 201 });

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[POST /api/submit]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
