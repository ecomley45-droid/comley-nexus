// Postgres-backed storage helpers. Same shape as the file-I/O helpers they
// replace (readJsonFile / writeJsonFile) — each "file" is one table, each
// exported fn returns/accepts the same shape the client already sends.
//
// All page/global-settings content HTML is sanitized *by the callers*
// before it reaches this file (see server.js — sanitizePage/sanitizeGlobalSettings).
// Storage does no sanitization; it's a dumb persistence layer.

import { query, one } from './db.js';

// ---------- Pages ----------
// Store as one row per page; content/seo/analytics/layout as JSONB. That
// lets us update a single page without a rewrite-the-world SELECT then
// DELETE-ALL-INSERT-ALL round trip.
export const pages = {
  async list() {
    const { rows } = await query(`
      select id, name, slug, parent_id, content, seo, status,
             scheduled_publish_at, analytics, layout
        from pages
       order by created_at asc
    `);
    // Map DB columns back to the camelCase shape the frontend uses.
    return rows.map(mapPageRowToDto);
  },
  async bulkReplace(nextPages) {
    // The client saves the entire pages array on every "Save" click, so we
    // upsert everything then delete rows whose ids weren't in the payload.
    // Done in a single transaction so a partial failure doesn't leave the
    // table half-migrated.
    const client = await (await import('./db.js')).getPool().connect();
    try {
      await client.query('begin');
      const seenIds = new Set(nextPages.map(p => p.id));
      for (const p of nextPages) {
        await client.query(`
          insert into pages (id, name, slug, parent_id, content, seo, status,
                             scheduled_publish_at, analytics, layout, updated_at)
          values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb, now())
          on conflict (id) do update set
            name = excluded.name,
            slug = excluded.slug,
            parent_id = excluded.parent_id,
            content = excluded.content,
            seo = excluded.seo,
            status = excluded.status,
            scheduled_publish_at = excluded.scheduled_publish_at,
            analytics = excluded.analytics,
            layout = excluded.layout,
            updated_at = now()
        `, [
          p.id,
          p.name || 'Untitled page',
          p.slug || '',
          p.parentId || null,
          JSON.stringify(p.content || []),
          JSON.stringify(p.seo || {}),
          p.status === 'published' ? 'published' : 'draft',
          p.scheduledPublishAt || null,
          JSON.stringify(p.analytics || {}),
          JSON.stringify(p.layout || {}),
        ]);
      }
      if (seenIds.size === 0) {
        await client.query('delete from pages');
      } else {
        await client.query(`delete from pages where id <> all($1::text[])`, [[...seenIds]]);
      }
      await client.query('commit');
      return await this.list();
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
  async applyScheduledPublishes() {
    // Flips any draft whose scheduled time has passed. Returns count of
    // pages flipped so the caller can audit-log it.
    const { rowCount } = await query(`
      update pages
         set status = 'published', scheduled_publish_at = null, updated_at = now()
       where status = 'draft'
         and scheduled_publish_at is not null
         and scheduled_publish_at <= $1
    `, [Date.now()]);
    return rowCount || 0;
  },
};

function mapPageRowToDto(r) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    content: r.content || [],
    seo: r.seo || { title: '', description: '', ogImage: '' },
    status: r.status,
    scheduledPublishAt: r.scheduled_publish_at || null,
    analytics: r.analytics || { headSnippet: '', bodySnippet: '' },
    layout: r.layout || {},
  };
}

// ---------- Page versions ----------
export const versions = {
  async listForPage(pageId) {
    const { rows } = await query(
      `select id, page_id, taken_at, snapshot
         from page_versions
        where page_id = $1
        order by taken_at desc`,
      [pageId]
    );
    return rows.map(r => ({
      id: r.id, pageId: r.page_id, timestamp: new Date(r.taken_at).getTime(), snapshot: r.snapshot,
    }));
  },
  async get(pageId, versionId) {
    const r = await one(
      `select id, page_id, taken_at, snapshot from page_versions where id = $1 and page_id = $2`,
      [versionId, pageId]
    );
    if (!r) return null;
    return { id: r.id, pageId: r.page_id, timestamp: new Date(r.taken_at).getTime(), snapshot: r.snapshot };
  },
  async snapshot(oldPages, newPages, maxPerPage = 20) {
    // Persist an "old-state" snapshot for every page that changed.
    let count = 0;
    for (const nu of newPages) {
      const old = oldPages.find(p => p.id === nu.id);
      if (!old) continue;
      if (JSON.stringify(old) === JSON.stringify(nu)) continue;
      count++;
      const id = 'ver-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      await query(
        `insert into page_versions (id, page_id, snapshot) values ($1,$2,$3::jsonb)`,
        [id, nu.id, JSON.stringify(old)]
      );
    }
    // Trim per-page history to the newest N snapshots.
    if (count > 0) {
      await query(`
        delete from page_versions
         where id in (
           select id from (
             select id, row_number() over (partition by page_id order by taken_at desc) rn
               from page_versions
           ) t where rn > $1
         )
      `, [maxPerPage]);
    }
    return count;
  },
};

// ---------- Library entries ----------
export const library = {
  async list() {
    const { rows } = await query(`select id, name, html from library_entries order by created_at asc`);
    return rows;
  },
  async bulkReplace(entries) {
    await query('begin');
    try {
      await query('delete from library_entries');
      for (const e of entries) {
        await query(
          `insert into library_entries (id, name, html) values ($1,$2,$3)`,
          [e.id || 'lib-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), e.name || '', e.html || '']
        );
      }
      await query('commit');
    } catch (e) {
      await query('rollback').catch(() => {});
      throw e;
    }
    return await this.list();
  },
};

// ---------- Redirects ----------
export const redirects = {
  async list() {
    const { rows } = await query(`select id, from_path as "from", to_path as "to", type from redirects order by created_at asc`);
    return rows;
  },
  async add({ id, from, to, type }) {
    await query(
      `insert into redirects (id, from_path, to_path, type) values ($1,$2,$3,$4)
       on conflict (from_path) do nothing`,
      [id, from, to, type]
    );
    return this.getByFrom(from);
  },
  async getByFrom(fromPath) {
    return one(`select id, from_path as "from", to_path as "to", type from redirects where from_path = $1`, [fromPath]);
  },
  async findMatch(requestPath) {
    return one(`select id, from_path as "from", to_path as "to", type from redirects where from_path = $1`, [requestPath]);
  },
  async remove(id) {
    const r = await one(`delete from redirects where id = $1 returning id, from_path as "from", to_path as "to"`, [id]);
    return r;
  },
};

// ---------- Section comments ----------
export const comments = {
  async list(pageId) {
    const sql = pageId
      ? `select id, page_id as "pageId", section_id as "sectionId", body as text, author, resolved, created_at from section_comments where page_id = $1 order by created_at`
      : `select id, page_id as "pageId", section_id as "sectionId", body as text, author, resolved, created_at from section_comments order by created_at`;
    const { rows } = pageId ? await query(sql, [pageId]) : await query(sql);
    return rows.map(r => ({ ...r, createdAt: new Date(r.created_at).getTime() }));
  },
  async add({ id, pageId, sectionId, text, author }) {
    await query(
      `insert into section_comments (id, page_id, section_id, body, author) values ($1,$2,$3,$4,$5)`,
      [id, pageId, sectionId, text, author]
    );
    return one(`select id, page_id as "pageId", section_id as "sectionId", body as text, author, resolved from section_comments where id = $1`, [id]);
  },
  async setResolved(id, resolved) {
    return one(`update section_comments set resolved = $1 where id = $2 returning id, page_id as "pageId", section_id as "sectionId", body as text, author, resolved`, [resolved, id]);
  },
  async remove(id) {
    await query(`delete from section_comments where id = $1`, [id]);
  },
};

// ---------- A/B stats ----------
export const abStats = {
  async forSection(sectionId) {
    const { rows } = await query(
      `select variant_id, impressions, clicks from ab_stats where section_id = $1`, [sectionId]
    );
    const out = {};
    for (const r of rows) out[r.variant_id] = { impressions: Number(r.impressions), clicks: Number(r.clicks) };
    return out;
  },
  async record(sectionId, variantId, field /* 'impressions' | 'clicks' */) {
    // Atomic upsert-and-increment. Beats "read → mutate → write" for
    // hot-path A/B tracking.
    const col = field === 'clicks' ? 'clicks' : 'impressions';
    await query(
      `insert into ab_stats (section_id, variant_id, ${col}) values ($1,$2,1)
       on conflict (section_id, variant_id) do update set ${col} = ab_stats.${col} + 1`,
      [sectionId, variantId]
    );
  },
};

// ---------- Team roster ----------
export const team = {
  async list() {
    const { rows } = await query(`select id, name, email, role, added_at from team_members order by added_at asc`);
    return rows.map(r => ({ ...r, addedAt: new Date(r.added_at).getTime() }));
  },
  async add({ id, name, email, role }) {
    await query(
      `insert into team_members (id, name, email, role) values ($1,$2,$3,$4)`,
      [id, name, email, role]
    );
    return one(`select id, name, email, role from team_members where id = $1`, [id]);
  },
  async remove(id) {
    const r = await one(`delete from team_members where id = $1 returning name, email`, [id]);
    return r;
  },
};

// ---------- Audit log ----------
export const audit = {
  async list(limit = 500) {
    const { rows } = await query(
      `select id, action, details, actor, created_at from audit_log order by created_at desc limit $1`,
      [limit]
    );
    return rows.map(r => ({
      id: r.id, action: r.action, details: r.details,
      timestamp: new Date(r.created_at).getTime(),
    }));
  },
  async append(action, details, actor = null) {
    const id = 'audit-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    await query(
      `insert into audit_log (id, action, details, actor) values ($1,$2,$3,$4)`,
      [id, action, details, actor]
    );
  },
};

// ---------- Media metadata (bytes go in Supabase Storage bucket) ----------
export const media = {
  async list() {
    const { rows } = await query(`select id, name, filename, mime_type as "mimeType", size, url, uploaded_at from media order by uploaded_at desc`);
    return rows.map(r => ({ ...r, uploadedAt: new Date(r.uploaded_at).getTime() }));
  },
  async add(entry) {
    await query(
      `insert into media (id, name, filename, mime_type, size, url) values ($1,$2,$3,$4,$5,$6)`,
      [entry.id, entry.name, entry.filename, entry.mimeType, entry.size, entry.url]
    );
    return entry;
  },
  async get(id) {
    return one(`select id, name, filename, mime_type as "mimeType", url from media where id = $1`, [id]);
  },
  async remove(id) {
    return one(`delete from media where id = $1 returning name, filename`, [id]);
  },
};

// ---------- Feedback tickets ----------
export const feedback = {
  async list() {
    const { rows } = await query(`
      select id, type, description, expected_behavior as "expectedBehavior",
             current_behavior as "currentBehavior", urgent, status, area, path,
             reported_role as "reportedRole", reported_by as "reportedBy",
             screenshot_url as "screenshotUrl", image_urls as "imageUrls",
             assignee_email, system_id,
             created_at, updated_at, resolved_at
        from feedback
       order by created_at desc
    `);
    return rows.map(r => ({
      ...r,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
      resolved_at: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
    }));
  },
  async add(entry) {
    await query(`
      insert into feedback (id, type, description, expected_behavior, current_behavior,
                            urgent, area, path, reported_role, reported_by,
                            screenshot_url, image_urls)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    `, [
      entry.id, entry.type, entry.description, entry.expectedBehavior || '',
      entry.currentBehavior || '', !!entry.urgent, entry.area || 'cms',
      entry.path || '', entry.reportedRole || null, entry.reportedBy || null,
      entry.screenshotUrl || null, JSON.stringify(entry.imageUrls || []),
    ]);
    return entry;
  },
  async updateStatus(id, status) {
    const isDone = status === 'resolved' || status === 'closed';
    return one(`
      update feedback
         set status = $1,
             updated_at = now(),
             resolved_at = case when $2 and resolved_at is null then now()
                                when not $2 then null else resolved_at end
       where id = $3
       returning id, type, status, updated_at, resolved_at
    `, [status, isDone, id]);
  },
  async updateAssignee(id, email) {
    return one(`update feedback set assignee_email = $1, updated_at = now() where id = $2 returning id, assignee_email`, [email, id]);
  },
  async updateSystem(id, systemId) {
    return one(`update feedback set system_id = $1, updated_at = now() where id = $2 returning id, system_id`, [systemId, id]);
  },
};

// ---------- Feedback comments (threaded, 60s edit window) ----------
export const feedbackComments = {
  async listForFeedback(feedbackId) {
    const { rows } = await query(`
      select id, feedback_id as "feedbackId", author_email as "authorEmail",
             body, created_at, edited_at, deleted_at
        from feedback_comments
       where feedback_id = $1 and deleted_at is null
       order by created_at asc
    `, [feedbackId]);
    return rows.map(r => ({
      ...r,
      createdAt: new Date(r.created_at).getTime(),
      editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null,
    }));
  },
  async get(id) {
    return one(`select id, feedback_id as "feedbackId", author_email as "authorEmail", body, created_at, edited_at, deleted_at from feedback_comments where id = $1`, [id]);
  },
  async add({ id, feedbackId, authorEmail, body }) {
    await query(
      `insert into feedback_comments (id, feedback_id, author_email, body) values ($1,$2,$3,$4)`,
      [id, feedbackId, authorEmail, body]
    );
    return this.get(id);
  },
  async edit(id, body) {
    return one(`update feedback_comments set body = $1, edited_at = now() where id = $2 returning id, body, edited_at`, [body, id]);
  },
  async softDelete(id) {
    return one(`update feedback_comments set deleted_at = now() where id = $1 returning id`, [id]);
  },
};

// ---------- Systems (ops board) ----------
export const systems = {
  async list() {
    const { rows } = await query(`select id, name, status, description, category from systems order by name`);
    return rows;
  },
};

// ---------- User preferences ----------
export const preferences = {
  async get(email) {
    const r = await one(`select user_email as "userEmail", view_mode as "viewMode", detail_mode as "detailMode", schedule_layout as "scheduleLayout", integrations, ai_settings as "aiSettings", updated_at from user_preferences where user_email = $1`, [email]);
    return r || {
      userEmail: email, viewMode: 'list', detailMode: 'panel',
      scheduleLayout: {}, integrations: {}, aiSettings: {},
    };
  },
  async patch(email, patch) {
    // Fetch, merge, upsert. Two-level shallow merge for ai_settings (per-
    // provider config keeps prior fields), one-level for integrations.
    const existing = await this.get(email);
    const next = { ...existing };
    if (patch.viewMode !== undefined) next.viewMode = patch.viewMode;
    if (patch.detailMode !== undefined) next.detailMode = patch.detailMode;
    if (patch.scheduleLayout) next.scheduleLayout = { ...(existing.scheduleLayout || {}), ...patch.scheduleLayout };
    if (patch.integrations) next.integrations = { ...(existing.integrations || {}), ...patch.integrations };
    if (patch.ai_settings || patch.aiSettings) {
      const incoming = patch.ai_settings || patch.aiSettings || {};
      const merged = { ...(existing.aiSettings || {}) };
      for (const [pid, cfg] of Object.entries(incoming)) {
        merged[pid] = { ...(merged[pid] || {}), ...(cfg || {}) };
      }
      next.aiSettings = merged;
    }
    await query(`
      insert into user_preferences (user_email, view_mode, detail_mode, schedule_layout, integrations, ai_settings, updated_at)
      values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb, now())
      on conflict (user_email) do update set
        view_mode = excluded.view_mode,
        detail_mode = excluded.detail_mode,
        schedule_layout = excluded.schedule_layout,
        integrations = excluded.integrations,
        ai_settings = excluded.ai_settings,
        updated_at = now()
    `, [email, next.viewMode, next.detailMode,
        JSON.stringify(next.scheduleLayout), JSON.stringify(next.integrations), JSON.stringify(next.aiSettings)]);
    return next;
  },
};

// ---------- Git pulls ----------
export const gitPulls = {
  async list(userEmail) {
    const sql = userEmail
      ? `select id, branch_id as "branchId", user_email as "userEmail", pulled_at from git_pulls where user_email = $1 order by pulled_at desc`
      : `select id, branch_id as "branchId", user_email as "userEmail", pulled_at from git_pulls order by pulled_at desc`;
    const { rows } = userEmail ? await query(sql, [userEmail]) : await query(sql);
    return rows.map(r => ({ ...r, pulledAt: new Date(r.pulled_at).getTime() }));
  },
  async record({ branchId, userEmail }) {
    const id = 'pull-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    await query(
      `insert into git_pulls (id, branch_id, user_email) values ($1,$2,$3)`,
      [id, branchId, userEmail]
    );
    return { id, branchId, userEmail, pulledAt: Date.now() };
  },
};

// ---------- Global settings (singleton row id=1) ----------
export const settings = {
  async get() {
    const r = await one(`
      select site_name as "siteName", theme, analytics, globals, favicon,
             default_og_image as "defaultOgImage", timezone, maintenance_mode as "maintenanceMode"
        from global_settings where id = 1
    `);
    return r || { siteName: 'Comley Builder', theme: {}, analytics: {}, globals: {} };
  },
  async replace(next) {
    await query(`
      update global_settings set
        site_name = $1,
        theme = $2::jsonb,
        analytics = $3::jsonb,
        globals = $4::jsonb,
        favicon = $5,
        default_og_image = $6,
        timezone = $7,
        maintenance_mode = $8,
        updated_at = now()
      where id = 1
    `, [
      next.siteName || 'Comley Builder',
      JSON.stringify(next.theme || {}),
      JSON.stringify(next.analytics || {}),
      JSON.stringify(next.globals || {}),
      next.favicon || null,
      next.defaultOgImage || null,
      next.timezone || 'UTC',
      !!next.maintenanceMode,
    ]);
    return this.get();
  },
};
