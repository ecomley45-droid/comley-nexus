import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listOrgs, createOrg, updateOrg, deleteOrg,
  listOrgMembers, addOrgMember, removeOrgMember, viewAsOrg,
} from '../../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect } from '../../lib/ui/Glass.jsx';
import { useMe } from '../../lib/useMe.jsx';

// Create and manage every client workspace in Nexus. This is how you
// onboard a real client — Comley Creative is the first one. The route
// this page is mounted on (/super-admin/orgs) is already gated by
// RequireSuperAdmin, and the underlying /api/orgs* routes independently
// enforce requireSuperAdmin server-side.
//
// After creating an org here, you still need to send a Clerk invitation
// from the Clerk dashboard using the same email you added below — that's
// how the new user actually gets to sign in.

const PROTECTED_ORG_ID = 'comley-creative';

export default function OrgsPage() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    listOrgs().then((data) => { setOrgs(data); setLoading(false); }).catch((e) => { setError(e.message); setLoading(false); });
  };

  useEffect(refresh, []);

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Client workspaces</h1>
        <GlassButton onClick={() => setShowNew(true)}>New workspace</GlassButton>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {loading && <p className="text-sm text-zinc-400">Loading…</p>}

      {!loading && orgs.length === 0 && (
        <GlassPanel className="p-6 text-center">
          <p className="text-sm text-zinc-400 mb-3">No workspaces yet.</p>
          <GlassButton onClick={() => setShowNew(true)}>Create the first one</GlassButton>
        </GlassPanel>
      )}

      <div className="space-y-2">
        {orgs.map((o) => (
          <OrgRow key={o.id} org={o} onSelect={() => setSelected(o)} onDeleted={refresh} onUpdated={refresh} />
        ))}
      </div>

      {showNew && <NewOrgModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />}
      {selected && <OrgMembersModal org={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function OrgRow({ org, onSelect, onDeleted, onUpdated }) {
  const navigate = useNavigate();
  const { refresh } = useMe();
  const [opening, setOpening] = useState(false);
  const [editingDomain, setEditingDomain] = useState(false);
  const [domainValue, setDomainValue] = useState(org.domain || '');
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (org.id === PROTECTED_ORG_ID) return alert(`"${org.name}" is Nexus's first client and can't be deleted here.`);
    if (!confirm(`Delete workspace "${org.name}" and all its data? This can't be undone.`)) return;
    try { await deleteOrg(org.id); onDeleted(); } catch (e) { alert(e.message); }
  };

  const openWorkspace = async () => {
    setOpening(true);
    try {
      await viewAsOrg(org.id);
      await refresh();
      navigate(`/${org.id}`);
    } catch (e) {
      alert(e.message);
      setOpening(false);
    }
  };

  const requested = org.feature_flags?.custom_domain_request;

  const saveDomain = async () => {
    setBusy(true);
    try {
      // Setting the live domain resolves whatever the client asked for.
      await updateOrg(org.id, {
        domain: domainValue.trim() || null,
        featureFlags: { ...org.feature_flags, custom_domain_request: null },
      });
      setEditingDomain(false);
      onUpdated();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const useRequested = () => {
    setDomainValue(requested);
    setEditingDomain(true);
  };

  const togglePause = async () => {
    const next = !org.paused;
    if (next && !confirm(`Pause "${org.name}"? Their team will see a generic error instead of the workspace, and their public site will show the same until you resume.`)) return;
    setBusy(true);
    try { await updateOrg(org.id, { paused: next }); onUpdated(); } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const downloadBackup = () => window.open(`/api/orgs/${org.id}/backup`, '_blank');

  return (
    <GlassPanel className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="font-medium text-zinc-100">{org.name}</div>
          <div className="text-xs text-zinc-500">/{org.id}</div>
          {org.paused && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">Paused</span>}
        </div>
        <div className="text-xs text-zinc-500 flex items-center gap-3 mt-1 flex-wrap">
          <span>Plan: {org.plan}</span>
          {editingDomain ? (
            <span className="flex items-center gap-1">
              <GlassInput
                value={domainValue}
                onChange={(e) => setDomainValue(e.target.value)}
                placeholder="acmeco.com"
                className="text-xs py-0.5 px-1.5 w-36"
              />
              <button onClick={saveDomain} disabled={busy} className="text-glass-sky hover:underline">Save</button>
              <button onClick={() => { setEditingDomain(false); setDomainValue(org.domain || ''); }} className="hover:text-zinc-300">Cancel</button>
            </span>
          ) : (
            <span>
              Domain: {org.domain || '—'}{' '}
              <button onClick={() => setEditingDomain(true)} className="text-glass-sky hover:underline">Edit</button>
            </span>
          )}
          {requested && requested !== org.domain && !editingDomain && (
            <span className="text-amber-400">
              Requested: {requested}{' '}
              <button onClick={useRequested} className="text-glass-sky hover:underline">Use</button>
            </span>
          )}
          <span>Created: {new Date(org.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <GlassButton onClick={openWorkspace} disabled={opening} className="text-xs">
        {opening ? 'Opening…' : 'Open workspace'}
      </GlassButton>
      <GlassButton onClick={onSelect} variant="secondary" className="text-xs">Members</GlassButton>
      <button onClick={downloadBackup} className="text-xs text-zinc-400 hover:text-zinc-100 px-2">Backup</button>
      <button onClick={togglePause} disabled={busy} className={`text-xs px-2 ${org.paused ? 'text-emerald-400 hover:text-emerald-300' : 'text-amber-400 hover:text-amber-300'}`}>
        {org.paused ? 'Resume' : 'Pause'}
      </button>
      {org.id !== PROTECTED_ORG_ID && (
        <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 px-2">Delete</button>
      )}
    </GlassPanel>
  );
}

function NewOrgModal({ onClose, onCreated }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      await createOrg({ id: id.trim(), name: name.trim(), plan, adminEmail: adminEmail.trim() || null });
      onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New workspace" onClose={onClose}>
      <label className="text-xs text-zinc-400 block mb-1">Slug (used in the URL)</label>
      <GlassInput value={id} onChange={(e) => setId(e.target.value)} placeholder="acme" className="w-full mb-3" />
      <p className="text-[11px] text-zinc-500 -mt-2 mb-3">
        Their workspace will live at <code>nexus.comleycreative.com/{id || 'acme'}</code>
      </p>

      <label className="text-xs text-zinc-400 block mb-1">Display name</label>
      <GlassInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Co" className="w-full mb-3" />

      <label className="text-xs text-zinc-400 block mb-1">First admin email</label>
      <GlassInput value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="owner@acmeco.com" className="w-full mb-1" />
      <p className="text-[11px] text-zinc-500 mb-3">
        After creating, invite this email through the Clerk dashboard so they can sign in.
      </p>

      <label className="text-xs text-zinc-400 block mb-1">Plan</label>
      <GlassSelect value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full mb-4">
        <option value="starter">Starter</option>
        <option value="growth">Growth</option>
        <option value="enterprise">Enterprise</option>
        <option value="internal">Internal (comped)</option>
      </GlassSelect>

      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <GlassButton variant="secondary" onClick={onClose}>Cancel</GlassButton>
        <GlassButton onClick={submit} disabled={busy || !id.trim() || !name.trim()}>
          {busy ? 'Creating…' : 'Create workspace'}
        </GlassButton>
      </div>
    </Modal>
  );
}

function OrgMembersModal({ org, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    listOrgMembers(org.id).then((r) => { setMembers(r); setLoading(false); }).catch((e) => { setError(e.message); setLoading(false); });
  };
  useEffect(refresh, [org.id]);

  const add = async () => {
    setError(''); setBusy(true);
    try {
      await addOrgMember(org.id, newEmail.trim().toLowerCase(), newRole);
      setNewEmail('');
      refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const remove = async (email) => {
    if (!confirm(`Remove ${email} from ${org.name}?`)) return;
    try { await removeOrgMember(org.id, email); refresh(); } catch (e) { alert(e.message); }
  };

  return (
    <Modal title={`Members of ${org.name}`} onClose={onClose}>
      {loading ? <p className="text-sm text-zinc-400">Loading…</p> : (
        <div className="mb-4 space-y-1">
          {members.map((m) => (
            <div key={m.user_email} className="flex items-center gap-2 text-sm py-1 border-b border-white/5 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-zinc-100 truncate">{m.user_email}</div>
                <div className="text-xs text-zinc-500">Role: {m.role} · Joined: {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'pending'}</div>
              </div>
              <button onClick={() => remove(m.user_email)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
            </div>
          ))}
          {members.length === 0 && <p className="text-xs text-zinc-500">No members yet.</p>}
        </div>
      )}

      <div className="border-t border-white/10 pt-3">
        <h3 className="text-sm font-medium text-zinc-200 mb-2">Add member</h3>
        <div className="flex gap-2 mb-2">
          <GlassInput value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="teammate@acmeco.com" className="flex-1" />
          <GlassSelect value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-28">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </GlassSelect>
          <GlassButton onClick={add} disabled={busy || !newEmail.trim()}>{busy ? 'Adding…' : 'Add'}</GlassButton>
        </div>
        <p className="text-[11px] text-zinc-500">
          They still need a Clerk invitation to actually sign in. Add them here so
          when they do, we know which workspace to route them to.
        </p>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-20 p-4" onClick={onClose}>
      <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">{title}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>
          {children}
        </GlassPanel>
      </div>
    </div>
  );
}
