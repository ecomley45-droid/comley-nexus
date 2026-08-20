// Supabase-JS-backed storage helpers. Every collection is tenant-scoped:
// callers pass an `orgId` argument, and every SELECT/INSERT/UPDATE/DELETE
// filters or defaults by that org_id. server.js and lib/ops/routes.js
// derive orgId from `req.org.id` which is set by resolveViewer() in
// lib/auth.js — clients never provide it directly.

import { db } from './db.js';
import { mediaCols, mediaHasVariants, markVariantsMissing, isMissingVariantColumn } from './mediaColumns.js';
import { getOrgFlags, getFlagsForOrgs, setOrgFlags, removeOrgFlags } from './coreFlags.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[storage/${msg}] ${error.message}`);
};

const assertOrg = (orgId, ctx) => {
  if (!orgId) throw new Error(`[storage/${ctx}] orgId is required`);
  return orgId;
};

// ---------- Pages ----------
// editorMode/fullHtml (the per-page Full HTML mode) ride inside the
// `layout` jsonb column rather than their own columns -- adding columns
// would break every save between deploy and the user running a migration,
// while a jsonb stowaway is backward/forward compatible with zero
// migration. The mappers lift them in/out so the rest of the app sees
// them as normal top-level page fields.
function rowToPage(r) {
  const { editorMode, fullHtml, draft, ...layout } = r.layout || {};
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    // Optimistic-concurrency token. The client echoes the value it loaded
    // back on save; a mismatch means someone else wrote this page in the
    // meantime, and the write is refused rather than silently overwriting
    // them (see pages.detectConflicts).
    updatedAt: r.updated_at || null,
    content: r.content || [],
    editorMode: editorMode || 'blocks',
    fullHtml: fullHtml || '',
    // Pending, unpublished changes on a live page -- see
    // src/shared/pageDrafts.js. Stowed in the layout jsonb for the same
    // reason editorMode/fullHtml are: no migration needed, and a deploy
    // can't get ahead of the schema.
    ...(draft ? { draft } : {}),
    seo: r.seo || { title: '', description: '', ogImage: '' },
    status: r.status,
    scheduledPublishAt: r.scheduled_publish_at || null,
    analytics: r.analytics || { headSnippet: '', bodySnippet: '' },
    layout,
  };
}
function pageToRow(p, orgId) {
  return {
    id: p.id,
    org_id: orgId,
    name: p.name || 'Untitled page',
    slug: p.slug || '',
    parent_id: p.parentId || null,
    content: p.content || [],
    seo: p.seo || {},
    status: p.status === 'published' ? 'published' : 'draft',
    scheduled_publish_at: p.scheduledPublishAt || null,
    analytics: p.analytics || {},
    // See rowToPage: editorMode/fullHtml stow away inside layout jsonb.
    layout: {
      ...(p.layout || {}),
      ...(p.editorMode && p.editorMode !== 'blocks' ? { editorMode: p.editorMode } : {}),
      ...(p.fullHtml ? { fullHtml: p.fullHtml } : {}),
      ...(p.draft && Object.keys(p.draft).length ? { draft: p.draft } : {}),
    },
    updated_at: new Date().toISOString(),
  };
}

export const pages = {
  async list(orgId) {
    assertOrg(orgId, 'pages.list');
    const { data, error } = await db()
      .from('pages')
      .select('id, name, slug, parent_id, content, seo, status, scheduled_publish_at, analytics, layout, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    throwOn('pages.list', error);
    return (data || []).map(rowToPage);
  },
  // Which of the incoming pages have been written by someone else since the
  // client loaded them. Returns [{ id, name, mine, theirs }] -- empty when
  // the save is safe. A page the client didn't send an updatedAt for (a
  // brand-new page, or an older client) is never reported: there's nothing
  // to conflict with.
  async detectConflicts(orgId, incomingPages) {
    assertOrg(orgId, 'pages.detectConflicts');
    const withToken = (incomingPages || []).filter((p) => p && p.id && p.updatedAt);
    if (withToken.length === 0) return [];
    const { data, error } = await db()
      .from('pages')
      .select('id, name, updated_at')
      .eq('org_id', orgId)
      .in('id', withToken.map((p) => p.id));
    throwOn('pages.detectConflicts', error);
    const stored = new Map((data || []).map((r) => [r.id, r]));
    return withToken.flatMap((p) => {
      const row = stored.get(p.id);
      if (!row || !row.updated_at) return [];
      // String compare is safe: both sides are ISO-8601 UTC from Postgres.
      if (new Date(row.updated_at).getTime() <= new Date(p.updatedAt).getTime()) return [];
      return [{ id: p.id, name: row.name || p.name || 'Untitled page', mine: p.updatedAt, theirs: row.updated_at }];
    });
  },

  // `knownIds` is the set of page ids the client had loaded. Deletions are
  // computed against that set rather than "everything in the org", so a page
  // created in another tab (or by a template install) after this client
  // loaded is left alone instead of being wiped by a stale save. Omitted =>
  // legacy behavior, where the incoming array is authoritative.
  async bulkReplace(orgId, nextPages, { knownIds = null } = {}) {
    assertOrg(orgId, 'pages.bulkReplace');
    if (nextPages.length > 0) {
      const { error } = await db()
        .from('pages')
        .upsert(nextPages.map((p) => pageToRow(p, orgId)), { onConflict: 'id' });
      throwOn('pages.upsert', error);
    }
    const keepIds = new Set(nextPages.map((p) => p.id));
    if (Array.isArray(knownIds)) {
      const drop = knownIds.filter((id) => !keepIds.has(id));
      if (drop.length > 0) {
        const { error } = await db()
          .from('pages')
          .delete()
          .eq('org_id', orgId)
          .in('id', drop);
        throwOn('pages.trim', error);
      }
    } else if (keepIds.size === 0) {
      const { error } = await db().from('pages').delete().eq('org_id', orgId);
      throwOn('pages.wipe', error);
    } else {
      // Delete only rows in this org that are not in keepIds.
      const { error } = await db()
        .from('pages')
        .delete()
        .eq('org_id', orgId)
        .not('id', 'in', `(${[...keepIds].map((id) => `"${id}"`).join(',')})`);
      throwOn('pages.trim', error);
    }
    return this.list(orgId);
  },
  async applyScheduledPublishes(orgId) {
    assertOrg(orgId, 'pages.applyScheduledPublishes');
    const now = Date.now();
    const { data, error } = await db()
      .from('pages')
      .select('id')
      .eq('org_id', orgId)
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
  // Look up a page by request path across ALL orgs. Only used by the
  // public dynamic route render; the caller resolves which org it
  // belongs to via the domain / path prefix (future work). For now,
  // published pages in the 'admin' org are the public site.
  async listForDynamicRender(orgId) { return this.list(orgId); },
};

// ---------- Page versions ----------
export const versions = {
  async listForPage(orgId, pageId) {
    assertOrg(orgId, 'versions.listForPage');
    const { data, error } = await db()
      .from('page_versions')
      .select('id, page_id, taken_at, snapshot')
      .eq('org_id', orgId).eq('page_id', pageId)
      .order('taken_at', { ascending: false });
    throwOn('versions.listForPage', error);
    return (data || []).map((r) => ({
      id: r.id, pageId: r.page_id,
      timestamp: new Date(r.taken_at).getTime(),
      snapshot: r.snapshot,
    }));
  },
  async get(orgId, pageId, versionId) {
    assertOrg(orgId, 'versions.get');
    const { data, error } = await db()
      .from('page_versions')
      .select('id, page_id, taken_at, snapshot')
      .eq('org_id', orgId).eq('page_id', pageId).eq('id', versionId).maybeSingle();
    throwOn('versions.get', error);
    if (!data) return null;
    return {
      id: data.id, pageId: data.page_id,
      timestamp: new Date(data.taken_at).getTime(),
      snapshot: data.snapshot,
    };
  },
  async snapshot(orgId, oldPages, newPages, maxPerPage = 20) {
    assertOrg(orgId, 'versions.snapshot');
    const rows = [];
    for (const nu of newPages) {
      const old = oldPages.find((p) => p.id === nu.id);
      if (!old) continue;
      if (JSON.stringify(old) === JSON.stringify(nu)) continue;
      rows.push({
        id: 'ver-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        org_id: orgId,
        page_id: nu.id,
        snapshot: old,
      });
    }
    if (rows.length === 0) return 0;
    const { error } = await db().from('page_versions').insert(rows);
    throwOn('versions.snapshot', error);

    for (const nu of newPages) {
      const { data } = await db()
        .from('page_versions')
        .select('id')
        .eq('org_id', orgId).eq('page_id', nu.id)
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
  async list(orgId) {
    assertOrg(orgId, 'library.list');
    const { data, error } = await db()
      .from('library_entries')
      .select('id, name, html')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    throwOn('library.list', error);
    return data || [];
  },
  async bulkReplace(orgId, entries) {
    assertOrg(orgId, 'library.bulkReplace');
    const rows = entries.map((e) => ({
      id: e.id || 'lib-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      org_id: orgId,
      name: e.name || '',
      html: e.html || '',
    }));
    const { error: wipeErr } = await db().from('library_entries').delete().eq('org_id', orgId);
    throwOn('library.wipe', wipeErr);
    if (rows.length > 0) {
      const { error } = await db().from('library_entries').insert(rows);
      throwOn('library.insert', error);
    }
    return this.list(orgId);
  },
};

// ---------- Redirects ----------
export const redirects = {
  async list(orgId) {
    assertOrg(orgId, 'redirects.list');
    const { data, error } = await db()
      .from('redirects')
      .select('id, from_path, to_path, type')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    throwOn('redirects.list', error);
    return (data || []).map((r) => ({ id: r.id, from: r.from_path, to: r.to_path, type: r.type }));
  },
  async add(orgId, { id, from, to, type }) {
    assertOrg(orgId, 'redirects.add');
    const { error } = await db().from('redirects').insert({
      id, org_id: orgId, from_path: from, to_path: to, type,
    });
    throwOn('redirects.add', error);
    return this.getByFrom(orgId, from);
  },
  async getByFrom(orgId, fromPath) {
    assertOrg(orgId, 'redirects.getByFrom');
    const { data, error } = await db()
      .from('redirects')
      .select('id, from_path, to_path, type')
      .eq('org_id', orgId).eq('from_path', fromPath).maybeSingle();
    throwOn('redirects.getByFrom', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path, type: data.type } : null;
  },
  async findMatch(orgId, requestPath) { return this.getByFrom(orgId, requestPath); },
  async remove(orgId, id) {
    assertOrg(orgId, 'redirects.remove');
    const { data, error } = await db()
      .from('redirects')
      .delete()
      .eq('org_id', orgId).eq('id', id)
      .select('id, from_path, to_path')
      .maybeSingle();
    throwOn('redirects.remove', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path } : null;
  },
};

// ---------- Section comments ----------
export const comments = {
  async list(orgId, pageId) {
    assertOrg(orgId, 'comments.list');
    let q = db().from('section_comments').select('id, page_id, section_id, body, author, resolved, created_at').eq('org_id', orgId).order('created_at', { ascending: true });
    if (pageId) q = q.eq('page_id', pageId);
    const { data, error } = await q;
    throwOn('comments.list', error);
    return (data || []).map((r) => ({
      id: r.id, pageId: r.page_id, sectionId: r.section_id,
      text: r.body, author: r.author, resolved: r.resolved,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },
  async add(orgId, { id, pageId, sectionId, text, author }) {
    assertOrg(orgId, 'comments.add');
    const { data, error } = await db().from('section_comments')
      .insert({ id, org_id: orgId, page_id: pageId, section_id: sectionId, body: text, author })
      .select('id, page_id, section_id, body, author, resolved').maybeSingle();
    throwOn('comments.add', error);
    return {
      id: data.id, pageId: data.page_id, sectionId: data.section_id,
      text: data.body, author: data.author, resolved: data.resolved,
    };
  },
  async setResolved(orgId, id, resolved) {
    assertOrg(orgId, 'comments.setResolved');
    const { data, error } = await db().from('section_comments')
      .update({ resolved }).eq('org_id', orgId).eq('id', id)
      .select('id, page_id, section_id, body, author, resolved').maybeSingle();
    throwOn('comments.setResolved', error);
    if (!data) return null;
    return {
      id: data.id, pageId: data.page_id, sectionId: data.section_id,
      text: data.body, author: data.author, resolved: data.resolved,
    };
  },
  async remove(orgId, id) {
    assertOrg(orgId, 'comments.remove');
    const { error } = await db().from('section_comments').delete().eq('org_id', orgId).eq('id', id);
    throwOn('comments.remove', error);
  },
};

// ---------- A/B stats ----------
export const abStats = {
  async forSection(orgId, sectionId) {
    assertOrg(orgId, 'abStats.forSection');
    const { data, error } = await db()
      .from('ab_stats').select('variant_id, impressions, clicks')
      .eq('org_id', orgId).eq('section_id', sectionId);
    throwOn('abStats.forSection', error);
    const out = {};
    for (const r of data || []) out[r.variant_id] = { impressions: Number(r.impressions), clicks: Number(r.clicks) };
    return out;
  },
  async record(orgId, sectionId, variantId, field) {
    assertOrg(orgId, 'abStats.record');
    const { data, error } = await db().from('ab_stats')
      .select('impressions, clicks')
      .eq('org_id', orgId).eq('section_id', sectionId).eq('variant_id', variantId).maybeSingle();
    throwOn('abStats.record.read', error);
    const row = {
      org_id: orgId,
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
  async list(orgId) {
    assertOrg(orgId, 'team.list');
    const { data, error } = await db().from('team_members')
      .select('id, name, email, role, added_at').eq('org_id', orgId)
      .order('added_at', { ascending: true });
    throwOn('team.list', error);
    return (data || []).map((r) => ({ ...r, addedAt: new Date(r.added_at).getTime() }));
  },
  async add(orgId, { id, name, email, role }) {
    assertOrg(orgId, 'team.add');
    const { data, error } = await db().from('team_members')
      .insert({ id, org_id: orgId, name, email, role })
      .select('id, name, email, role').maybeSingle();
    throwOn('team.add', error);
    return data;
  },
  async remove(orgId, id) {
    assertOrg(orgId, 'team.remove');
    const { data, error } = await db().from('team_members')
      .delete().eq('org_id', orgId).eq('id', id)
      .select('name, email').maybeSingle();
    throwOn('team.remove', error);
    return data;
  },
};

// ---------- Audit log ----------
export const audit = {
  async list(orgId, limit = 500) {
    assertOrg(orgId, 'audit.list');
    const { data, error } = await db().from('audit_log')
      .select('id, action, details, actor, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);
    throwOn('audit.list', error);
    return (data || []).map((r) => ({
      id: r.id, action: r.action, details: r.details,
      timestamp: new Date(r.created_at).getTime(),
    }));
  },
  async append(orgId, action, details, actor = null) {
    assertOrg(orgId, 'audit.append');
    const id = 'audit-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const { error } = await db().from('audit_log').insert({ id, org_id: orgId, action, details, actor });
    throwOn('audit.append', error);
  },
};

// ---------- Media ----------
export const media = {
  async list(orgId) {
    assertOrg(orgId, 'media.list');
    const run = () => db().from('media')
      .select(mediaCols('media'))
      .eq('org_id', orgId)
      .order('uploaded_at', { ascending: false });
    let { data, error } = await run();
    if (error && mediaHasVariants('media') && isMissingVariantColumn(error)) {
      markVariantsMissing('media');
      ({ data, error } = await run());
    }
    throwOn('media.list', error);
    return (data || []).map((r) => ({
      id: r.id, name: r.name, filename: r.filename,
      mimeType: r.mime_type, size: r.size, url: r.url,
      altText: r.alt_text || '', description: r.description || '',
      variants: Array.isArray(r.variants) ? r.variants : [],
      width: r.width || null, height: r.height || null,
      uploadedAt: new Date(r.uploaded_at).getTime(),
    }));
  },
  async add(orgId, entry) {
    assertOrg(orgId, 'media.add');
    const base = {
      id: entry.id, org_id: orgId, name: entry.name, filename: entry.filename,
      mime_type: entry.mimeType, size: entry.size, url: entry.url,
      alt_text: entry.altText || '', description: entry.description || '',
    };
    const withVariants = () => ({
      ...base,
      variants: Array.isArray(entry.variants) ? entry.variants : [],
      width: entry.width ?? null, height: entry.height ?? null,
    });
    let { error } = await db().from('media').insert(mediaHasVariants('media') ? withVariants() : base);
    if (error && mediaHasVariants('media') && isMissingVariantColumn(error)) {
      markVariantsMissing('media');
      ({ error } = await db().from('media').insert(base));
    }
    throwOn('media.add', error);
    return entry;
  },
  // Rename / edit metadata. Only the three user-editable fields (name, alt
  // text, description) can be patched here -- the storage-managed columns
  // (filename, url, mime_type, size) are never touched by an edit.
  async update(orgId, id, patch) {
    assertOrg(orgId, 'media.update');
    const columns = {};
    if (patch.name !== undefined) columns.name = String(patch.name).slice(0, 200);
    if (patch.altText !== undefined) columns.alt_text = String(patch.altText).slice(0, 500);
    if (patch.description !== undefined) columns.description = String(patch.description).slice(0, 2000);
    const { data, error } = await db().from('media')
      .update(columns).eq('org_id', orgId).eq('id', id)
      .select(mediaCols('media'))
      .maybeSingle();
    throwOn('media.update', error);
    if (!data) return null;
    return {
      id: data.id, name: data.name, filename: data.filename,
      mimeType: data.mime_type, size: data.size, url: data.url,
      altText: data.alt_text || '', description: data.description || '',
      uploadedAt: new Date(data.uploaded_at).getTime(),
    };
  },
  async get(orgId, id) {
    assertOrg(orgId, 'media.get');
    const { data, error } = await db().from('media')
      .select('id, name, filename, mime_type, url, alt_text, description').eq('org_id', orgId).eq('id', id).maybeSingle();
    throwOn('media.get', error);
    return data ? { ...data, mimeType: data.mime_type, altText: data.alt_text || '', description: data.description || '' } : null;
  },
  async remove(orgId, id) {
    assertOrg(orgId, 'media.remove');
    const { data, error } = await db().from('media')
      .delete().eq('org_id', orgId).eq('id', id)
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
  async list(orgId) {
    assertOrg(orgId, 'feedback.list');
    const { data, error } = await db().from('feedback')
      .select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    throwOn('feedback.list', error);
    return (data || []).map(rowToFeedback);
  },
  async get(orgId, id) {
    assertOrg(orgId, 'feedback.get');
    const { data, error } = await db().from('feedback')
      .select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
    throwOn('feedback.get', error);
    return data ? rowToFeedback(data) : null;
  },
  async add(orgId, entry) {
    assertOrg(orgId, 'feedback.add');
    const { error } = await db().from('feedback').insert({
      id: entry.id, org_id: orgId, type: entry.type, description: entry.description,
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
  async updateStatus(orgId, id, status) {
    assertOrg(orgId, 'feedback.updateStatus');
    const isDone = status === 'resolved' || status === 'closed';
    const patch = { status, updated_at: new Date().toISOString() };
    if (isDone) {
      const cur = await this.get(orgId, id);
      if (cur && !cur.resolved_at) patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_at = null;
    }
    const { data, error } = await db().from('feedback')
      .update(patch).eq('org_id', orgId).eq('id', id)
      .select('id, type, status, updated_at, resolved_at').maybeSingle();
    throwOn('feedback.updateStatus', error);
    return data;
  },
  async updateAssignee(orgId, id, email, name = null, image = null) {
    assertOrg(orgId, 'feedback.updateAssignee');
    const { data, error } = await db().from('feedback')
      .update({
        assignee_email: email, assignee_name: name, assignee_image: image,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId).eq('id', id).select('*').maybeSingle();
    throwOn('feedback.updateAssignee', error);
    return data ? rowToFeedback(data) : null;
  },
  async updateSystem(orgId, id, systemId) {
    assertOrg(orgId, 'feedback.updateSystem');
    const { data, error } = await db().from('feedback')
      .update({ system_id: systemId, updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select('*').maybeSingle();
    throwOn('feedback.updateSystem', error);
    return data ? rowToFeedback(data) : null;
  },
};

// ---------- Feedback comments ----------
export const feedbackComments = {
  async listForFeedback(orgId, feedbackId) {
    assertOrg(orgId, 'feedbackComments.listForFeedback');
    const { data, error } = await db().from('feedback_comments')
      .select('id, feedback_id, author_email, body, created_at, edited_at, deleted_at')
      .eq('org_id', orgId).eq('feedback_id', feedbackId)
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
  async get(orgId, id) {
    assertOrg(orgId, 'feedbackComments.get');
    const { data, error } = await db().from('feedback_comments')
      .select('id, feedback_id, author_email, body, created_at, edited_at, deleted_at')
      .eq('org_id', orgId).eq('id', id).maybeSingle();
    throwOn('feedbackComments.get', error);
    if (!data) return null;
    return {
      id: data.id, feedbackId: data.feedback_id, authorEmail: data.author_email,
      body: data.body, created_at: data.created_at, deleted_at: data.deleted_at,
    };
  },
  async add(orgId, { id, feedbackId, authorEmail, body }) {
    assertOrg(orgId, 'feedbackComments.add');
    const { error } = await db().from('feedback_comments').insert({
      id, org_id: orgId, feedback_id: feedbackId, author_email: authorEmail, body,
    });
    throwOn('feedbackComments.add', error);
    return this.get(orgId, id);
  },
  async edit(orgId, id, body) {
    assertOrg(orgId, 'feedbackComments.edit');
    const { data, error } = await db().from('feedback_comments')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select('id, body, edited_at').maybeSingle();
    throwOn('feedbackComments.edit', error);
    return data;
  },
  async softDelete(orgId, id) {
    assertOrg(orgId, 'feedbackComments.softDelete');
    const { data, error } = await db().from('feedback_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('id', id).select('id').maybeSingle();
    throwOn('feedbackComments.softDelete', error);
    return data;
  },
};

// ---------- Systems ----------
export const systems = {
  async list(orgId) {
    assertOrg(orgId, 'systems.list');
    const { data, error } = await db().from('systems')
      .select('id, name, status, description, category')
      .eq('org_id', orgId).order('name', { ascending: true });
    throwOn('systems.list', error);
    return data || [];
  },
  async listOrdered(orgId) {
    assertOrg(orgId, 'systems.listOrdered');
    const { data, error } = await db().from('systems')
      .select('id, name, status, description, category, display_order, product')
      .eq('org_id', orgId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('systems.listOrdered', error);
    return (data || []).map((r) => ({ ...r, display_order: r.display_order ?? 0, product: r.product || 'Other' }));
  },
};

// ---------- User preferences ----------
export const preferences = {
  async get(orgId, email) {
    assertOrg(orgId, 'preferences.get');
    const { data, error } = await db().from('user_preferences')
      .select('prefs').eq('org_id', orgId).eq('user_email', email).maybeSingle();
    throwOn('preferences.get', error);
    return data?.prefs || {};
  },
  async all(orgId) {
    assertOrg(orgId, 'preferences.all');
    const { data, error } = await db().from('user_preferences')
      .select('user_email, prefs').eq('org_id', orgId);
    throwOn('preferences.all', error);
    const out = {};
    for (const row of data || []) out[row.user_email] = row.prefs || {};
    return out;
  },
  async patch(orgId, email, patch) {
    assertOrg(orgId, 'preferences.patch');
    const existing = await this.get(orgId, email);
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
      .upsert({ org_id: orgId, user_email: email, prefs: next, updated_at: new Date().toISOString() }, { onConflict: 'org_id,user_email' });
    throwOn('preferences.patch', error);
    return next;
  },
};

// ---------- Repos + branches + git pulls ----------
export const repos = {
  async listWithBranches(orgId) {
    assertOrg(orgId, 'repos.listWithBranches');
    const { data: reposData, error: e1 } = await db().from('repos')
      .select('id, name, url, platform, display_order').eq('org_id', orgId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('repos.listWithBranches', e1);
    const { data: branchesData, error: e2 } = await db().from('repo_branches')
      .select('id, repo_id, name, display_order, last_pulled_by_email, last_pulled_by_name, last_pulled_at')
      .eq('org_id', orgId)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    throwOn('branches.list', e2);
    return {
      repos: (reposData || []).map((r) => ({ ...r, platform: r.platform || 'GitHub', display_order: r.display_order ?? 0 })),
      branches: (branchesData || []).map((b) => ({ ...b, display_order: b.display_order ?? 0 })),
    };
  },
  async findBranch(orgId, id) {
    assertOrg(orgId, 'repos.findBranch');
    const { data, error } = await db().from('repo_branches')
      .select('id, repo_id, name').eq('org_id', orgId).eq('id', id).maybeSingle();
    throwOn('repos.findBranch', error);
    return data;
  },
  async touchBranch(orgId, id, { email, name }) {
    assertOrg(orgId, 'repos.touchBranch');
    const { data, error } = await db().from('repo_branches')
      .update({
        last_pulled_by_email: email,
        last_pulled_by_name: name,
        last_pulled_at: new Date().toISOString(),
      }).eq('org_id', orgId).eq('id', id).select('*').maybeSingle();
    throwOn('repos.touchBranch', error);
    if (!data) return null;
    return {
      ...data,
      last_pulled_at: data.last_pulled_at ? new Date(data.last_pulled_at).getTime() : null,
    };
  },
};

export const gitPulls = {
  async list(orgId, userEmail) {
    assertOrg(orgId, 'gitPulls.list');
    let q = db().from('git_pulls').select('id, branch_id, user_email, pulled_at').eq('org_id', orgId).order('pulled_at', { ascending: false });
    if (userEmail) q = q.eq('user_email', userEmail);
    const { data, error } = await q;
    throwOn('gitPulls.list', error);
    return (data || []).map((r) => ({
      id: r.id, branchId: r.branch_id, userEmail: r.user_email,
      pulledAt: new Date(r.pulled_at).getTime(),
    }));
  },
  async record(orgId, { branchId, userEmail }) {
    assertOrg(orgId, 'gitPulls.record');
    const id = 'pull-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const { error } = await db().from('git_pulls').insert({
      id, org_id: orgId, branch_id: branchId, user_email: userEmail,
    });
    throwOn('gitPulls.record', error);
    return { id, branchId, userEmail, pulledAt: Date.now() };
  },
};

// ---------- Global settings (per-org) ----------
export const settings = {
  async get(orgId) {
    assertOrg(orgId, 'settings.get');
    const { data, error } = await db().from('global_settings')
      .select('site_name, theme, analytics, globals, favicon, default_og_image, timezone, maintenance_mode')
      .eq('org_id', orgId).maybeSingle();
    throwOn('settings.get', error);
    if (!data) return { siteName: 'Nexus', theme: {}, analytics: {}, globals: {} };
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
  async replace(orgId, next) {
    assertOrg(orgId, 'settings.replace');
    // Upsert so a newly-created org gets its settings row on first save.
    const { error } = await db().from('global_settings').upsert({
      org_id: orgId,
      site_name: next.siteName || 'Nexus',
      theme: next.theme || {},
      analytics: next.analytics || {},
      globals: next.globals || {},
      favicon: next.favicon || null,
      default_og_image: next.defaultOgImage || null,
      timezone: next.timezone || 'UTC',
      maintenance_mode: !!next.maintenanceMode,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' });
    throwOn('settings.replace', error);
    return this.get(orgId);
  },
};

// ---------- Orgs + members ----------
// Admin-only operations. Server-side routes call these with the operator's
// role checked ('admin' inside the operator's org).
export const orgs = {
  // feature_flags is read from/written to nexus-core (see coreFlags.js), not
  // the `orgs.feature_flags` column — that column is unused now (Phase B).
  //
  // Keyset-paginated: the platform-wide "every workspace" list is exactly
  // the unbounded-and-grows-forever shape the ecosystem standard warns
  // about (see packages/standards/README.md item 2 in nexus-core), so this
  // caps each page and returns a cursor rather than every row ever created.
  // { limit, before } mirrors nexus-core's packages/standards/src/pagination.js
  // shape natively (CMS doesn't share code with nexus-core) — `before` is
  // the created_at of the last row of the previous page.
  async list({ limit, before } = {}) {
    const pageLimit = Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), 200);
    let q = db().from('orgs')
      .select('id, name, domain, plan, paused, created_at')
      .order('created_at', { ascending: false });
    if (before) q = q.lt('created_at', before);
    q = q.limit(pageLimit);
    const { data, error } = await q;
    throwOn('orgs.list', error);
    const rows = data || [];
    const flagsByOrg = await getFlagsForOrgs(rows.map((r) => r.id));
    const items = rows.map((r) => ({ ...r, feature_flags: flagsByOrg[r.id] || {} }));
    const next_cursor = items.length === pageLimit ? items[items.length - 1].created_at : null;
    return { items, next_cursor };
  },
  async get(id) {
    const { data, error } = await db().from('orgs')
      .select('id, name, domain, plan, paused, created_at').eq('id', id).maybeSingle();
    throwOn('orgs.get', error);
    if (!data) return data;
    return { ...data, feature_flags: await getOrgFlags(id) };
  },
  // Looks up the one org whose custom domain matches an incoming request
  // Host header. This runs on every public page view for a custom-domain
  // site, so it's a targeted, indexed lookup (idx_orgs_domain, migration
  // 042) rather than pulling the whole table and filtering in JS the way
  // list() used to be called for this — see server.js's orgIdForHost() /
  // resolvePublicSite() history.
  async findByDomain(domain) {
    if (!domain) return null;
    const { data, error } = await db().from('orgs')
      .select('id, name, domain, plan, paused, created_at')
      .eq('domain', domain)
      .maybeSingle();
    throwOn('orgs.findByDomain', error);
    return data || null;
  },
  async create({ id, name, domain, plan, featureFlags }) {
    const { data, error } = await db().from('orgs').insert({
      id, name, domain: domain || null, plan: plan || 'starter',
    }).select('*').maybeSingle();
    throwOn('orgs.create', error);
    if (featureFlags && Object.keys(featureFlags).length) await setOrgFlags(id, featureFlags);
    // Seed the singleton global_settings row for this org.
    await db().from('global_settings').insert({ org_id: id, site_name: name }).select().maybeSingle();
    return { ...data, feature_flags: featureFlags || {} };
  },
  async update(id, patch) {
    const columns = {};
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.domain !== undefined) columns.domain = patch.domain || null;
    if (patch.plan !== undefined) columns.plan = patch.plan;
    if (patch.paused !== undefined) columns.paused = !!patch.paused;
    columns.updated_at = new Date().toISOString();
    const { data, error } = await db().from('orgs')
      .update(columns).eq('id', id).select('*').maybeSingle();
    throwOn('orgs.update', error);
    if (patch.featureFlags !== undefined) await setOrgFlags(id, patch.featureFlags);
    return { ...data, feature_flags: patch.featureFlags !== undefined ? patch.featureFlags : await getOrgFlags(id) };
  },
  async remove(id) {
    const { error } = await db().from('orgs').delete().eq('id', id);
    throwOn('orgs.remove', error);
    await removeOrgFlags(id);
  },
};

export const orgMembers = {
  async listForOrg(orgId) {
    assertOrg(orgId, 'orgMembers.listForOrg');
    const { data, error } = await db().from('org_members')
      .select('user_email, role, invited_at, joined_at').eq('org_id', orgId);
    throwOn('orgMembers.listForOrg', error);
    return data || [];
  },
  async listForUser(email) {
    const { data, error } = await db().from('org_members')
      .select('org_id, role, joined_at').eq('user_email', email);
    throwOn('orgMembers.listForUser', error);
    return data || [];
  },
  async add(orgId, email, role = 'viewer') {
    assertOrg(orgId, 'orgMembers.add');
    const { data, error } = await db().from('org_members')
      .upsert({ org_id: orgId, user_email: email, role }, { onConflict: 'org_id,user_email' })
      .select('*').maybeSingle();
    throwOn('orgMembers.add', error);
    return data;
  },
  async remove(orgId, email) {
    assertOrg(orgId, 'orgMembers.remove');
    const { error } = await db().from('org_members').delete().eq('org_id', orgId).eq('user_email', email);
    throwOn('orgMembers.remove', error);
  },
};

// ---------- Custom workspace roles (RBAC) ----------
// System roles (viewer/editor/admin) are computed, not stored -- see
// src/shared/permissions.js. This table holds only workspace-defined custom
// roles; each row's `id` is the slug stored in org_members.role.
export const roles = {
  async listForOrg(orgId) {
    assertOrg(orgId, 'roles.listForOrg');
    const { data, error } = await db().from('roles')
      .select('id, name, permissions, is_system, created_at').eq('org_id', orgId).order('created_at');
    throwOn('roles.listForOrg', error);
    return data || [];
  },
  async get(orgId, id) {
    assertOrg(orgId, 'roles.get');
    const { data, error } = await db().from('roles')
      .select('id, name, permissions, is_system').eq('org_id', orgId).eq('id', id).maybeSingle();
    throwOn('roles.get', error);
    return data || null;
  },
  async upsert(orgId, { id, name, permissions }) {
    assertOrg(orgId, 'roles.upsert');
    const { data, error } = await db().from('roles')
      .upsert({ org_id: orgId, id, name, permissions: permissions || {}, is_system: false, updated_at: new Date().toISOString() }, { onConflict: 'org_id,id' })
      .select('id, name, permissions, is_system').maybeSingle();
    throwOn('roles.upsert', error);
    return data;
  },
  // How many members currently hold this role -- a role in use can't be deleted.
  async membersUsing(orgId, id) {
    assertOrg(orgId, 'roles.membersUsing');
    const { count, error } = await db().from('org_members')
      .select('user_email', { count: 'exact', head: true }).eq('org_id', orgId).eq('role', id);
    throwOn('roles.membersUsing', error);
    return count || 0;
  },
  async remove(orgId, id) {
    assertOrg(orgId, 'roles.remove');
    const { error } = await db().from('roles').delete().eq('org_id', orgId).eq('id', id).eq('is_system', false);
    throwOn('roles.remove', error);
  },
};

// Usage counts for the Super Admin Billing page -- the "counts proxy"
// decided in place of real bandwidth metering (nothing in this app tracks
// request/response bytes). Storage is a real, already-tracked number
// (media.size per file); page count and 30-day activity are the stand-in
// for traffic volume.
export async function usageForOrg(orgId) {
  assertOrg(orgId, 'usageForOrg');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [mediaRes, orgPages, activityRes] = await Promise.all([
    db().from('media').select('size').eq('org_id', orgId),
    pages.list(orgId),
    db().from('audit_log').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', thirtyDaysAgo),
  ]);
  throwOn('usageForOrg.media', mediaRes.error);
  throwOn('usageForOrg.activity', activityRes.error);
  const storageBytes = (mediaRes.data || []).reduce((sum, r) => sum + (Number(r.size) || 0), 0);
  return { storageBytes, pageCount: orgPages.length, activityCount: activityRes.count || 0 };
}

// Fast lookup for the auth layer: which org does this user belong to?
// ---------- Page views (built-in cookieless analytics) ----------
export const pageViews = {
  async record(orgId, pagePath) {
    assertOrg(orgId, 'pageViews.record');
    const { error } = await db().rpc('increment_page_view', {
      p_org_id: orgId, p_path: String(pagePath || '').slice(0, 300),
    });
    throwOn('pageViews.record', error);
  },
  // Rows for the last `days` days; caller aggregates into per-day totals
  // and top paths.
  async list(orgId, days = 30) {
    assertOrg(orgId, 'pageViews.list');
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await db().from('page_views')
      .select('day, path, views')
      .eq('org_id', orgId)
      .gte('day', since)
      .order('day', { ascending: true });
    throwOn('pageViews.list', error);
    return data || [];
  },
};

// ---------- Form submissions (Contact Form / Newsletter blocks) ----------
export const forms = {
  async list(orgId) {
    assertOrg(orgId, 'forms.list');
    const { data, error } = await db().from('form_submissions')
      .select('id, form_name, page_path, fields, is_read, submitted_at')
      .eq('org_id', orgId)
      .order('submitted_at', { ascending: false })
      .limit(500);
    throwOn('forms.list', error);
    return (data || []).map((r) => ({
      id: r.id, formName: r.form_name, pagePath: r.page_path,
      fields: r.fields || {}, read: !!r.is_read,
      submittedAt: new Date(r.submitted_at).getTime(),
    }));
  },
  async add(orgId, entry) {
    assertOrg(orgId, 'forms.add');
    const { error } = await db().from('form_submissions').insert({
      id: entry.id, org_id: orgId, form_name: entry.formName,
      page_path: entry.pagePath, fields: entry.fields,
    });
    throwOn('forms.add', error);
    return entry;
  },
  async markRead(orgId, id, read) {
    assertOrg(orgId, 'forms.markRead');
    const { error } = await db().from('form_submissions')
      .update({ is_read: !!read }).eq('org_id', orgId).eq('id', id);
    throwOn('forms.markRead', error);
  },
  async remove(orgId, id) {
    assertOrg(orgId, 'forms.remove');
    const { error } = await db().from('form_submissions')
      .delete().eq('org_id', orgId).eq('id', id);
    throwOn('forms.remove', error);
  },
  async adminEmails(orgId) {
    assertOrg(orgId, 'forms.adminEmails');
    const { data, error } = await db().from('org_members')
      .select('user_email').eq('org_id', orgId).eq('role', 'admin');
    throwOn('forms.adminEmails', error);
    return (data || []).map((r) => r.user_email);
  },
};

// Returns { id, slug, name, role, feature_flags, domain, paused } or null if none.
//
// A user CAN have multiple org_members rows (e.g. an agency contractor
// invited to two client workspaces). This used to .maybeSingle(), which
// ERRORS on 2+ rows and locked the user out of everything ("No workspace
// on this account") -- the long-standing landmine every feature had to
// tiptoe around. Now: fetch all memberships and pick deterministically --
// earliest-invited first (their "home" workspace), with joined_at rows
// preferred over pending invites. True multi-workspace switching is a
// future feature; this makes multiple rows safe today.
export async function orgForUser(email) {
  if (!email) return null;
  const { data, error } = await db()
    .from('org_members')
    .select('role, invited_at, joined_at, orgs!inner(id, name, domain, paused)')
    .eq('user_email', email)
    .order('invited_at', { ascending: true });
  if (error) return null;
  const rows = (data || []).filter((r) => r?.orgs);
  if (rows.length === 0) return null;
  const chosen = rows.find((r) => r.joined_at) || rows[0];
  // "Joined" = has actually signed in and accessed the workspace. Nothing else
  // ever sets joined_at, so members showed "pending" forever; stamp it on this
  // first authenticated resolve (best-effort, fire-and-forget -- never block or
  // fail the request on it).
  if (!chosen.joined_at) {
    db().from('org_members')
      .update({ joined_at: new Date().toISOString() })
      .eq('org_id', chosen.orgs.id).eq('user_email', email).is('joined_at', null)
      .then(() => {}, () => {});
  }
  return {
    id: chosen.orgs.id,
    slug: chosen.orgs.id,
    name: chosen.orgs.name,
    role: chosen.role,
    feature_flags: await getOrgFlags(chosen.orgs.id),
    domain: chosen.orgs.domain || null,
    paused: !!chosen.orgs.paused,
  };
}
