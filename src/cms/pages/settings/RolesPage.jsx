import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Lock } from 'lucide-react';
import { getRoles, saveRole, deleteRole } from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, Badge } from '../../lib/ui/Glass.jsx';
import { PAGES, emptyPermissions } from '../../../shared/permissions.js';

// Role Editor (workspace admins). Create a role, then toggle — per page — what
// it can see (View), whether it can change things (Edit), and any per-page
// sub-features. Built-in roles (viewer/editor/admin) are shown read-only for
// reference; admin is always full access and can't be edited or deleted.
//
// This is a convenience surface: the server independently enforces the same
// matrix via requirePermission on every write route.

const GROUPS = [...new Set(PAGES.map((p) => p.group))];

function RoleMatrix({ permissions, disabled, onChange }) {
  const set = (pageKey, patch) => {
    const page = permissions[pageKey] || { view: false, edit: false, features: {} };
    const next = { ...permissions, [pageKey]: { ...page, ...patch, features: { ...page.features, ...(patch.features || {}) } } };
    // Edit implies View; turning View off turns Edit (and features) off too.
    if (patch.edit) next[pageKey].view = true;
    if (patch.view === false) { next[pageKey].edit = false; next[pageKey].features = {}; }
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{group}</h3>
          <div className="space-y-1">
            {PAGES.filter((p) => p.group === group).map((page) => {
              const perm = permissions[page.key] || { view: false, edit: false, features: {} };
              return (
                <div key={page.key} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-200">{page.label}</span>
                    <div className="flex items-center gap-4 shrink-0">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <input type="checkbox" disabled={disabled} checked={!!perm.view}
                          onChange={(e) => set(page.key, { view: e.target.checked })} />
                        View
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <input type="checkbox" disabled={disabled} checked={!!perm.edit}
                          onChange={(e) => set(page.key, { edit: e.target.checked })} />
                        Edit
                      </label>
                    </div>
                  </div>
                  {page.features.length > 0 && perm.edit && (
                    <div className="mt-2 pl-1 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-2">
                      {page.features.map((f) => (
                        <label key={f.key} className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <input type="checkbox" disabled={disabled}
                            checked={!!perm.features?.[f.key]}
                            onChange={(e) => set(page.key, { features: { [f.key]: e.target.checked } })} />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // { id, name, permissions, is_system } | null
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => getRoles().then((d) => setRoles(d.roles || [])).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => (draft?.__new ? draft : roles?.find((r) => r.id === selectedId)) || null,
    [roles, selectedId, draft],
  );
  // The working copy: draft when editing, else the selected role verbatim.
  const working = draft && (draft.__new || draft.id === selectedId) ? draft : selected;

  const pick = (role) => {
    setError(''); setNotice('');
    setSelectedId(role.id);
    setDraft(role.is_system ? null : { ...role, permissions: { ...emptyPermissions(), ...role.permissions } });
  };

  const startNew = () => {
    setError(''); setNotice(''); setSelectedId(null);
    setDraft({ __new: true, id: null, name: '', permissions: emptyPermissions(), is_system: false });
  };

  const save = async () => {
    if (!working?.name?.trim()) { setError('Give the role a name.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const { role } = await saveRole({ id: working.__new ? null : working.id, name: working.name.trim(), permissions: working.permissions });
      await load();
      setSelectedId(role.id);
      setDraft(null);
      setNotice(`Saved “${role.name}”.`);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selected || selected.is_system) return;
    if (!confirm(`Delete the “${selected.name}” role?`)) return;
    setError(''); setNotice('');
    try {
      await deleteRole(selected.id);
      setSelectedId(null); setDraft(null);
      await load();
      setNotice('Role deleted.');
    } catch (e) { setError(e.message); }
  };

  if (!roles) return <p className="text-zinc-400">Loading…</p>;

  const editable = working && !working.is_system;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-zinc-300" />
        <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
      </div>
      <p className="text-zinc-500 text-sm mb-4">
        Define what each role can see and do in this workspace. Assign roles to people on the
        <span className="text-zinc-300"> Team &amp; permissions</span> page. Access is enforced on the server, not just hidden here.
      </p>

      {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}
      {notice && <p className="text-emerald-300/90 mb-3 text-sm">{notice}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        {/* Role list */}
        <GlassPanel className="p-2 h-max">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Roles</span>
            <button onClick={startNew} className="text-zinc-300 hover:text-white" title="New role"><Plus className="w-4 h-4" /></button>
          </div>
          <ul className="mt-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => pick(r)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center justify-between gap-2 ${selectedId === r.id && !draft?.__new ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                >
                  <span className="truncate">{r.name}</span>
                  {r.is_system && <Lock className="w-3 h-3 text-zinc-500 shrink-0" />}
                </button>
              </li>
            ))}
            {draft?.__new && (
              <li>
                <span className="w-full text-left px-2 py-1.5 rounded-md text-sm bg-white/10 text-white block">New role…</span>
              </li>
            )}
          </ul>
        </GlassPanel>

        {/* Editor */}
        <GlassPanel className="p-4">
          {!working && (
            <p className="text-sm text-zinc-500">Select a role to view it, or create a new one.</p>
          )}
          {working && (
            <>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  {editable ? (
                    <GlassInput placeholder="Role name" value={working.name}
                      onChange={(e) => setDraft({ ...working, name: e.target.value })} />
                  ) : (
                    <h2 className="text-lg font-medium text-zinc-100">{working.name}</h2>
                  )}
                  {working.is_system && <Badge tone={working.id === 'admin' ? 'published' : 'default'}>built-in</Badge>}
                </div>
                {editable && (
                  <div className="flex items-center gap-2">
                    {!working.__new && (
                      <button onClick={remove} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                    <GlassButton onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save role'}</GlassButton>
                  </div>
                )}
              </div>

              {working.is_system && working.id === 'admin' ? (
                <p className="text-sm text-zinc-400">Admins have full access to everything and manage roles &amp; billing. This role can't be changed.</p>
              ) : (
                <RoleMatrix
                  permissions={working.permissions || emptyPermissions()}
                  disabled={!editable}
                  onChange={(permissions) => setDraft({ ...working, permissions })}
                />
              )}
              {working.is_system && working.id !== 'admin' && (
                <p className="text-xs text-zinc-500 mt-4">This is a built-in role shown for reference. Create a custom role to change permissions.</p>
              )}
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
