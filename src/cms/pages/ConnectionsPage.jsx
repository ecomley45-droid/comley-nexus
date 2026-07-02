import { useEffect, useState } from 'react';
import { getIntegrationStatus, testIntegration } from '../../commerce/lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';

const SERVICES = [
  { key: 'supabase', name: 'Supabase', envVars: 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  { key: 'clerk', name: 'Clerk', envVars: 'CLERK_SECRET_KEY' },
  { key: 'stripe', name: 'Stripe', envVars: 'STRIPE_SECRET_KEY' },
  { key: 'resend', name: 'Resend', envVars: 'RESEND_API_KEY' },
  { key: 'posthog', name: 'PostHog', envVars: 'POSTHOG_API_KEY' },
  { key: 'upstash', name: 'Upstash Redis', envVars: 'UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN' },
  { key: 'pinecone', name: 'Pinecone', envVars: 'PINECONE_API_KEY' },
  { key: 'openai', name: 'OpenAI', envVars: 'OPENAI_API_KEY' },
];

// Read-only status + a server-side "test connection" action — deliberately
// not a credentials-entry UI. Secrets live in .env server-side (see
// lib/commerce/env.js); nothing here ever touches the browser.
export default function ConnectionsPage() {
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState({});
  const [testing, setTesting] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    getIntegrationStatus().then(setStatus).catch((e) => setError(e.message));
  }, []);

  const runTest = async (key) => {
    setTesting((t) => ({ ...t, [key]: true }));
    const result = await testIntegration(key);
    setResults((r) => ({ ...r, [key]: result }));
    setTesting((t) => ({ ...t, [key]: false }));
  };

  if (error) return <p className="text-red-400">{error}</p>;
  if (!status) return <p className="text-zinc-400">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Connections</h1>
      <p className="text-zinc-500 text-sm mb-4">
        Integration status, read from server-side <code>.env</code> — see <code>COMMERCE_SETUP.md</code> for
        what each variable unlocks. No secrets are entered or stored here.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {SERVICES.map((s) => {
          const configured = status[s.key];
          const result = results[s.key];
          return (
            <GlassPanel key={s.key} className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-zinc-100">{s.name}</span>
                <Badge tone={configured ? 'published' : 'draft'}>{configured ? 'Configured' : 'Not configured'}</Badge>
              </div>
              {!configured && <p className="text-xs text-zinc-500 mb-2">Set: <code>{s.envVars}</code></p>}
              <GlassButton variant="secondary" onClick={() => runTest(s.key)} disabled={testing[s.key]} className="text-xs py-1.5">
                {testing[s.key] ? 'Testing…' : 'Test connection'}
              </GlassButton>
              {result && (
                <p className={`text-xs mt-2 ${result.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{result.message}</p>
              )}
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
