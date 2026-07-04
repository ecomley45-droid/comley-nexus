import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOrgs, getNexusPages } from '../../lib/api.js';
import { GlassPanel } from '../../lib/ui/Glass.jsx';

// Landing page for /super-admin: a quick read on the platform as a whole
// (client workspaces + Nexus's own site), not any single client's data.
export default function SuperAdminDashboardPage() {
  const [orgs, setOrgs] = useState(null);
  const [pages, setPages] = useState(null);

  useEffect(() => {
    listOrgs().then(setOrgs).catch(() => setOrgs([]));
    getNexusPages().then((d) => setPages(d.pages)).catch(() => setPages([]));
  }, []);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">Nexus Super Admin</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Operating the platform, not any single client workspace.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/super-admin/orgs">
          <GlassPanel className="p-5 hover:bg-white/[0.07] transition h-full">
            <div className="text-zinc-100 font-medium mb-1">Client workspaces</div>
            <div className="text-3xl font-semibold mb-1">{orgs ? orgs.length : '—'}</div>
            <div className="text-xs text-zinc-500">Comley Creative and every client onboarded since.</div>
          </GlassPanel>
        </Link>
        <Link to="/super-admin/pages">
          <GlassPanel className="p-5 hover:bg-white/[0.07] transition h-full">
            <div className="text-zinc-100 font-medium mb-1">Nexus pages</div>
            <div className="text-3xl font-semibold mb-1">{pages ? pages.length : '—'}</div>
            <div className="text-xs text-zinc-500">Nexus's own site — not part of any client's content.</div>
          </GlassPanel>
        </Link>
      </div>
    </div>
  );
}
