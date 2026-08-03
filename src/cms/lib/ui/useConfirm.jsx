import { useCallback, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { GlassButton } from './Glass.jsx';

// Replaces window.confirm for destructive actions.
//
// The native dialog was wrong here on four counts: it can't be styled, so it
// breaks the console's look at exactly the moment the user is deciding
// something irreversible; it blocks the whole tab; it says "Delete this
// page?" without saying WHICH page or what goes with it; and its OK button
// looks identical to the harmless one, so muscle memory does the deleting.
//
// Usage keeps the call site as short as the old one:
//
//   const [confirm, confirmUi] = useConfirm();
//   ...
//   if (!(await confirm({ title: 'Delete "About"?', body: '…' }))) return;
//   ...
//   return <>{confirmUi}<Rest /></>;
//
// No provider to mount: the hook hands back its own element. That matters
// because these call sites live under three different layouts.
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setState({
      title: 'Are you sure?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
      ...(typeof options === 'string' ? { title: options } : options),
    });
  }), []);

  const close = (answer) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setState(null);
  };

  const ui = state ? (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nx-confirm-title"
      // Escape and a backdrop click both cancel — never confirm. The
      // destructive path should always be the deliberate one.
      onClick={() => close(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          {state.tone === 'danger' && (
            <div className="w-9 h-9 shrink-0 rounded-xl grid place-items-center bg-red-500/15 border border-red-400/25 text-red-300">
              <AlertTriangle size={17} />
            </div>
          )}
          <div className="min-w-0">
            <h2 id="nx-confirm-title" className="text-sm font-medium text-zinc-100">{state.title}</h2>
            {state.body && <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">{state.body}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.06] transition"
          >
            {state.cancelLabel}
          </button>
          <GlassButton
            variant={state.tone === 'danger' ? 'destructive' : 'primary'}
            onClick={() => close(true)}
            // Focused on open so Enter confirms and Escape cancels, which is
            // what a keyboard user expects from a dialog like this.
            autoFocus
            className="py-1.5 text-sm"
          >
            {state.confirmLabel}
          </GlassButton>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, ui];
}

export default useConfirm;
