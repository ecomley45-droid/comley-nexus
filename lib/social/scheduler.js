// Timed delivery for scheduled posts. Two backends behind one enqueue():
//
//   • QStash (prod): when QSTASH_TOKEN + PUBLIC_BASE_URL are set, we ask
//     Upstash QStash to POST our own /api/social/cron/publish endpoint at the
//     scheduled time (Upstash-Not-Before). This survives the serverless model
//     — no long-running process needed. Uses the QStash REST API directly, so
//     no extra npm dependency.
//
//   • In-process timer (local/sandbox): with no QSTASH_TOKEN we set a
//     setTimeout that invokes the publish callback in-process. Timers die on
//     restart, but every scheduled post also lives in the DB as status
//     'scheduled', so the /api/social/cron/publish-due sweep is the durable
//     backstop (run it from Vercel Cron in prod, or call it manually in dev).
//
// The cron endpoints are the source of truth; enqueue() is just a nudge to
// fire promptly rather than waiting for the next sweep.

const QSTASH_URL = 'https://qstash.upstash.io/v2/publish';

export const usingQStash = () => !!(process.env.QSTASH_TOKEN && process.env.PUBLIC_BASE_URL);

const timers = new Map(); // postId -> Timeout (in-process fallback only)

// Schedule a single post. `runNow` is an async fn that publishes the post
// (used by the in-process fallback); the QStash path calls our HTTP endpoint
// instead, so it doesn't need the callback.
export async function enqueue({ postId, scheduledAt, runNow }) {
  const when = new Date(scheduledAt).getTime();
  const delay = when - Date.now();

  if (usingQStash()) {
    const target = `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/social/cron/publish`;
    const notBefore = Math.floor(when / 1000);
    try {
      const res = await fetch(`${QSTASH_URL}/${encodeURIComponent(target)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
          'Upstash-Not-Before': String(notBefore),
          // QStash retries on non-2xx; cap it so a poison post doesn't loop.
          'Upstash-Retries': '3',
        },
        body: JSON.stringify({ postId, secret: process.env.SOCIAL_CRON_SECRET || '' }),
      });
      if (!res.ok) throw new Error(`QStash ${res.status} ${await res.text()}`);
      return { backend: 'qstash' };
    } catch (e) {
      console.error('[social/scheduler] QStash enqueue failed, relying on cron sweep:', e.message);
      return { backend: 'qstash-failed' };
    }
  }

  // In-process fallback. Only arm a timer for near-term posts (< 24h) so we
  // don't hold thousands of long-lived timers; the sweep covers the rest.
  if (typeof runNow === 'function' && delay < 24 * 3600_000) {
    clearTimeout(timers.get(postId));
    const t = setTimeout(() => {
      timers.delete(postId);
      Promise.resolve(runNow()).catch((e) => console.error('[social/scheduler] in-process publish failed:', e.message));
    }, Math.max(0, delay));
    if (typeof t.unref === 'function') t.unref(); // don't keep the process alive
    timers.set(postId, t);
  }
  return { backend: 'timer' };
}

export function cancel(postId) {
  const t = timers.get(postId);
  if (t) { clearTimeout(t); timers.delete(postId); }
}
