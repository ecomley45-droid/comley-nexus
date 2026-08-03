// Migration runner for the Postgres behind Supabase (SUPABASE_DB_URL).
//
// Applies db/schema.sql and db/schema_cms.sql as the base, then every file in
// db/migrations in filename order. What's already been applied is recorded in
// a `schema_migrations` table, so:
//   - a re-run does nothing instead of replaying 30 files and hoping every
//     one of them is still idempotent;
//   - a new migration is picked up automatically — there's no hand-maintained
//     list to forget to update (the old failure mode: write the file, deploy,
//     wonder why the column is missing);
//   - each file runs inside a transaction, so a half-applied migration rolls
//     back instead of leaving the schema in a shape nothing expects;
//   - a file edited after it was applied is reported, since the recorded
//     checksum no longer matches what's on disk.
//
// Usage:
//   npm run migrate              apply anything pending
//   npm run migrate -- --status  list applied/pending and exit
//   npm run migrate -- --force   re-run everything (all files are idempotent)

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has('--status');
const FORCE = args.has('--force');

const raw = process.env.SUPABASE_DB_URL;
if (!raw) {
  console.error('SUPABASE_DB_URL not set. Add it to .env.local.');
  process.exit(1);
}

// Parse the URL manually because Supabase-generated passwords often contain
// URL-special chars (`,`, `?`, `#`, `@`) that need percent-encoding but
// usually aren't. Passing each piece to pg.Client bypasses the URL parser.
const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/([^?]+)/);
if (!m) {
  console.error('SUPABASE_DB_URL not in expected postgres://user:pass@host:port/db shape');
  process.exit(1);
}
const [, user, password, host, port, database] = m;

// Base schema files first, then every migration in filename order. The
// numeric prefixes sort correctly while they stay zero-padded; the collator
// is explicit about that rather than relying on it.
const BASE = ['schema.sql', 'schema_cms.sql'];
const migrationsDir = path.join(__dirname, 'migrations');
const MIGRATIONS = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .map((f) => `migrations/${f}`);

const ALL = [...BASE, ...MIGRATIONS];
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);

const client = new pg.Client({
  user, password, host, port: Number(port), database,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query('select filename, checksum from schema_migrations');
  const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

  const drifted = ALL.filter((f) => applied.has(f) && applied.get(f) !== checksum(read(f)));
  const pending = FORCE ? ALL : ALL.filter((f) => !applied.has(f));

  if (STATUS_ONLY) {
    console.log(`applied: ${applied.size}   pending: ${pending.length}   files: ${ALL.length}`);
    for (const f of ALL) console.log(`  ${applied.has(f) ? '✓' : '·'} ${f}`);
    if (drifted.length) console.log(`\nedited after apply: ${drifted.join(', ')}`);
    process.exit(0);
  }

  // Editing an already-applied migration is how schemas silently diverge
  // between environments: this database has the old version, a fresh one gets
  // the new. Say so loudly rather than skipping in silence.
  if (drifted.length && !FORCE) {
    console.warn('[migrate] WARNING — these were edited after being applied:');
    for (const f of drifted) console.warn(`  ${f}`);
    console.warn('[migrate] a fresh database would get different SQL. Add a new migration instead.\n');
  }

  if (pending.length === 0) console.log('[migrate] up to date — nothing to apply.');

  for (const f of pending) {
    const sql = read(f);
    process.stdout.write(`[migrate] ${f} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        `insert into schema_migrations (filename, checksum) values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`,
        [f, checksum(sql)]
      );
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback');
      console.log('FAILED');
      console.error(`[migrate] ${f} rolled back: ${e.message}`);
      process.exit(1);
    }
  }

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  );
  console.log(`[migrate] done. ${tables.length} public tables.`);
} catch (e) {
  console.error('[migrate] ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
