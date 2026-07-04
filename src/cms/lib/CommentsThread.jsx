import { useCallback, useEffect, useState } from 'react';
import { addFeedbackComment, deleteFeedbackComment, editFeedbackComment, getFeedbackComments } from './api.js';
import { GlassButton, GlassTextarea } from './ui/Glass.jsx';
import { Avatar } from './AssigneePicker.jsx';

const EDIT_WINDOW_MS = 60_000;

function fmtWhen(ms) {
  try {
    return new Date(ms).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(ms); }
}

/**
 * Threaded comments on a feedback ticket. Same product model as Slack/Jira —
 * each message is its own card, with a small timestamp underneath, and the
 * author gets one minute after posting to edit or delete before the row locks.
 * The 60s window is enforced server-side (see lib/ops/routes.js); the UI just
 * hides the buttons once the window elapses.
 */
export default function CommentsThread({ ticketId }) {
  const [comments, setComments] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    getFeedbackComments(ticketId)
      .then((res) => { setComments(res.comments || []); setViewer(res.viewer || null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Poll our clock so Edit/Delete buttons disappear once the 60s window passes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const canModify = (c) =>
    viewer && c.author_email === viewer.email && now - c.created_at < EDIT_WINDOW_MS;

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError('');
    try {
      const created = await addFeedbackComment(ticketId, body);
      setComments((prev) => [...prev, created]);
      setDraft('');
      setNow(Date.now());
    } catch (e) { setError(e.message); }
    finally { setPosting(false); }
  };

  const saveEdit = async (id) => {
    const body = editDraft.trim();
    if (!body) return;
    try {
      const updated = await editFeedbackComment(id, body);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    try {
      await deleteFeedbackComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { setError(e.message); }
  };

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-3">No comments yet — start the conversation below.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <div className="pt-0.5">
                <Avatar name={c.author_name} image={c.author_image} size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="text-sm font-semibold text-zinc-100 mb-0.5">{c.author_name}</div>
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <GlassTextarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <GlassButton onClick={() => saveEdit(c.id)} disabled={!editDraft.trim()} className="text-xs py-1">
                          Save
                        </GlassButton>
                        <GlassButton variant="secondary" onClick={() => setEditingId(null)} className="text-xs py-1">
                          Cancel
                        </GlassButton>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">{c.body}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 pl-1 text-xs text-zinc-500">
                  <span>{fmtWhen(c.created_at)}</span>
                  {c.edited && <span className="italic">· edited</span>}
                  {editingId !== c.id && canModify(c) && (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(c.id); setEditDraft(c.body); }}
                        className="font-semibold text-glass-indigo hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="font-semibold text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2.5">
        {viewer && (
          <div className="pt-0.5">
            <Avatar name={viewer.name} image={viewer.image} size={28} />
          </div>
        )}
        <div className="flex-1">
          <GlassTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(); }}
            placeholder="Add a comment…"
            rows={3}
            disabled={posting}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-zinc-500">
              You can edit or delete a comment for 1 minute after posting.
            </span>
            <GlassButton onClick={post} disabled={posting || !draft.trim()} className="text-sm py-1.5">
              {posting ? 'Posting…' : 'Comment'}
            </GlassButton>
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </section>
  );
}
