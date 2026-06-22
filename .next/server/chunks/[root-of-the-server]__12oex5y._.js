module.exports=[24361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},14747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},22734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},764,(e,t,r)=>{t.exports=e.x("better-sqlite3-de2e7ef294763ce9",()=>require("better-sqlite3-de2e7ef294763ce9"))},47699,e=>{"use strict";var t=e.i(764),r=e.i(14747),s=e.i(22734);let a=r.default.join(process.cwd(),"data","evidence.db");s.default.mkdirSync(r.default.dirname(a),{recursive:!0});let i=new t.default(a);i.pragma("journal_mode = WAL"),i.pragma("foreign_keys = ON"),i.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id                   TEXT PRIMARY KEY,
    -- Hash of the full original submission (set at submit time)
    raw_submission_hash  TEXT,
    -- Raw file hashes (comma-separated if multiple files)
    raw_file_hashes      TEXT,
    -- Public layer: what appears in case inquiry
    public_data          TEXT NOT NULL,   -- JSON: { date, type, location, summary }
    public_hash          TEXT,            -- SHA-256 of serialized public_data (set on approval)
    -- Sensitive layer: reviewer-only
    sensitive_data       TEXT NOT NULL,   -- JSON: { description, actor, victimCount, contact, relation, filePaths }
    sensitive_hash       TEXT,            -- SHA-256 of serialized sensitive_data (set on approval)
    -- Blockchain fields (reserved, not yet implemented)
    merkle_root          TEXT DEFAULT NULL,
    xrpl_tx_id           TEXT DEFAULT NULL,
    -- Workflow
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at          TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cases_status     ON cases(status);
  CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
`),i.prepare("PRAGMA table_info(cases)").all().some(e=>"raw_submission_hash"===e.name)||i.exec("ALTER TABLE cases ADD COLUMN raw_submission_hash TEXT"),e.s(["default",0,i])},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},96224,e=>{"use strict";var t=e.i(54799);function r(e){return t.default.createHash("sha256").update(e).digest("hex")}e.s(["generateCaseId",0,function(){let e=new Date().getFullYear(),r=t.default.randomBytes(4).toString("hex").toUpperCase();return`EVD-${e}-${r}`},"hashObject",0,function(e){return r(function e(t){return Array.isArray(t)?"["+t.map(e).join(",")+"]":null!==t&&"object"==typeof t?"{"+Object.keys(t).sort().map(r=>JSON.stringify(r)+":"+e(t[r])).join(",")+"}":JSON.stringify(t)}(e))},"sha256",0,r])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__12oex5y._.js.map