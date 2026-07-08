import UserIntegrations from '../lib/UserIntegrations.jsx';

// Per-user integrations: each person connects their OWN accounts (Google/
// GitHub/Slack logins and Claude/ChatGPT keys), scoped to their signed-in
// email. This deliberately does NOT show the platform's shared services
// (Stripe, PostHog, database, etc.) -- those are configured by the platform
// operator and are never something a workspace user connects or uses here.
export default function ConnectionsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Integrations</h1>
      <p className="text-zinc-500 text-sm mb-4">
        Connect your own accounts to use with the app. These are private to you — no one else in the workspace can see or use your connections.
      </p>
      <UserIntegrations />
    </div>
  );
}
