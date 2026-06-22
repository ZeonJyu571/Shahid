import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface CaseRow {
  id:                  string;
  raw_submission_hash: string | null;
  public_data:         string;
  sensitive_data:      string;
  public_hash:         string | null;
  status:              string;
  merkle_root:         string | null;
  xrpl_tx_id:          string | null;
  created_at:          string;
  reviewed_at:         string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const row = db
    .prepare(`SELECT * FROM cases WHERE id = ?`)
    .get(id) as CaseRow | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Rejected cases are treated as non-existent for public inquiry
  if (row.status === 'rejected') {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Pending: acknowledge existence but don't reveal content yet
  if (row.status === 'pending') {
    return NextResponse.json(
      { case_id: id, status: 'pending', message: 'This case is currently under review.' },
      { status: 202 }
    );
  }

  // Approved: return public layer only — sensitive data never exposed
  const publicData = JSON.parse(row.public_data);

  return NextResponse.json({
    case_id:             id,
    status:              'approved',
    date:                publicData.date,
    type:                publicData.type,
    location:            publicData.location,
    summary:             publicData.summary,
    raw_submission_hash: row.raw_submission_hash,
    public_hash:         row.public_hash,
    merkle_root:         row.merkle_root,
    xrpl_tx_id:          row.xrpl_tx_id,
    created_at:          row.created_at,
    reviewed_at:         row.reviewed_at,
  });
}
