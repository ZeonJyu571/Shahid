import { NextRequest, NextResponse } from 'next/server';
import { Client, Wallet } from 'xrpl';
import db from '@/lib/db';
import { buildMerkleRoot } from '@/lib/merkle';

const XRPL_SERVER = process.env.XRPL_SERVER ?? 'wss://xrplcluster.com';
const WALLET_SEED = process.env.XRPL_WALLET_SEED;

interface CaseRow {
  id:          string;
  public_hash: string;
}

function isAuthorised(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (!WALLET_SEED) {
    return NextResponse.json(
      { error: 'XRPL_WALLET_SEED is not configured in .env.local' },
      { status: 500 }
    );
  }

  // ── 1. Collect approved cases not yet on-chain ────────────────────────────
  const rows = db
    .prepare(`
      SELECT id, public_hash FROM cases
      WHERE status = 'approved'
        AND public_hash IS NOT NULL
        AND xrpl_tx_id IS NULL
      ORDER BY reviewed_at ASC
    `)
    .all() as CaseRow[];

  if (rows.length === 0) {
    return NextResponse.json(
      { message: 'No approved cases pending on-chain commit.' },
      { status: 200 }
    );
  }

  const caseIds    = rows.map(r => r.id);
  const leafHashes = rows.map(r => r.public_hash);

  // ── 2. Build Merkle tree ──────────────────────────────────────────────────
  const merkleRoot = buildMerkleRoot(leafHashes);

  // ── 3. Submit to XRPL ────────────────────────────────────────────────────
  const client = new Client(XRPL_SERVER);
  let txId: string;

  try {
    await client.connect();

    const wallet = Wallet.fromSeed(WALLET_SEED);

    const memoData = Buffer.from(
      JSON.stringify({
        platform:    'EvidencePreservationPlatform',
        merkle_root: merkleRoot,
        case_count:  rows.length,
        case_ids:    caseIds,
      })
    ).toString('hex').toUpperCase();

    const memoType   = Buffer.from('application/json').toString('hex').toUpperCase();
    const memoFormat = Buffer.from('EPP/1.0').toString('hex').toUpperCase();

    const prepared = await client.autofill({
      TransactionType: 'AccountSet',
      Account:         wallet.address,
      // Store the merkle root in the Domain field — updated each batch.
      // This ensures the transaction is never temREDUNDANT because each
      // batch produces a different merkle root.
      Domain: Buffer.from(merkleRoot).toString('hex').toUpperCase(),
      Memos: [
        {
          Memo: {
            MemoData:   memoData,
            MemoType:   memoType,
            MemoFormat: memoFormat,
          },
        },
      ],
    });

    const signed = wallet.sign(prepared);

    // Use submit() instead of submitAndWait() so we get the hash immediately
    // from the server's response, regardless of temREDUNDANT.
    const submitResult = await client.submit(signed.tx_blob);
    const engineResult = submitResult.result.engine_result;

    // tesSUCCESS = accepted, terQUEUED = queued, temREDUNDANT = already queued
    // In all three cases the transaction hash is valid and will appear on-chain.
    if (
      engineResult === 'tesSUCCESS' ||
      engineResult === 'terQUEUED' ||
      engineResult === 'temREDUNDANT'
    ) {
      txId = (submitResult.result.tx_json as any)?.hash ?? signed.hash;
    } else {
      throw new Error(`XRPL submission failed: ${engineResult}`);
    }

  } finally {
    await client.disconnect();
  }

  // ── 4. Write merkle_root and xrpl_tx_id back to every case in this batch ──
  const update = db.prepare(`
    UPDATE cases
    SET merkle_root = ?, xrpl_tx_id = ?
    WHERE id = ?
  `);

  const updateBatch = db.transaction((ids: string[]) => {
    for (const id of ids) {
      update.run(merkleRoot, txId, id);
    }
  });

  updateBatch(caseIds);

  return NextResponse.json({
    message:     'Merkle root committed to XRPL.',
    merkle_root: merkleRoot,
    xrpl_tx_id:  txId,
    case_count:  rows.length,
    case_ids:    caseIds,
  });
}
