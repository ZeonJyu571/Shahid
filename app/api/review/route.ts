import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashObject } from '@/lib/hash';

interface CaseRow {
  id:            string;
  public_data:   string;
  sensitive_data: string;
  status:        string;
}

function isAuthorised(req: NextRequest): boolean {
  const pwd = req.headers.get('x-admin-password');
  return pwd === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let body: { case_id: string; action: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { case_id, action } = body;

  if (!case_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'Provide case_id and action ("approve" or "reject")' },
      { status: 400 }
    );
  }

  const row = db
    .prepare(`SELECT * FROM cases WHERE id = ?`)
    .get(case_id) as CaseRow | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: `Case is already ${row.status}` },
      { status: 409 }
    );
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  if (action === 'reject') {
    db.prepare(`
      UPDATE cases
      SET status = 'rejected', reviewed_at = datetime('now')
      WHERE id = ?
    `).run(case_id);

    return NextResponse.json({ case_id, status: 'rejected' });
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  // Second hash: computed on the finalised, normalised content.
  // public_hash  → what will be visible via inquiry API and eventually on-chain
  // sensitive_hash → stored locally, proves the sensitive layer wasn't altered
  const publicData   = JSON.parse(row.public_data);
  const sensitiveData = JSON.parse(row.sensitive_data);

  const publicHash   = hashObject(publicData);
  const sensitiveHash = hashObject(sensitiveData);

  db.prepare(`
    UPDATE cases
    SET status        = 'approved',
        public_hash   = ?,
        sensitive_hash = ?,
        reviewed_at   = datetime('now')
    WHERE id = ?
  `).run(publicHash, sensitiveHash, case_id);

  return NextResponse.json({
    case_id,
    status:         'approved',
    public_hash:    publicHash,
    sensitive_hash: sensitiveHash,
  });
}
