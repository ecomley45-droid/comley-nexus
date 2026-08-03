import { Link } from 'react-router-dom';
import { GlassPanel, GlassButton } from './Glass.jsx';

// The screen someone sees most often on their first day.
//
// Every list in the console used to answer "you have nothing" with one grey
// sentence and no way forward — "No media uploaded yet.", "No templates
// yet." A new workspace is nothing BUT empty lists, so that was the majority
// of the first-run experience, and each one made the user go back to the nav
// to guess where the thing gets created.
//
// So: say what this screen is for, and put the action that fills it right
// there. `action` is the primary next step; `secondary` is an escape hatch
// (docs, an alternative route) and is deliberately quieter.
export default function EmptyState({
  icon: Icon,
  title,
  children,
  action,          // { label, to } | { label, onClick }
  secondary,       // same shape
  compact = false,
}) {
  const Button = ({ spec, variant }) => {
    if (!spec) return null;
    const inner = <>{spec.icon && <spec.icon size={14} />}{spec.label}</>;
    if (spec.to) {
      return (
        <Link to={spec.to}>
          <GlassButton variant={variant} className="py-2">{inner}</GlassButton>
        </Link>
      );
    }
    return <GlassButton variant={variant} onClick={spec.onClick} className="py-2">{inner}</GlassButton>;
  };

  return (
    <GlassPanel className={`text-center ${compact ? 'px-5 py-8' : 'px-6 py-14'}`}>
      {Icon && (
        <div className="mx-auto mb-3 w-11 h-11 rounded-2xl grid place-items-center bg-white/[0.06] border border-white/10 text-zinc-400">
          <Icon size={20} />
        </div>
      )}
      <h2 className="text-base font-medium text-zinc-100">{title}</h2>
      {children && (
        <p className="mt-1.5 text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">{children}</p>
      )}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          <Button spec={action} />
          <Button spec={secondary} variant="secondary" />
        </div>
      )}
    </GlassPanel>
  );
}
