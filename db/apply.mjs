// One-shot: applies db/schema.sql then db/schema_cms.sql against the
// Postgres URL in SUPABASE_DB_URL. Idempotent — both files use IF NOT
// EXISTS everywhere, so re-runs are safe.
//
// Usage: node db/apply.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const raw = process.env.SUPABASE_DB_URL;
if (!raw) {
  console.error('SUPABASE_DB_URL not set. Add it to .env.local.');
  process.exit(1);
}

// Parse the URL manually because Supabase-generated passwords often
// contain URL-special chars (`,`, `?`, `#`, `@`) that need percent-encoding
// but usually aren't. Extracting each piece and passing them individually
// to pg.Client bypasses the URL parser entirely.
const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:/]+):(\d+)\/([^?]+)/);
if (!m) {
  console.error('SUPABASE_DB_URL not in expected postgres://user:pass@host:port/db shape');
  console.error('Got:', raw.slice(0, 30) + '...');
  process.exit(1);
}
const [, user, password, host, port, database] = m;

const client = new pg.Client({
  user,
  password,
  host,
  port: Number(port),
  database,
  ssl: { rejectUnauthorized: false },
});

const files = [
  'schema.sql',
  'schema_cms.sql',
  'migrations/001_prefs_jsonb.sql',
  'migrations/002_ops_columns.sql',
  'migrations/003_multi_tenant.sql',
  'migrations/004_split_nexus_platform.sql',
  'migrations/005_integration_api_keys.sql',
  'migrations/006_block_catalog.sql',
  'migrations/007_org_paused.sql',
  'migrations/008_script_block.sql',
  'migrations/009_layout_blocks.sql',
  'migrations/010_form_submissions.sql',
  'migrations/011_page_views.sql',
  'migrations/012_product_block.sql',
  'migrations/013_site_pages.sql',
  'migrations/014_site_backups.sql',
  'migrations/015_site_templates.sql',
  'migrations/016_template_installs.sql',
  'migrations/017_polished_blocks.sql',
  'migrations/018_more_blocks.sql',
  'migrations/019_parallax_video_blocks.sql',
  'migrations/020_events_blocks.sql',
  'migrations/021_events.sql',
];
// If you add a new migration, add it here so `node db/apply.mjs` picks
// it up. Order matters — migrations must remain idempotent.

try {
  await client.connect();
  console.log('[apply] connected');
  for (const f of files) {
    const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
    console.log(`[apply] running ${f} (${sql.length} chars)`);
    await client.query(sql);
    console.log(`[apply] ✓ ${f}`);
  }

  const { rows } = await client.query(`
    select table_name from information_schema.tables
     where table_schema = 'public'
     order by table_name
  `);
  console.log(`[apply] public tables (${rows.length}):`);
  console.log(rows.map(r => '  - ' + r.table_name).join('\n'));
} catch (e) {
  console.error('[apply] ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
