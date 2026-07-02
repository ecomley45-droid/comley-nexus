import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getRole, setRole, getPages } from './api.js';
import { GlassShell } from './ui/Glass.jsx';
import TopBar from './ui/TopBar.jsx';
import FeedbackWidget from './FeedbackWidget.jsx';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/pages', label: 'Pages' },
  { to: '/admin/library', label: 'Library' },
  { to: '/admin/media', label: 'Media' },
  { to: '/admin/redirects', label: 'Redirects' },
  { to: '/admin/comments', label: 'Comments' },
  { to: '/admin/feedback', label: 'Feedback' },
  { to: '/admin/import-export', label: 'Import / Export' },
  {
    to: '/admin/settings',
    label: 'Settings',
    children: [
      { to: '/admin/settings', label: 'General', end: true },
      { to: '/admin/connections', label: 'Connections' },
      { to: '/admin/team', label: 'Team & Permissions' },
      { to: '/admin/audit', label: 'Audit Log' },
    ],
  },
];

function RoleSwitcher() {
  const [role, setRoleState] = useState(getRole());
  const changeRole = (e) => {
    setRole(e.target.value);
    setRoleState(e.target.value);
  };
  return (
    <select
      value={role}
      onChange={changeRole}
      title="Simulated role — no real auth exists yet"
      className="backdrop-blur-xl bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-glass-indigo/60"
    >
      <option value="viewer">viewer</option>
      <option value="editor">editor</option>
      <option value="admin">admin</option>
    </select>
  );
}

export default function CmsLayout() {
  const [pages, setPages] = useState([]);

  useEffect(() => { getPages().then((d) => setPages(d.pages)).catch(() => {}); }, []);

  return (
    <GlassShell>
      <TopBar
        logoTo="/admin"
        logoLabel="Nexus CMS"
        navItems={NAV_ITEMS}
        extraNavItem={{ to: '/admin/commerce', label: 'Commerce dashboard →' }}
        searchItems={pages.map((p) => ({ label: p.name, to: `/admin/pages/${p.id}` }))}
        searchPlaceholder="Search pages…"
        rightSlot={<RoleSwitcher />}
      />
      <main className="p-6">
        <Outlet />
      </main>
      <FeedbackWidget area="cms" />
    </GlassShell>
  );
}
