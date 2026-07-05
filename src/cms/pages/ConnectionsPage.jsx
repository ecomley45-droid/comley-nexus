import { useEffect, useState } from 'react';
import { getIntegrationStatus, testIntegration } from '../../commerce/lib/api.js';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';

const SERVICES = [
  { key: 'supabase', name: 'Database' },
  { key: 'clerk', name: 'Sign-in' },
  { key: 'stripe', name: 'Payments' },
  { key: 'resend', name: 'Email' },
  { key: 'posthog', name: 'Analytics' },
  { key: 'upstash', name: 'Cart cache' },
  { key: 'pinecone', name: 'Product search' },
  { key: 'openai', name: 'AI search' },
];

// Read-only status + a "test connection" action -- deliberately not a
// credentials-entry UI, and deliberately free of implementation detail
// (env var names, config file references) since this is client-facing.
// Anything that needs explaining beyond "connected or not" is a support
// conversation, not copy on this page.
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
        Status of the services this workspace uses. If something you need shows as not connected,{' '}
        <a href="mailto:hello@comleycreative.com?subject=Enable%20a%20connection" className="text-glass-sky hover:underline">contact support</a> to have it enabled.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {SERVICES.map((s) => {
          const configured = status[s.key];
          const result = results[s.key];
          return (
            <GlassPanel key={s.key} className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-zinc-100">{s.name}</span>
                <Badge tone={configured ? 'published' : 'draft'}>{configured ? 'Connected' : 'Not connected'}</Badge>
              </div>
              {!configured && <p className="text-xs text-zinc-500 mb-2">Not set up for this workspace yet.</p>}
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
