import { useEffect, useState } from 'react';
import { setPausedHandler } from './api.js';

// Mounted once at the app root (App.jsx). Any api.js request() call that
// gets a 423 (paused workspace -- see requireOrg in server.js/lib/ops/routes.js)
// triggers this full-page takeover instead of letting the underlying page
// render with broken/missing data. Deliberately generic wording -- never
// reveals that the real cause is a paused workspace.
export default function PausedGate({ children }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPausedHandler(() => setPaused(true));
    return () => setPausedHandler(null);
  }, []);

  if (paused) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-glass-base text-zinc-100 px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-zinc-400">
            This workspace is temporarily unavailable. Please contact support if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
