import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSocialPosts, getSocialAccounts, publishSocialPost, deleteSocialPost } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../lib/ui/Glass.jsx';
import { platformMeta } from './platformMeta.js';

const STATUS_TONE = { scheduled: 'default', publishing: 'default', done: 'published', failed: 'draft', draft: 'draft' };

// Upcoming (scheduled) posts up top, recent history below. Each post shows
// its per-account targets and their individual status, and can be published
// now, retried, or removed.
export default function SocialCalendarPage() {
  const { orgSlug } = useParams();
  const [posts, setPosts] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = () => Promise.all([getSocialPosts(), getSocialAccounts()])
    .then(([p, a]) => {
      setPosts(p.posts);
      setAccounts(Object.fromEntries(a.accounts.map((acc) => [acc.id, acc])));
    })
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const act = async (fn, id) => { setBusy(id); try { await fn(id); await load(); } finally { setBusy(''); } };

  if (loading) return <p className="text-zinc-400">Loading…</p>;

  const upcoming = posts.filter((p) => p.status === 'scheduled').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const history = posts.filter((p) => p.status !== 'scheduled');

  const Card = ({ post }) => (
    <GlassPanel className="p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={STATUS_TONE[post.status] || 'draft'}>{post.status}</Badge>
            {post.scheduledAt && <span className="text-xs text-zinc-500">{new Date(post.scheduledAt).toLocaleString()}</span>}
          </div>
          <p className="text-sm text-zinc-200 line-clamp-3">{post.body || <span className="text-zinc-500">No shared text</span>}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {(post.status === 'scheduled' || post.status === 'failed') && (
            <GlassButton variant="secondary" className="text-xs" disabled={busy === post.id} onClick={() => act(publishSocialPost, post.id)}>
              {post.status === 'failed' ? 'Retry' : 'Publish now'}
            </GlassButton>
          )}
          <GlassButton variant="danger" className="text-xs" disabled={busy === post.id} onClick={() => act(deleteSocialPost, post.id)}>Delete</GlassButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {post.targets.map((t) => {
          const acc = accounts[t.accountId];
          const meta = platformMeta(acc?.platform);
          const tone = t.status === 'sent' ? 'text-emerald-300' : t.status === 'failed' ? 'text-red-300' : 'text-zinc-400';
          return (
            <span key={t.accountId} className="text-xs flex items-center gap-1.5" title={t.error || t.status}>
              <span className="w-5 h-5 rounded grid place-items-center text-[10px] font-bold text-white" style={{ background: meta.color }}>{meta.short}</span>
              <span className={tone}>{t.status}</span>
              {t.externalUrl && <a href={t.externalUrl} target="_blank" rel="noreferrer" className="text-glass-sky hover:underline">view</a>}
            </span>
          );
        })}
      </div>
    </GlassPanel>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Calendar & queue</h1>
        <Link to={`/${orgSlug}/social/compose`}><GlassButton>New post</GlassButton></Link>
      </div>

      <h2 className="text-sm font-semibold text-zinc-300 mb-2 uppercase tracking-wide">Upcoming</h2>
      {upcoming.length === 0 ? (
        <p className="text-zinc-500 text-sm mb-6">Nothing scheduled.</p>
      ) : (
        <div className="space-y-2 mb-6">{upcoming.map((p) => <Card key={p.id} post={p} />)}</div>
      )}

      <h2 className="text-sm font-semibold text-zinc-300 mb-2 uppercase tracking-wide">Recent</h2>
      {history.length === 0 ? (
        <p className="text-zinc-500 text-sm">No posts yet.</p>
      ) : (
        <div className="space-y-2">{history.map((p) => <Card key={p.id} post={p} />)}</div>
      )}
    </div>
  );
}
