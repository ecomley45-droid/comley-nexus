import { Link } from 'react-router-dom';
import { getViewer } from './api.js';
import { Avatar } from './AssigneePicker.jsx';

/**
 * Small clickable identity chip. Compact variant is used top-right in the
 * TopBar; the wide variant sits at the bottom of the hamburger drawer where
 * there's room for a subtitle.
 */
export default function ProfileChip({ variant = 'compact', onClick }) {
  const viewer = getViewer();
  const isWide = variant === 'wide';
  return (
    <Link
      to="/admin/ops/profile"
      onClick={onClick}
      title="Open profile & preferences"
      className={
        isWide
          ? 'flex items-center gap-2.5 rounded-xl px-2 py-2 text-left backdrop-blur-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition min-w-0'
          : 'flex items-center gap-2 rounded-lg pl-1 pr-2.5 py-1 backdrop-blur-xl bg-white/[0.06] border border-white/15 hover:bg-white/[0.10] transition min-w-0'
      }
    >
      <Avatar name={viewer.name} image={viewer.image} size={isWide ? 32 : 22} />
      <div className="min-w-0 flex-1">
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
