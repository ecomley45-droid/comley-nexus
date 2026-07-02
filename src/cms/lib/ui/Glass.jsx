// Shared "liquid glass" presentational primitives used across the CMS admin
// and commerce storefront. Kept dumb on purpose — no data-fetching, just
// consistent frosted-glass styling so ~15 page files don't repeat the same
// long className strings.

export function GlassShell({ children, className = '' }) {
  return (
    <div className={`relative min-h-screen bg-glass-base text-zinc-100 overflow-x-hidden ${className}`}>
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-20 w-[36rem] h-[36rem] rounded-full bg-glass-indigo/25 blur-[120px] animate-drift-a" />
        <div className="absolute top-1/3 -right-24 w-[32rem] h-[32rem] rounded-full bg-glass-fuchsia/20 blur-[130px] animate-drift-b" />
        <div className="absolute bottom-0 left-1/4 w-[28rem] h-[28rem] rounded-full bg-glass-sky/15 blur-[110px] animate-drift-c" />
      </div>
      {children}
    </div>
  );
}

export function GlassPanel({ children, className = '', as: Tag = 'div', ...props }) {
  return (
    <Tag
      className={`backdrop-blur-xl bg-white/[0.06] border border-white/10 rounded-2xl shadow-xl shadow-black/20 animate-panel-in ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition duration-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100';
const BUTTON_VARIANTS = {
  primary: 'px-4 py-2 text-white bg-gradient-to-tr from-glass-indigo to-glass-fuchsia shadow-lg shadow-glass-fuchsia/20 hover:brightness-110',
  secondary: 'px-4 py-2 text-zinc-100 backdrop-blur-xl bg-white/10 border border-white/15 hover:bg-white/15',
  ghost: 'px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-white/10',
  danger: 'px-3 py-1.5 text-red-300 hover:text-red-200 hover:bg-red-500/10',
};

export function GlassButton({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

const FIELD_BASE =
  'backdrop-blur-xl bg-white/[0.06] border border-white/15 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-glass-indigo/60 focus:ring-2 focus:ring-glass-indigo/20 transition';

export function GlassInput({ className = '', ...props }) {
  return <input className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function GlassTextarea({ className = '', ...props }) {
  return <textarea className={`${FIELD_BASE} font-mono text-xs ${className}`} {...props} />;
}

export function GlassSelect({ children, className = '', ...props }) {
  return (
    <select className={`${FIELD_BASE} ${className}`} {...props}>
      {children}
    </select>
  );
}

const BADGE_STYLES = {
  published: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  draft: 'bg-zinc-400/15 text-zinc-300 border-zinc-400/30',
  default: 'bg-glass-sky/15 text-sky-300 border-glass-sky/30',
};

export function Badge({ children, tone = 'default', className = '' }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${BADGE_STYLES[tone] || BADGE_STYLES.default} ${className}`}>
      {children}
    </span>
  );
}
