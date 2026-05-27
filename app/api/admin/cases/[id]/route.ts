import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

function isAuthorised(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === process.env.ADMIN_PASSWORD;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { id } = await params;

  const row = db.prepare(`SELECT id, status FROM cases WHERE id = ?`).get(id) as
    | { id: string; status: string }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Prevent deletion of cases already committed on-chain
  const onchain = db.prepare(`SELECT xrpl_tx_id FROM cases WHERE id = ?`).get(id) as
    | { xrpl_tx_id: string | null }
    | undefined;

  if (onchain?.xrpl_tx_id) {
    return NextResponse.json(
      { error: 'Cannot delete a case that has already been committed to the blockchain.' },
      { status: 409 }
    );
  }

  db.prepare(`DELETE FROM cases WHERE id = ?`).run(id);

  return NextResponse.json({ case_id: id, deleted: true });
}
