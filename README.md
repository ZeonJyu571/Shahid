# Shahed — Archive for Political Violence

Shahed is an evidence preservation platform designed to protect and archive records on behalf of victims of political violence. In events such as the crackdown of Iranian protests, it allows the public to submit text testimony and media files. After manual review, raw data is stored in a local database while the cryptographic hash digest of the evidence is periodically batched and written to the XRP Ledger blockchain.

---

## Why This Project, and Why Blockchain

Data regarding political violence is currently stored overwhelmingly on commercial social media platforms. While these platforms facilitate the dissemination of such information, they are not ideal carriers for its long-term preservation. Commercial platforms are prone to the agendas of their owners, as illustrated by cases such as Elon Musk's acquisition of Twitter.

Moreover, the World Wide Web was fundamentally designed for real-time communication. The majority of online information from before the mobile internet era has already been lost. Shahed turns to blockchain for a long-term, tamper-proof record for sensitive information — one that no single entity can delete or alter.

---

## Platform Features

### 1. Evidence Submission

Any member of the public can submit an incident record through the submission form. Each submission includes:

- **Incident information** — date, location, incident type, and alleged perpetrator
- **Detailed account** — a full written testimony of the incident (sensitive layer)
- **Public summary** — a one-to-two sentence description suitable for public display
- **Media files** — photographs, video, audio, or documents as supporting evidence
- **Source information** (optional) — contact details and relationship to the incident, kept strictly internal

Upon submission, the platform immediately generates a `raw_submission_hash` — a SHA-256 digest of the entire submission including all field values and file hashes. This locks in the original state of the record at the moment of receipt, before any review or editing. A unique case identifier in the format `EVD-YYYY-XXXXXXXX` is returned to the submitter for future reference.

### 2. Information Layering

Shahed separates each record into two distinct layers upon review approval:

| Layer | Contents | Visibility |
|---|---|---|
| **Public layer** | Date, location, incident type, public summary | Accessible to anyone via Case Inquiry |
| **Sensitive layer** | Detailed testimony, contact info, uploaded file paths | Accessible only to authorised reviewers |

Each layer is independently serialised and hashed (SHA-256) at the point of approval. This means the integrity of both the public-facing content and the confidential testimony can be independently verified, without requiring the sensitive layer to be disclosed.

### 3. Manual Review Queue

Submitted cases enter a pending queue accessible only to authorised administrators. The review interface allows reviewers to:

- View the full submission including sensitive testimony and uploaded media
- Preview uploaded images directly within the interface
- Approve a case — triggering data separation, hash computation, and database finalisation
- Reject a case — permanently removing it from the queue
- Delete an approved case before it is committed to the blockchain

Access to the review queue requires an admin password configured in the server environment.

### 4. Case Inquiry

Anyone with a case identifier can query the public record through the Case Inquiry page. The inquiry returns:

- Incident type, date, and location
- Public summary and detailed description
- `raw_submission_hash` — proving the record's original state at submission
- `public_hash` — proving the public layer has not been altered since approval
- XRPL transaction ID and Merkle root, once the case has been committed on-chain

Sensitive information is never returned through the public inquiry interface.

### 5. Blockchain Anchoring

Approved cases are periodically committed to the XRP Ledger in batches. The process:

1. All approved cases pending on-chain commitment are collected
2. Their `public_hash` values are used as leaves to build a binary Merkle tree
3. The Merkle root is submitted to XRPL via an `AccountSet` transaction, with the full batch payload (platform name, Merkle root, case count, case IDs) encoded in the transaction Memo
4. The Merkle root is also written to the account's `Domain` field, making it visible on any XRPL explorer
5. The transaction hash (TX ID) and Merkle root are written back to each case in the database

The resulting on-chain record is permanent and publicly verifiable at `https://xrpscan.com`.

---

## How It Works

### Backend Workflow

1. **Data normalisation** — submitted fields are cleaned, standardised, and validated
2. **Hashing original files** — each uploaded file is SHA-256 hashed before storage; the full submission is also hashed to lock in the original state
3. **Manual review** — an authorised reviewer examines each submission
4. **Data separation** — upon approval, data is split into a public layer and a sensitive layer
   - *Public layer*: date, location, incident type, summary
   - *Sensitive layer*: detailed testimony, contact info, file paths
5. **Second hash** — the finalised public and sensitive layers are each independently hashed (SHA-256), locking in the reviewed content
6. **Write to local database** — all fields and hashes are persisted in SQLite
7. **Construct Merkle tree** — approved cases are batched and their public hashes are used as leaves to build a binary Merkle tree
8. **Upload to XRPL** — the Merkle root is committed to the XRP Ledger via an `AccountSet` transaction with a Memo payload, producing a tamper-proof on-chain record

### Two-hash Design

Shahed uses two separate hash operations per case:

| Hash | When | What it proves |
|---|---|---|
| `raw_submission_hash` | At submission time | The original content as received, before any review |
| `public_hash` / `sensitive_hash` | At approval time | The finalised, published content has not been altered post-review |

---

## Project Structure

```
app/
  api/
    submit/route.ts          # POST — receive and store a new submission
    review/route.ts          # POST — approve or reject a pending case
    inquiry/[id]/route.ts    # GET  — retrieve public layer for an approved case
    admin/cases/route.ts     # GET  — list cases for the review queue
    admin/cases/[id]/route.ts# DELETE — remove an unanchored case
    admin/files/[...path]/route.ts  # GET — serve uploaded files to reviewers
    xrpl/route.ts            # POST — build Merkle tree and commit to XRPL

lib/
  db.ts        # SQLite initialisation and schema
  hash.ts      # SHA-256 utilities and case ID generation
  merkle.ts    # Binary Merkle tree construction

public/
  evidence-platform.html    # Single-file frontend (submit / inquiry / admin)

data/
  evidence.db  # SQLite database (local, not committed to version control)

uploads/       # Raw uploaded files (local, not committed to version control)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Database | SQLite via `better-sqlite3` |
| Hashing | Node.js built-in `crypto` (SHA-256) |
| Blockchain | XRP Ledger via `xrpl` npm package |
| XRPL Node | `wss://xrplcluster.com` (public mainnet cluster) |
| Tunnelling | ngrok (local-to-public HTTPS tunnel) |
| Frontend | Single HTML file with vanilla JS |

---

## Database Schema

```sql
CREATE TABLE cases (
  id                   TEXT PRIMARY KEY,   -- EVD-YYYY-XXXXXXXX
  raw_submission_hash  TEXT,               -- SHA-256 of full original submission
  raw_file_hashes      TEXT,               -- comma-separated SHA-256 of uploaded files
  public_data          TEXT NOT NULL,      -- JSON: { date, type, location, summary }
  public_hash          TEXT,               -- SHA-256 of public_data (set on approval)
  sensitive_data       TEXT NOT NULL,      -- JSON: { description, contact, filePaths, … }
  sensitive_hash       TEXT,               -- SHA-256 of sensitive_data (set on approval)
  merkle_root          TEXT,               -- Merkle root of the commit batch
  xrpl_tx_id           TEXT,               -- XRPL transaction hash
  status               TEXT NOT NULL,      -- pending | approved | rejected
  created_at           TEXT NOT NULL,
  reviewed_at          TEXT
);
```

---

## Setup

### Prerequisites

- Node.js 18+
- An XRPL mainnet wallet with at least 11 XRP

### Installation

```bash
git clone https://github.com/RippleXUSF/Shahid.git
cd Shahid
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```
ADMIN_PASSWORD=your_admin_password
XRPL_SERVER=wss://xrplcluster.com
XRPL_WALLET_SEED=your_wallet_seed
```

### Running

**Development:**
```bash
npm run dev
```

**Production (recommended for stability):**
```bash
npm run build
npm start
```

Then open `http://localhost:3000/evidence-platform.html`.

To expose the platform publicly via ngrok:
```bash
ngrok http --domain=your-domain.ngrok-free.dev 3000
```

---

## On-chain Verification

Each batch commit produces an XRPL transaction visible at:

```
https://xrpscan.com/tx/<XRPL_TX_ID>
```

The transaction carries a Memo payload containing the Merkle root and case identifiers. Anyone can independently verify a case record by:

1. Retrieving the `public_hash` from the Case Inquiry page
2. Locating the corresponding XRPL transaction
3. Confirming the hash is a leaf of the published Merkle tree

---

## Security Notes

- Sensitive testimony and personal identifying information are stored only in the local database and never exposed through the public inquiry API
- The `uploads/` directory and `data/evidence.db` are excluded from version control
- The `.env.local` file containing credentials is never committed
- The platform operator's identity is linked to their XRPL wallet, which may be traceable through exchange KYC records if funded via a regulated exchange

---

## Acknowledgements

Built as part of the RippleX USF programme. Blockchain infrastructure provided by the XRP Ledger.
