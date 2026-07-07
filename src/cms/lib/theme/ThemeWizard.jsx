import { useMemo, useState } from 'react';
import { GlassPanel, GlassButton } from '../ui/Glass.jsx';
import { FONT_STACKS, FONT_SCALES } from '../../../shared/theme.js';
import { THEME_PRESETS } from '../../../shared/themePresets.js';
import { buildMockupHtml } from './themeMockup.js';
import ScaledPreviewFrame from '../ScaledPreviewFrame.jsx';

// Guided, no-HTML-knowledge-required setup flow for a workspace's theme.
// Same lightweight step-machine convention as PasteInModal.jsx (a plain
// string `step` + conditional render blocks) rather than a form library --
// there's no validation beyond "a color/option is picked", so a library
// would add more ceremony than it saves.
//
// The whole flow edits one `theme` object incrementally (see `theme` state
// below) rather than collecting per-step answers to merge at the end --
// that's what makes Back safe: navigating back and forward never drops an
// earlier answer, because there's nothing to re-merge.
//
// `onApply(theme)` mirrors Design Settings' own save flow: it only updates
// the in-memory globalSettings (via the caller's updateTheme), the caller
// still needs to hit the page's own Save button to persist it -- nothing
// publishes silently from inside the wizard.

const STEPS = ['preset', 'colors', 'fonts', 'review'];

const COLOR_FIELDS = [
  { key: 'primary', label: 'Your main brand color', hint: 'Used for headers, borders, and general accents.' },
  { key: 'accent', label: 'Buttons & highlights', hint: 'Call-to-action buttons, stat numbers, highlighted prices.' },
  { key: 'link', label: 'Links', hint: 'Text links and small highlighted labels.' },
  { key: 'bg', label: 'Page background', hint: 'The background behind everything on the page.' },
  { key: 'text', label: 'Body text', hint: 'Main readable text color.' },
];

function PresetStep({ theme, onPick }) {
  return (
    <>
      <p className="text-sm text-zinc-400 mb-4">Pick a starting point -- you can change anything after.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onPick(preset.theme)}
            className="rounded-xl border border-white/10 hover:border-white/30 overflow-hidden text-left transition"
          >
            <div className="h-14 flex">
              <div className="flex-1" style={{ background: preset.theme.primary }} />
              <div className="flex-1" style={{ background: preset.theme.accent }} />
              <div className="flex-1" style={{ background: preset.theme.bg }} />
            </div>
            <div className="px-3 py-2 text-sm text-zinc-200">{preset.name}</div>
          </button>
        ))}
        <button
          onClick={() => onPick(theme)}
          className="rounded-xl border border-dashed border-white/15 hover:border-white/30 flex items-center justify-center text-sm text-zinc-400 hover:text-zinc-200 transition min-h-[5.5rem]"
        >
          Start from scratch
        </button>
      </div>
    </>
  );
}

function ColorsStep({ theme, onChange }) {
  return (
    <>
      <p className="text-sm text-zinc-400 mb-4">Pick each color one at a time.</p>
      <div className="space-y-3">
        {COLOR_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center gap-3">
            <input
              type="color"
              value={theme[key] || '#000000'}
              onChange={(e) => onChange({ [key]: e.target.value })}
              className="w-10 h-10 rounded-lg border border-white/20 bg-transparent shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm text-zinc-200">{label}</div>
              <div className="text-xs text-zinc-500">{hint}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FontsStep({ theme, onChange }) {
  return (
    <>
      <p className="text-sm text-zinc-400 mb-4">Choose a font style and text size.</p>
      <div className="mb-5">
        <div className="text-xs text-zinc-400 mb-2">Font</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(FONT_STACKS).map(([key, { label, value }]) => (
            <button
              key={key}
              onClick={() => onChange({ fontFamily: key })}
              className={`rounded-xl border p-3 text-left transition ${theme.fontFamily === key ? 'border-glass-indigo bg-white/10' : 'border-white/10 hover:border-white/25'}`}
              style={{ fontFamily: value }}
            >
              <div className="text-sm text-zinc-100">{label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Aa Bb Cc</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs text-zinc-400 mb-2">Text size</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(FONT_SCALES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => onChange({ fontScale: key })}
              className={`rounded-xl border p-3 text-center transition ${theme.fontScale === key ? 'border-glass-indigo bg-white/10' : 'border-white/10 hover:border-white/25'}`}
            >
              <div className="text-sm text-zinc-100">{label}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function ThemeWizard({ initialTheme, onApply, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [theme, setTheme] = useState(() => ({ ...initialTheme }));
  const step = STEPS[stepIndex];

  const patchTheme = (patch) => setTheme((prev) => ({ ...prev, ...patch }));
  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const mockupSrcDoc = useMemo(() => buildMockupHtml(theme), [theme]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <GlassPanel className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-zinc-100">Style your site</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              {step === 'preset' && <PresetStep theme={theme} onPick={(t) => { setTheme(t); goNext(); }} />}
              {step === 'colors' && <ColorsStep theme={theme} onChange={patchTheme} />}
              {step === 'fonts' && <FontsStep theme={theme} onChange={patchTheme} />}
              {step === 'review' && (
                <>
                  <p className="text-sm text-zinc-400 mb-2">This is how your site will look. Apply it, or go back to change anything.</p>
                </>
              )}
            </div>
            <div className="min-h-[20rem]">
              <div className="text-xs text-zinc-500 mb-1.5">Live preview</div>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <ScaledPreviewFrame srcDoc={mockupSrcDoc} baseWidth={1440} height={384} sandbox="" bg="#000" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-5 pt-4 border-t border-white/10">
            <GlassButton variant="secondary" onClick={goBack} disabled={stepIndex === 0}>Back</GlassButton>
            <div className="flex gap-2">
              <GlassButton variant="secondary" onClick={onClose}>Cancel</GlassButton>
              {step === 'review' ? (
                <GlassButton onClick={() => onApply(theme)}>Apply</GlassButton>
              ) : (
                <GlassButton onClick={goNext}>Next</GlassButton>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
