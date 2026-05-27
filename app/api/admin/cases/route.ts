import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface CaseRow {
  id:                  string;
  raw_submission_hash: string | null;
  raw_file_hashes:     string | null;
  public_data:         string;
  sensitive_data:      string;
  status:              string;
  created_at:          string;
}

// Simple password guard — set ADMIN_PASSWORD in .env.local
function isAuthorised(req: NextRequest): boolean {
  const pwd = req.headers.get('x-admin-password');
  return pwd === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/cases?status=pending   (default: pending)
// GET /api/admin/cases?status=approved
// GET /api/admin/cases?status=all
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';

  let rows: CaseRow[];

  if (status === 'all') {
    rows = db
      .prepare(`SELECT * FROM cases ORDER BY created_at DESC`)
      .all() as CaseRow[];
  } else {
    rows = db
      .prepare(`SELECT * FROM cases WHERE status = ? ORDER BY created_at DESC`)
      .all(status) as CaseRow[];
  }

  const cases = rows.map(row => ({
    id:                  row.id,
    raw_submission_hash: row.raw_submission_hash,
    raw_file_hashes:     row.raw_file_hashes,
    status:              row.status,
    created_at:          row.created_at,
    // Parse both layers so the admin UI gets full detail
    ...JSON.parse(row.public_data),
    sensitive: JSON.parse(row.sensitive_data),
  }));

  return NextResponse.json({ cases });
}
