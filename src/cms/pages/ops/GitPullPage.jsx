import { useCallback, useEffect, useState } from 'react';
import { getGitPulls, recordGitPull } from '../../lib/api.js';
import { GlassPanel, GlassButton } from '../../lib/ui/Glass.jsx';

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtAgo(ms, now = Date.now()) {
  if (!ms) return '—';
  const d = now - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 30 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BranchIcon() {
  return (
    <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12M6 21a3 3 0 100-6 3 3 0 000 6zM6 3a3 3 0 100 6 3 3 0 000-6zm12 0a3 3 0 110 6 3 3 0 010-6zM18 9a6 6 0 01-6 6h0" />
    </svg>
  );
}

export default function GitPullPage() {
  const [platforms, setPlatforms] = useState(null);
  const [error, setError] = useState('');
  const [pullingId, setPullingId] = useState(null);

  const load = useCallback(async () => {
    try { setPlatforms(await getGitPulls()); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pull = async (branchId) => {
    setPullingId(branchId);
    try {
      const updated = await recordGitPull(branchId);
      setPlatforms((prev) => prev.map((p) => ({
        ...p,
        branches: p.branches.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)),
      })));
    } catch (e) {
      setError(e.message);
    } finally {
      setPullingId(null);
    }
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!platforms) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-[1100px] flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Git Pull</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Pull the latest code from each repo. The last pull and who triggered it shows in-line so you
          can avoid stepping on someone&apos;s in-flight push.
        </p>
      </header>

      <div className="flex flex-col gap-7">
        {platforms.map((p) => (
          <section key={p.platform}>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">{p.platform}</h2>
            <GlassPanel className="overflow-hidden !p-0">
              {p.branches.length === 0 ? (
                <p className="py-5 px-5 text-sm text-zinc-500">No branches yet.</p>
              ) : (
                <ul>
                  {p.branches.map((b, i) => {
                    const busy = pullingId === b.id;
                    return (
                      <li
                        key={b.id}
                        className={`flex items-center justify-between gap-3 px-5 py-3.5 ${i > 0 ? 'border-t border-white/10' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <BranchIcon />
                          <span className="font-mono text-sm text-zinc-100 truncate">{b.name}</span>
                          <span className="text-xs text-zinc-500 whitespace-nowrap">{fmtBytes(b.zip_bytes)}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <GlassButton
                            onClick={() => pull(b.id)}
                            disabled={busy}
                            className="text-sm py-1.5"
                          >
                            {busy ? 'Pulling…' : 'Pull Code'}
                          </GlassButton>
                          <span className="text-xs text-zinc-500 whitespace-nowrap min-w-[160px] text-right">
                            {b.last_pulled_by_name ? (
                              <>
                                <span className="font-medium text-zinc-300">{b.last_pulled_by_name}</span>
                                <span> · {fmtAgo(b.last_pulled_at)}</span>
                              </>
                            ) : (
                              <span className="italic">Never pulled</span>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassPanel>
          </section>
        ))}
      </div>
    </div>
  );
}
