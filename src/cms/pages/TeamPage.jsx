import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ShieldCheck } from 'lucide-react';
import { getTeam, addTeamMember, removeTeamMember, getRoles } from '../lib/api.js';
import { GlassPanel, GlassButton, GlassInput, GlassSelect, Badge } from '../lib/ui/Glass.jsx';
import EmptyState from '../lib/ui/EmptyState.jsx';
import { useOrgBase } from '../lib/useMe.jsx';

export default function TeamPage() {
  const [team, setTeam] = useState(null);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'editor' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const orgBase = useOrgBase();

  const load = () => getTeam().then(setTeam).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { getRoles().then((d) => setRoles(d.roles || [])).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const email = form.email.trim();
      const res = await addTeamMember(form.name, email, form.role);
      setForm({ name: '', email: '', role: 'editor' });
      if (res?.invited) {
        setNotice(`Invite email sent to ${email}. If it doesn't arrive, check spam and your Clerk dashboard → Invitations.`);
      } else {
        setNotice(`${email} was added to the workspace, but no invite email was sent${res?.inviteError ? ` — ${res.inviteError}` : ''}. They can still get in by signing in with that email.`);
      }
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
        Invite people and set each person's role. A member's role decides which pages they see and what they
        can change — enforced on the server, not just in the UI. Define custom roles on the Roles page.
      </p>

      <GlassPanel className="p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-medium text-zinc-300">Roles</h2>
          {orgBase && (
            <Link to={`${orgBase}/settings/roles`} className="text-sm text-indigo-300 hover:text-indigo-200 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> Manage roles
            </Link>
          )}
        </div>
        <p className="text-sm text-zinc-500 mb-2">
          Built-in roles plus any custom roles you've defined. Create roles with fine-grained page and
          feature permissions on the Roles page.
        </p>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <Badge key={r.id} tone={r.id === 'admin' ? 'published' : 'default'}>{r.name}</Badge>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 mb-4">
        <h2 className="font-medium mb-2 text-zinc-300">Add team member</h2>
        <form onSubmit={submit} className="flex gap-2 flex-wrap items-end">
          <GlassInput required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <GlassInput required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <GlassSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </GlassSelect>
          <GlassButton type="submit">Add</GlassButton>
        </form>
        {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
        {notice && <p className="text-amber-300/90 mt-2 text-sm">{notice}</p>}
      </GlassPanel>

      {team.length === 0 && (
        <EmptyState compact icon={Users} title="Just you so far">
          Invite the people who work on this site. Viewers can look, editors can change content,
          admins can change settings and billing.
        </EmptyState>
      )}
      {team.length > 0 && (
        <GlassPanel className="p-2 overflow-x-auto">
          <table className="w-full min-w-lg text-sm">
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
