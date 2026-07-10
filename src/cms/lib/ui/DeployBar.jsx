import { useState } from 'react';
import { deploySite, undeploySite } from '../api.js';

// Compact Deploy / Undeploy control for the top bar. Controlled: the layout
// owns the site status (so it can also drive the coming-soon badges/lock) and
// passes it in; this renders only when the workspace uses the staging → live
// model AND demo mode is off (demo mode hides the go-live control so it isn't
// shown mid-presentation).
export default function DeployBar({ status, onChange }) {
  const [busy, setBusy] = useState('');
  if (!status || !status.stagingEnabled || status.demoMode) return null;

  const { live, hasUndeployedChanges: changes } = status;

  const act = async (fn, key) => {
    setBusy(key);
    try { const res = await fn(); if (res?.status) onChange?.(res.status); }
    catch { /* leave the bar quiet; the disabled state guards misuse */ }
    finally { setBusy(''); }
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
          live ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' : 'bg-zinc-400/15 text-zinc-300 border-zinc-400/30'
        }`}
        title={status.lastDeployedAt ? `Last deployed ${new Date(status.lastDeployedAt).toLocaleString()}` : 'Never deployed'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
        {live ? 'Live' : 'Offline'}
        {live && changes && <span className="text-amber-300">· changes</span>}
      </span>

      {live && (
        <button
          onClick={() => act(undeploySite, 'undeploy')}
          disabled={!!busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 border border-white/15 hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'undeploy' ? 'Working…' : 'Undeploy'}
        </button>
      )}
      <button
        onClick={() => act(deploySite, 'deploy')}
        disabled={!!busy || (live && !changes)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-tr from-glass-indigo to-glass-fuchsia shadow-lg shadow-glass-fuchsia/20 hover:brightness-110 disabled:opacity-50"
        title={live && !changes ? 'Nothing new to deploy' : 'Publish the current working copy to the live site'}
      >
        {busy === 'deploy' ? 'Deploying…' : live ? 'Deploy changes' : 'Deploy'}
      </button>
    </div>
  );
}
