import { useEffect, useState } from 'react';
import { getTeam, addTeamMember, removeTeamMember } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect, Badge } from '../lib/ui/Glass.jsx';

const ROLE_CAPABILITIES = [
  { role: 'viewer', tone: 'default', can: 'View pages, library, media, redirects, comments, audit log' },
  { role: 'editor', tone: 'default', can: 'Everything a viewer can, plus create/edit pages, library entries, media, and comments' },
  { role: 'admin', tone: 'published', can: 'Everything an editor can, plus redirects, site settings, team roster, deleting media, and restoring versions' },
];

export default function TeamPage() {
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' });
  const [error, setError] = useState('');

  const load = () => getTeam().then(setTeam).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await addTeamMember(form.name, form.email, form.role);
      setForm({ name: '', email: '', role: 'editor' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    try {
      await removeTeamMember(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!team) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Team &amp; Permissions</h1>
      <p className="text-zinc-500 text-sm mb-4">
        A reference roster, not authentication — there's no real login system yet, so this documents who
        <em> should</em> have which role rather than enforcing it. Role writes are still gated server-side
        via the simulated role switcher in the sidebar.
      </p>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">Role capabilities</h2>
        {ROLE_CAPABILITIES.map((r) => (
          <div key={r.role} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
            <Badge tone={r.tone}>{r.role}</Badge>
            <p className="text-sm text-zinc-300">{r.can}</p>
          </div>
        ))}
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">Add team member</h2>
        <form onSubmit={submit} className="flex gap-2 flex-wrap items-end">
          <GlassInput required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <GlassInput required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <GlassSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </GlassSelect>
          <GlassButton type="submit">Add</GlassButton>
        </form>
        {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
      </GlassPanel>

      {team.length === 0 && <p className="text-zinc-500">No team members added yet.</p>}
      {team.length > 0 && (
        <GlassPanel className="p-2">
          <table className="w-full text-sm">
            <tbody>
              {team.map((t) => (
                <tr key={t.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2 px-2 text-zinc-100">{t.name}</td>
                  <td className="text-zinc-400">{t.email}</td>
                  <td><Badge tone={t.role === 'admin' ? 'published' : 'default'}>{t.role}</Badge></td>
                  <td className="text-right px-2"><button onClick={() => remove(t.id)} className="text-red-400 hover:text-red-300 text-xs">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}
