// Storage for Nexus's own site content. Deliberately NOT part of the
// multi-tenant `orgs` system in lib/storage.js — there's exactly one Nexus
// site, so these helpers take no orgId and hit the standalone `nexus_*`
// tables (no org_id column, no FK to orgs). Access is gated purely by
// requireSuperAdmin in lib/nexusRoutes.js, never by org membership.

import { db } from './db.js';

const throwOn = (msg, error) => {
  if (error) throw new Error(`[nexus/${msg}] ${error.message}`);
};

// editorMode/fullHtml ride inside the layout jsonb -- same stowaway
// pattern (and reasoning) as lib/storage.js's page mappers.
function rowToPage(r) {
  const { editorMode, fullHtml, ...layout } = r.layout || {};
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    content: r.content || [],
    editorMode: editorMode || 'blocks',
    fullHtml: fullHtml || '',
    seo: r.seo || { title: '', description: '', ogImage: '' },
    status: r.status,
    scheduledPublishAt: r.scheduled_publish_at || null,
    analytics: r.analytics || { headSnippet: '', bodySnippet: '' },
    layout,
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
    layout: {
      ...(p.layout || {}),
      ...(p.editorMode && p.editorMode !== 'blocks' ? { editorMode: p.editorMode } : {}),
      ...(p.fullHtml ? { fullHtml: p.fullHtml } : {}),
    },
    updated_at: new Date().toISOString(),
  };
}

export const pages = {
  async list() {
    const { data, error } = await db()
      .from('nexus_pages')
      .select('id, name, slug, parent_id, content, seo, status, scheduled_publish_at, analytics, layout')
      .order('created_at', { ascending: true });
    throwOn('pages.list', error);
    return (data || []).map(rowToPage);
  },
  async bulkReplace(nextPages) {
    if (nextPages.length > 0) {
      const { error } = await db()
        .from('nexus_pages')
        .upsert(nextPages.map(pageToRow), { onConflict: 'id' });
      throwOn('pages.upsert', error);
    }
    const keepIds = nextPages.map((p) => p.id);
    if (keepIds.length === 0) {
      const { error } = await db().from('nexus_pages').delete().neq('id', '');
      throwOn('pages.wipe', error);
    } else {
      const { error } = await db()
        .from('nexus_pages')
        .delete()
        .not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
      throwOn('pages.trim', error);
    }
    return this.list();
  },
  async applyScheduledPublishes() {
    const now = Date.now();
    const { data, error } = await db()
      .from('nexus_pages')
      .select('id')
      .eq('status', 'draft')
      .not('scheduled_publish_at', 'is', null)
      .lte('scheduled_publish_at', now);
    throwOn('pages.findDue', error);
    if (!data || data.length === 0) return 0;
    const ids = data.map((r) => r.id);
    const { error: e2 } = await db()
      .from('nexus_pages')
      .update({ status: 'published', scheduled_publish_at: null, updated_at: new Date().toISOString() })
      .in('id', ids);
    throwOn('pages.flipDue', e2);
    return ids.length;
  },
};

export const versions = {
  async listForPage(pageId) {
    const { data, error } = await db()
      .from('nexus_page_versions')
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
      .from('nexus_page_versions')
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
        id: 'nver-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        page_id: nu.id,
        snapshot: old,
      });
    }
    if (rows.length === 0) return 0;
    const { error } = await db().from('nexus_page_versions').insert(rows);
    throwOn('versions.snapshot', error);

    for (const nu of newPages) {
      const { data } = await db()
        .from('nexus_page_versions')
        .select('id')
        .eq('page_id', nu.id)
        .order('taken_at', { ascending: false })
        .range(maxPerPage, maxPerPage + 1000);
      if (data && data.length > 0) {
        await db().from('nexus_page_versions').delete().in('id', data.map((v) => v.id));
      }
    }
    return rows.length;
  },
};

export const library = {
  async list() {
    const { data, error } = await db()
      .from('nexus_library_entries')
      .select('id, name, html')
      .order('created_at', { ascending: true });
    throwOn('library.list', error);
    return data || [];
  },
  async bulkReplace(entries) {
    const rows = entries.map((e) => ({
      id: e.id || 'nlib-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: e.name || '',
      html: e.html || '',
    }));
    const { error: wipeErr } = await db().from('nexus_library_entries').delete().neq('id', '');
    throwOn('library.wipe', wipeErr);
    if (rows.length > 0) {
      const { error } = await db().from('nexus_library_entries').insert(rows);
      throwOn('library.insert', error);
    }
    return this.list();
  },
};

export const redirects = {
  async list() {
    const { data, error } = await db()
      .from('nexus_redirects')
      .select('id, from_path, to_path, type')
      .order('created_at', { ascending: true });
    throwOn('redirects.list', error);
    return (data || []).map((r) => ({ id: r.id, from: r.from_path, to: r.to_path, type: r.type }));
  },
  async add({ id, from, to, type }) {
    const { error } = await db().from('nexus_redirects').insert({
      id, from_path: from, to_path: to, type,
    });
    throwOn('redirects.add', error);
    return this.getByFrom(from);
  },
  async getByFrom(fromPath) {
    const { data, error } = await db()
      .from('nexus_redirects')
      .select('id, from_path, to_path, type')
      .eq('from_path', fromPath).maybeSingle();
    throwOn('redirects.getByFrom', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path, type: data.type } : null;
  },
  async findMatch(requestPath) { return this.getByFrom(requestPath); },
  async remove(id) {
    const { data, error } = await db()
      .from('nexus_redirects')
      .delete()
      .eq('id', id)
      .select('id, from_path, to_path')
      .maybeSingle();
    throwOn('redirects.remove', error);
    return data ? { id: data.id, from: data.from_path, to: data.to_path } : null;
  },
};

export const settings = {
  async get() {
    const { data, error } = await db().from('nexus_settings')
      .select('site_name, settings').eq('id', true).maybeSingle();
    throwOn('settings.get', error);
    if (!data) return { siteName: 'Nexus', theme: {}, analytics: {}, globals: {} };
    const s = data.settings || {};
    return {
      siteName: data.site_name,
      theme: s.theme || {},
      analytics: s.analytics || {},
      globals: s.globals || {},
      favicon: s.favicon,
      defaultOgImage: s.defaultOgImage,
      timezone: s.timezone,
      maintenanceMode: s.maintenanceMode,
    };
  },
  async replace(next) {
    const { error } = await db().from('nexus_settings').upsert({
      id: true,
      site_name: next.siteName || 'Nexus',
      settings: {
        theme: next.theme || {},
        analytics: next.analytics || {},
        globals: next.globals || {},
        favicon: next.favicon || null,
        defaultOgImage: next.defaultOgImage || null,
        timezone: next.timezone || 'UTC',
        maintenanceMode: !!next.maintenanceMode,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    throwOn('settings.replace', error);
    return this.get();
  },
};
