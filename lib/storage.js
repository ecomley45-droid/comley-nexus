// Supabase-JS-backed storage helpers. Same shape as the file-I/O helpers
// they replaced. Every write is a single PostgREST call — no client-side
// transactions, so bulk operations (like pages.bulkReplace) are structured
// so a partial failure leaves an easy-to-recover state (upserts + one
// targeted delete).

import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[storage/${msg}] ${error.message}`);
};

// ---------- Pages ----------
function rowToPage(r) {
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
function pageToRow(p) {
  return {
    id: p.id,
    name: p.name || 'Untitled page',
    slug: p.slug || '',
    parent_id: p.parentId || null,
    content: p.content || [],
    seo: p.seo || {},
    status: p.status === 'published' ? 'published' : 'draft',
    scheduled_publish_at: p.scheduledPublishAt || null,
    analytics: p.analytics || {},
    layout: p.layout || {},
    updated_at: new Date().toISOString(),
  };
}

export const pages = {
  async list() {
    const { data, error } = await db()
      .from('pages')
      .select('id, name, slug, parent_id, content, seo, status, scheduled_publish_at, analytics, layout')
      .order('created_at', { ascending: true });
    throwOn('pages.list', error);
    return (data || []).map(rowToPage);
  },
  async bulkReplace(nextPages) {
    // Upsert everything first, then delete rows whose ids are not in the
    // payload. Not atomic across the two calls — an error between them
    // leaves extra rows around, which is preferable to losing data.
    if (nextPages.length > 0) {
      const { error } = await db()
        .from('pages')
        .upsert(nextPages.map(pageToRow), { onConflict: 'id' });
      throwOn('pages.upsert', error);
    }
    const keepIds = nextPages.map((p) => p.id);
    if (keepIds.length === 0) {
      // No pages left — wipe the table entirely.
      const { error } = await db().from('pages').delete().not('id', 'is', null);
      throwOn('pages.wipe', error);
    } else {
      const { error } = await db().from('pages').delete().not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
      throwOn('pages.trim', error);
    }
    return this.list();
  },
  async applyScheduledPublishes() {
    const now = Date.now();
    // Two steps: find due drafts (small result set), then update them by id.
    const { data, error } = await db()
      .from('pages')
      .select('id')
      .eq('status', 'draft')
      .not('scheduled_publish_at', 'is', null)
      .lte('scheduled_publish_at', now);
    throwOn('pages.findDue', error);
    if (!data || data.length === 0) return 0;
    const ids = data.map((r) => r.id);
    const { error: e2 } = await db()
      .from('pages')
      .update({ status: 'published', scheduled_publish_at: null, updated_at: new Date().toISOString() })
      .in('id', ids);
    throwOn('pages.flipDue', e2);
    return ids.length;
  },
};

// ---------- Page versions ----------
export const versions = {
  async listForPage(pageId) {
    const { data, error } = await db()
      .from('page_versions')
      .select('id, page_id, taken_at, snapshot')
      .eq('page_id', pageId)
      .order('taken_at', { ascending: false });
    throwOn('versions.listForPage', error);
    return (data || []).map((r) => ({
      id: r.id, pageId: r.page_id,
      timestamp: new Date(r.taken_at).getTime(),
      snapshot: r.snapshot,
    }));
  },
  async get(pageId, versionId) {
    const { data, error } = await db()
      .from('page_versions')
      .select('id, page_id, taken_at, snapshot')
      .eq('page_id', pageId).eq('id', versionId).maybeSingle();
    throwOn('versions.get', error);
    if (!data) return null;
    return {
      id: data.id, pageId: data.page_id,
      timestamp: new Date(data.taken_at).getTime(),
      snapshot: data.snapshot,
    };
  },
  async snapshot(oldPages, newPages, maxPerPage = 20) {
    const rows = [];
    for (const nu of newPages) {
      const old = oldPages.find((p) => p.id === nu.id);
      if (!old) continue;
      if (JSON.stringify(old) === JSON.stringify(nu)) continue;
      rows.push({
        id: 'ver-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        page_id: nu.id,
        snapshot: old,
      });
    }
    if (rows.length === 0) return 0;
    const { error } = await db().from('page_versions').insert(rows);
    throwOn('versions.snapshot', error);

    // Best-effort trim: fetch per-page ids and delete the older ones.
    // Called on save so it's not on a hot path.
    for (const nu of newPages) {
      const { data } = await db()
        .from('page_versions')
        .select('id')
        .eq('page_id', nu.id)
        .order('taken_at', { ascending: false })
        .range(maxPerPage, maxPerPage + 1000);
      if (data && data.length > 0) {
        await db().from('page_versions').delete().in('id', data.map((v) => v.id));
      }
    }
    return rows.length;
  },
};

// ---------- Library ----------
export const library = {
  async list() {
    const { data, error } = await db()
      .from('library_entries')
      .select('id, name, html')
      .order('created_at', { ascending: true });
    throwOn('library.list', error);
    return data || [];
  },
  async bulkReplace(entries) {
    const rows = entries.map((e) => ({
      id: e.id || 'lib-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: e.name || '',
      html: e.html || '',
    }));
    // Wipe + insert; library entries have no cross-references so no
    // FK cascades to worry about.
    const { error: wipeErr } = await db().from('library_entries').delete().not('id', 'is', null);
    throwOn('library.wipe', wipeErr);
    if (rows.length > 0) {
      const { error } = await db().from('library_entries').insert(rows);
      throwOn('library.insert', error);
    }
    return this.list();
  },
};

// ---------- Redirects ----------
export const redirects = {
  async list() {
    const { data, error } = await db()
      .from('redirects')
      .select('id, from_path, to_path, type')
      .order('created_at', { ascending: true });
    throwOn('redirects.list', error);
    return (data || []).map((r) => ({ id: r.id, from: r.from_path, to: r.to_path, type: r.type }));
  },
  async add({ id, from, to, type }) {
    const { error } = await db().from('redirects').insert({
      id, from_path: from, to_path: to, type,
    });
    throwOn('redirects.add', error);
    return this.getByFrom(from);
  },
  async getByFrom(fromPath) {
    const { data, error } = await db()
      .from('redirects')
      .select('id, from_path, to_path, type')
      .eq('from_path', fromPath).maybeSingle();
    throwOn('redirects.getByFrom', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path, type: data.type } : null;
  },
  async findMatch(requestPath) { return this.getByFrom(requestPath); },
  async remove(id) {
    const { data, error } = await db()
      .from('redirects')
      .delete()
      .eq('id', id)
      .select('id, from_path, to_path')
      .maybeSingle();
    throwOn('redirects.remove', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path } : null;
  },
};

// ---------- Section comments ----------
export const comments = {
  async list(pageId) {
    let q = db().from('section_comments').select('id, page_id, section_id, body, author, resolved, created_at').order('created_at', { ascending: true });
    if (pageId) q = q.eq('page_id', pageId);
    const { data, error } = await q;
    throwOn('comments.list', error);
    return (data || []).map((r) => ({
      id: r.id, pageId: r.page_id, sectionId: r.section_id,
      text: r.body, author: r.author, resolved: r.resolved,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },
  async add({ id, pageId, sectionId, text, author }) {
    const { data, error } = await db().from('section_comments')
      .insert({ id, page_id: pageId, section_id: sectionId, body: text, author })
      .select('id, page_id, section_id, body, author, resolved').maybeSingle();
    throwOn('comments.add', error);
    return {
      id: data.id, pageId: data.page_id, sectionId: data.section_id,
      text: data.body, author: data.author, resolved: data.resolved,
    };
  },
  async setResolved(id, resolved) {
    const { data, error } = await db().from('section_comments')
      .update({ resolved }).eq('id', id)
      .select('id, page_id, section_id, body, author, resolved').maybeSingle();
    throwOn('comments.setResolved', error);
    if (!data) return null;
    return {
      id: data.id, pageId: data.page_id, sectionId: data.section_id,
      text: data.body, author: data.author, resolved: data.resolved,
    };
  },
  async remove(id) {
    const { error } = await db().from('section_comments').delete().eq('id', id);
    throwOn('comments.remove', error);
  },
};

// ---------- A/B stats ----------
export const abStats = {
  async forSection(sectionId) {
    const { data, error } = await db()
      .from('ab_stats').select('variant_id, impressions, clicks')
      .eq('section_id', sectionId);
    throwOn('abStats.forSection', error);
    const out = {};
    for (const r of data || []) out[r.variant_id] = { impressions: Number(r.impressions), clicks: Number(r.clicks) };
    return out;
  },
  async record(sectionId, variantId, field /* 'impressions' | 'clicks' */) {
    // Two-step (read → increment → upsert). Not truly atomic, but A/B
    // counts don't require perfect accuracy — a lost bump under high
    // concurrency is acceptable.
    const { data, error } = await db().from('ab_stats')
      .select('impressions, clicks')
      .eq('section_id', sectionId).eq('variant_id', variantId).maybeSingle();
    throwOn('abStats.record.read', error);
    const row = {
      section_id: sectionId,
      variant_id: variantId,
      impressions: (data?.impressions || 0) + (field === 'impressions' ? 1 : 0),
      clicks: (data?.clicks || 0) + (field === 'clicks' ? 1 : 0),
    };
    const { error: e2 } = await db().from('ab_stats').upsert(row, { onConflict: 'section_id,variant_id' });
    throwOn('abStats.record.write', e2);
  },
};

// ---------- Team roster ----------
export const team = {
  async list() {
    const { data, error } = await db().from('team_members')
      .select('id, name, email, role, added_at')
      .order('added_at', { ascending: true });
    throwOn('team.list', error);
    return (data || []).map((r) => ({ ...r, addedAt: new Date(r.added_at).getTime() }));
  },
  async add({ id, name, email, role }) {
    const { data, error } = await db().from('team_members')
      .insert({ id, name, email, role })
      .select('id, name, email, role').maybeSingle();
    throwOn('team.add', error);
    return data;
  },
  async remove(id) {
    const { data, error } = await db().from('team_members')
      .delete().eq('id', id)
      .select('name, email').maybeSingle();
    throwOn('team.remove', error);
    return data;
  },
};

// ---------- Audit log ----------
export const audit = {
  async list(limit = 500) {
    const { data, error } = await db().from('audit_log')
      .select('id, action, details, actor, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    throwOn('audit.list', error);
    return (data || []).map((r) => ({
      id: r.id, action: r.action, details: r.details,
      timestamp: new Date(r.created_at).getTime(),
    }));
  },
  async append(action, details, actor = null) {
    const id = 'audit-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const { error } = await db().from('audit_log').insert({ id, action, details, actor });
    throwOn('audit.append', error);
  },
};

// ---------- Media metadata ----------
export const media = {
  async list() {
    const { data, error } = await db().from('media')
      .select('id, name, filename, mime_type, size, url, uploaded_at')
      .order('uploaded_at', { ascending: false });
    throwOn('media.list', error);
    return (data || []).map((r) => ({
      id: r.id, name: r.name, filename: r.filename,
      mimeType: r.mime_type, size: r.size, url: r.url,
      uploadedAt: new Date(r.uploaded_at).getTime(),
    }));
  },
  async add(entry) {
    const { error } = await db().from('media').insert({
      id: entry.id, name: entry.name, filename: entry.filename,
      mime_type: entry.mimeType, size: entry.size, url: entry.url,
    });
    throwOn('media.add', error);
    return entry;
  },
  async get(id) {
    const { data, error } = await db().from('media')
      .select('id, name, filename, mime_type, url').eq('id', id).maybeSingle();
    throwOn('media.get', error);
    return data ? { ...data, mimeType: data.mime_type } : null;
  },
  async remove(id) {
    const { data, error } = await db().from('media')
      .delete().eq('id', id)
      .select('name, filename').maybeSingle();
    throwOn('media.remove', error);
    return data;
  },
};

// ---------- Feedback tickets ----------
function rowToFeedback(t) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    urgent: !!t.urgent,
    description: t.description,
    expectedBehavior: t.expected_behavior,
    currentBehavior: t.current_behavior,
    area: t.area,
    path: t.path,
    reportedRole: t.reported_role,
    reportedBy: t.reported_by,
    screenshotUrl: t.screenshot_url,
    imageUrls: t.image_urls || [],
    assignee_email: t.assignee_email || null,
    assignee_name: t.assignee_name || null,
    assignee_image: t.assignee_image || null,
    system_id: t.system_id || null,
    createdAt: new Date(t.created_at).getTime(),
    updatedAt: new Date(t.updated_at).getTime(),
    resolved_at: t.resolved_at ? new Date(t.resolved_at).getTime() : null,
  };
}

export const feedback = {
  async list() {
    const { data, error } = await db().from('feedback')
      .select('*').order('created_at', { ascending: false });
    throwOn('feedback.list', error);
    return (data || []).map(rowToFeedback);
  },
  async get(id) {
    const { data, error } = await db().from('feedback')
      .select('*').eq('id', id).maybeSingle();
    throwOn('feedback.get', error);
    return data ? rowToFeedback(data) : null;
  },
  async add(entry) {
    const { error } = await db().from('feedback').insert({
      id: entry.id, type: entry.type, description: entry.description,
      expected_behavior: entry.expectedBehavior || '',
      current_behavior: entry.currentBehavior || '',
      urgent: !!entry.urgent, area: entry.area || 'cms',
      path: entry.path || '', reported_role: entry.reportedRole,
      reported_by: entry.reportedBy, screenshot_url: entry.screenshotUrl,
      image_urls: entry.imageUrls || [],
    });
    throwOn('feedback.add', error);
    return entry;
  },
  async updateStatus(id, status) {
    const isDone = status === 'resolved' || status === 'closed';
    const patch = {
      status, updated_at: new Date().toISOString(),
    };
    if (isDone) {
      // Only set resolved_at on first transition to a done state.
      const cur = await this.get(id);
      if (cur && !cur.resolved_at) patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_at = null;
    }
    const { data, error } = await db().from('feedback')
      .update(patch).eq('id', id)
      .select('id, type, status, updated_at, resolved_at').maybeSingle();
    throwOn('feedback.updateStatus', error);
    return data;
  },
  async updateAssignee(id, email, name = null, image = null) {
    const { data, error } = await db().from('feedback')
      .update({
        assignee_email: email, assignee_name: name, assignee_image: image,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).select('*').maybeSingle();
    throwOn('feedback.updateAssignee', error);
    return data ? rowToFeedback(data) : null;
  },
  async updateSystem(id, systemId) {
    const { data, error } = await db().from('feedback')
      .update({ system_id: systemId, updated_at: new Date().toISOString() })
      .eq('id', id).select('*').maybeSingle();
    throwOn('feedback.updateSystem', error);
    return data ? rowToFeedback(data) : null;
  },
};

// ---------- Feedback comments ----------
export const feedbackComments = {
  async listForFeedback(feedbackId) {
    const { data, error } = await db().from('feedback_comments')
      .select('id, feedback_id, author_email, body, created_at, edited_at, deleted_at')
      .eq('feedback_id', feedbackId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    throwOn('feedbackComments.listForFeedback', error);
    return (data || []).map((r) => ({
      id: r.id, feedbackId: r.feedback_id, authorEmail: r.author_email,
      body: r.body,
      created_at: r.created_at,
      createdAt: new Date(r.created_at).getTime(),
      editedAt: r.edited_at ? new Date(r.edited_at).getTime() : null,
    }));
  },
  async get(id) {
    const { data, error } = await db().from('feedback_comments')
      .select('id, feedback_id, author_email, body, created_at, edited_at, deleted_at')
      .eq('id', id).maybeSingle();
    throwOn('feedbackComments.get', error);
    if (!data) return null;
    return {
      id: data.id, feedbackId: data.feedback_id, authorEmail: data.author_email,
      body: data.body,
      created_at: data.created_at,
      deleted_at: data.deleted_at,
    };
  },
  async add({ id, feedbackId, authorEmail, body }) {
    const { error } = await db().from('feedback_comments').insert({
      id, feedback_id: feedbackId, author_email: authorEmail, body,
    });
    throwOn('feedbackComments.add', error);
    return this.get(id);
  },
  async edit(id, body) {
    const { data, error } = await db().from('feedback_comments')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', id).select('id, body, edited_at').maybeSingle();
    throwOn('feedbackComments.edit', error);
    return data;
  },
  async softDelete(id) {
    const { data, error } = await db().from('feedback_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id).select('id').maybeSingle();
    throwOn('feedbackComments.softDelete', error);
    return data;
  },
};

// ---------- Systems ----------
export const systems = {
  async list() {
    const { data, error } = await db().from('systems')
      .select('id, name, status, description, category')
      .order('name', { ascending: true });
    throwOn('systems.list', error);
    return data || [];
  },
  async listOrdered() {
    const { data, error } = await db().from('systems')
      .select('id, name, status, description, category, display_order, product')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('systems.listOrdered', error);
    return (data || []).map((r) => ({ ...r, display_order: r.display_order ?? 0, product: r.product || 'Other' }));
  },
};

// ---------- User preferences ----------
export const preferences = {
  async get(email) {
    const { data, error } = await db().from('user_preferences')
      .select('prefs').eq('user_email', email).maybeSingle();
    throwOn('preferences.get', error);
    return data?.prefs || {};
  },
  async all() {
    const { data, error } = await db().from('user_preferences')
      .select('user_email, prefs');
    throwOn('preferences.all', error);
    const out = {};
    for (const row of data || []) out[row.user_email] = row.prefs || {};
    return out;
  },
  async patch(email, patch) {
    const existing = await this.get(email);
    const next = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'integrations' && value && typeof value === 'object') {
        next.integrations = { ...(existing.integrations || {}), ...value };
      } else if (key === 'ai_settings' && value && typeof value === 'object') {
        const merged = { ...(existing.ai_settings || {}) };
        for (const [pid, cfg] of Object.entries(value)) {
          merged[pid] = { ...(merged[pid] || {}), ...(cfg || {}) };
        }
        next.ai_settings = merged;
      } else {
        next[key] = value;
      }
    }
    const { error } = await db().from('user_preferences')
      .upsert({ user_email: email, prefs: next, updated_at: new Date().toISOString() }, { onConflict: 'user_email' });
    throwOn('preferences.patch', error);
    return next;
  },
};

// ---------- Repos + branches ----------
export const repos = {
  async listWithBranches() {
    const { data: reposData, error: e1 } = await db().from('repos')
      .select('id, name, url, platform, display_order')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('repos.listWithBranches', e1);
    const { data: branchesData, error: e2 } = await db().from('repo_branches')
      .select('id, repo_id, name, display_order, last_pulled_by_email, last_pulled_by_name, last_pulled_at')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('branches.list', e2);
    return {
      repos: (reposData || []).map((r) => ({ ...r, platform: r.platform || 'GitHub', display_order: r.display_order ?? 0 })),
      branches: (branchesData || []).map((b) => ({ ...b, display_order: b.display_order ?? 0 })),
    };
  },
  async findBranch(id) {
    const { data, error } = await db().from('repo_branches')
      .select('id, repo_id, name').eq('id', id).maybeSingle();
    throwOn('repos.findBranch', error);
    return data;
  },
  async touchBranch(id, { email, name }) {
    const { data, error } = await db().from('repo_branches')
      .update({
        last_pulled_by_email: email,
        last_pulled_by_name: name,
        last_pulled_at: new Date().toISOString(),
      }).eq('id', id).select('*').maybeSingle();
    throwOn('repos.touchBranch', error);
    if (!data) return null;
    return {
      ...data,
      last_pulled_at: data.last_pulled_at ? new Date(data.last_pulled_at).getTime() : null,
    };
  },
};

// ---------- Git pulls ----------
export const gitPulls = {
  async list(userEmail) {
    let q = db().from('git_pulls').select('id, branch_id, user_email, pulled_at').order('pulled_at', { ascending: false });
    if (userEmail) q = q.eq('user_email', userEmail);
    const { data, error } = await q;
    throwOn('gitPulls.list', error);
    return (data || []).map((r) => ({
      id: r.id, branchId: r.branch_id, userEmail: r.user_email,
      pulledAt: new Date(r.pulled_at).getTime(),
    }));
  },
  async record({ branchId, userEmail }) {
    const id = 'pull-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const { error } = await db().from('git_pulls').insert({
      id, branch_id: branchId, user_email: userEmail,
    });
    throwOn('gitPulls.record', error);
    return { id, branchId, userEmail, pulledAt: Date.now() };
  },
};

// ---------- Global settings (singleton row id=1) ----------
export const settings = {
  async get() {
    const { data, error } = await db().from('global_settings')
      .select('site_name, theme, analytics, globals, favicon, default_og_image, timezone, maintenance_mode')
      .eq('id', 1).maybeSingle();
    throwOn('settings.get', error);
    if (!data) return { siteName: 'Comley Builder', theme: {}, analytics: {}, globals: {} };
    return {
      siteName: data.site_name,
      theme: data.theme || {},
      analytics: data.analytics || {},
      globals: data.globals || {},
      favicon: data.favicon,
      defaultOgImage: data.default_og_image,
      timezone: data.timezone,
      maintenanceMode: data.maintenance_mode,
    };
  },
  async replace(next) {
    const { error } = await db().from('global_settings').update({
      site_name: next.siteName || 'Comley Builder',
      theme: next.theme || {},
      analytics: next.analytics || {},
      globals: next.globals || {},
      favicon: next.favicon || null,
      default_og_image: next.defaultOgImage || null,
      timezone: next.timezone || 'UTC',
      maintenance_mode: !!next.maintenanceMode,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    throwOn('settings.replace', error);
    return this.get();
  },
};
