import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEmailCampaigns } from '../../lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../../lib/ui/Glass.jsx';

const TONE = { draft: 'draft', scheduled: 'default', sending: 'default', sent: 'published', failed: 'draft' };

export default function EmailCampaignsPage() {
  const { orgSlug } = useParams();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getEmailCampaigns().then((d) => setCampaigns(d.campaigns)).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Link to={`/${orgSlug}/email`}><GlassButton>New from template</GlassButton></Link>
      </div>

      {campaigns.length === 0 ? (
        <GlassPanel className="p-6 text-center text-zinc-400">
          No campaigns yet. Build an email from a template, then “Use in campaign”.
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <Link key={c.id} to={`/${orgSlug}/email/campaigns/${c.id}`}>
              <GlassPanel className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.08]">
                <div className="min-w-0">
                  <div className="text-zinc-100 font-medium truncate">{c.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{c.subject || <span className="italic">No subject yet</span>}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.status === 'sent' && <span className="text-xs text-zinc-400 tabular-nums">{c.stats?.delivered || 0} sent</span>}
                  <Badge tone={TONE[c.status] || 'draft'}>{c.status}</Badge>
                </div>
              </GlassPanel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
