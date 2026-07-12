import { useEffect, useState } from 'react';
import { GlassPanel, GlassButton, Badge } from '../lib/ui/Glass.jsx';
import { getFormSubmissions, markFormSubmission, deleteFormSubmission } from '../lib/api.js';

// Inbox for Contact Form / Newsletter block submissions (stored via the
// public POST /api/public/forms endpoint). Read state is per-submission;
// deleting is permanent.

export default function FormsPage() {
  const [subs, setSubs] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getFormSubmissions().then(setSubs).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!subs) return <p className="text-zinc-300">Loading…</p>;

  const toggle = (sub) => {
    const opening = expanded !== sub.id;
    setExpanded(opening ? sub.id : null);
    if (opening && !sub.read) {
      setSubs(subs.map((s) => (s.id === sub.id ? { ...s, read: true } : s)));
      markFormSubmission(sub.id, true).catch(() => {});
    }
  };

  const remove = (id) => {
    setSubs(subs.filter((s) => s.id !== id));
    deleteFormSubmission(id).catch(() => {});
  };

  const unread = subs.filter((s) => !s.read).length;

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Forms</h1>
        {unread > 0 && <Badge>{unread} unread</Badge>}
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Submissions from Contact Form and Newsletter blocks on your published pages.
      </p>

      {subs.length === 0 && (
        <GlassPanel className="p-8 text-center">
          <p className="text-zinc-300 font-medium mb-1">No submissions yet</p>
          <p className="text-sm text-zinc-500">
            Add a Contact Form or Newsletter block to a page — submissions will land here.
          </p>
        </GlassPanel>
      )}

      <div className="space-y-2">
        {subs.map((sub) => (
          <GlassPanel key={sub.id} className="p-0 overflow-hidden">
            <button onClick={() => toggle(sub)} className="w-full text-left p-4 flex items-center gap-3">
              {!sub.read && <span className="w-2 h-2 rounded-full bg-glass-sky shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${sub.read ? 'text-zinc-400' : 'text-zinc-100 font-medium'}`}>
                  {sub.fields.email || sub.fields.name || sub.formName}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {sub.formName}{sub.pagePath ? ` · /${sub.pagePath}` : ''}
                </div>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">{new Date(sub.submittedAt).toLocaleString()}</span>
            </button>
            {expanded === sub.id && (
              <div className="border-t border-white/10 p-4 overflow-x-auto">
                <table className="text-sm w-full min-w-sm">
                  <tbody>
                    {Object.entries(sub.fields).map(([k, v]) => (
                      <tr key={k}>
                        <td className="text-zinc-500 pr-4 py-1 align-top capitalize whitespace-nowrap">{k}</td>
                        <td className="text-zinc-200 py-1 break-words">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex justify-end">
                  <GlassButton variant="danger" onClick={() => remove(sub.id)}>Delete</GlassButton>
                </div>
              </div>
            )}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
