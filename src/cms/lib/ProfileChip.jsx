import { Link } from 'react-router-dom';
import { Avatar } from './AssigneePicker.jsx';
import { useMe, useOrgBase } from './useMe.jsx';

/**
 * Small clickable identity chip. Compact variant is used top-right in the
 * AppShell top bar; the wide variant sits at the bottom of the sidebar rail
 * where there's room for a subtitle.
 *
 * Identity comes from the server-derived /api/me viewer (useMe) so it
 * matches whatever Clerk/the DB think you are — not from a stale local
 * cache.
 */
export default function ProfileChip({ variant = 'compact', onClick }) {
  const { me } = useMe();
  const viewer = me?.viewer || { name: 'Signed out', email: '', image: null };
  const base = useOrgBase() || '/admin';
  const isWide = variant === 'wide';
  return (
    <Link
      to={`${base}/ops/profile`}
      onClick={onClick}
      title="Open profile & preferences"
      className={
        isWide
          ? 'flex items-center gap-2.5 rounded-xl px-2 py-2 text-left backdrop-blur-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition min-w-0'
          : 'flex items-center gap-2 rounded-lg pl-1 pr-2.5 py-1 backdrop-blur-xl bg-white/[0.06] border border-white/15 hover:bg-white/[0.10] transition min-w-0'
      }
    >
      <Avatar name={viewer.name} image={viewer.image} size={isWide ? 32 : 22} />
      {/* In the compact top-bar chip, drop the name on narrow screens so it
          never overflows the header — the avatar alone is enough there. */}
      <div className={`min-w-0 flex-1 ${isWide ? '' : 'hidden sm:block'}`}>
        <div className={`truncate ${isWide ? 'text-sm font-semibold text-zinc-100' : 'text-xs font-medium text-zinc-100'}`}>
          {viewer.name}
        </div>
        {isWide && viewer.email && viewer.email !== viewer.name && (
          <div className="text-xs text-zinc-500 truncate">{viewer.email}</div>
        )}
      </div>
    </Link>
  );
}
