// The "Design" tab of the page editor's inspector — a no-code equivalent of
// hand-writing CSS for a block. Every control here writes a token into the
// selected section's `style` object; src/shared/blockStyle.js turns that
// object into the scoped stylesheet the page ships with.
//
// Two rules the whole panel follows:
//   1. Nothing is set until you set it. Controls start blank and emit no
//      CSS, so a block keeps its designed-in look until you override a
//      specific property.
//   2. What you change depends on the device switcher at the top. On
//      Desktop you edit the base value; on Tablet/Mobile you edit an
//      override that only applies below that breakpoint, and every control
//      that has a base value shows it as the placeholder you're overriding.

import { useEffect, useState } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignVerticalSpaceBetween,
  Rows3, Columns3, StretchHorizontal,
  Monitor, Tablet, Smartphone, Eye,
  LayoutTemplate, Move, Paintbrush, Frame, Type, WandSparkles, RotateCcw,
} from 'lucide-react';
import {
  InspectorGroup, Field, Segmented, NumberSlider, ColorField, ToggleRow, BoxField,
} from './DesignControls.jsx';
import {
  WIDTH_PRESETS, SHADOWS, BG_SIZES, BG_POSITIONS, ANIMATIONS, RESPONSIVE_FIELDS, BREAKPOINTS,
} from '../../../shared/blockStyle.js';
import { getMedia } from '../api.js';
import { GlassSelect } from '../ui/Glass.jsx';

export const DEVICES = [
  { value: 'desktop', label: 'Desktop', icon: Monitor, width: 1440 },
  { value: 'tablet', label: 'Tablet', icon: Tablet, width: 768 },
  { value: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
];

// Drop undefined/empty so a control the user cleared leaves no trace in the
// saved page rather than persisting `{ gap: undefined }` forever.
function prune(obj) {
  if (!obj) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const ALIGN_X_ROW = [
  { value: 'start', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'end', label: 'Right', icon: AlignRight },
  { value: 'stretch', label: 'Fill width', icon: StretchHorizontal },
];
const ALIGN_Y_ROW = [
  { value: 'start', label: 'Top', icon: AlignStartVertical },
  { value: 'center', label: 'Middle', icon: AlignCenterVertical },
  { value: 'end', label: 'Bottom', icon: AlignEndVertical },
  { value: 'between', label: 'Space between', icon: AlignVerticalSpaceBetween },
];
const TEXT_ALIGN_ROW = [
  { value: 'left', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right', label: 'Right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
];
const DIRECTION_ROW = [
  { value: 'vertical', label: 'Stack vertically', icon: Rows3 },
  { value: 'horizontal', label: 'Side by side', icon: Columns3 },
];

// Theme colors offered as one-click swatches so blocks stay on-brand.
function swatchesFromTheme(theme = {}) {
  const entries = [
    ['Accent', theme.accent || theme.primary],
    ['Primary', theme.primary],
    ['Secondary', theme.secondary],
    ['Background', theme.bg],
    ['Text', theme.text],
    ['Muted', theme.muted],
    ['Link', theme.link],
  ];
  const seen = new Set();
  return entries
    .filter(([, value]) => value && !seen.has(value) && seen.add(value))
    .map(([label, value]) => ({ label, value }));
}

export default function DesignInspector({ style = {}, onChange, device, onDeviceChange, theme = {} }) {
  const [mediaLibrary, setMediaLibrary] = useState([]);
  useEffect(() => { getMedia().then(setMediaLibrary).catch(() => setMediaLibrary([])); }, []);

  const isBase = device === 'desktop';
  const scoped = isBase ? style : (style[device] || {});
  const swatches = swatchesFromTheme(theme);

  // Writes to the base object on Desktop, to the per-device override map
  // otherwise. Responsive-capable keys only (see RESPONSIVE_FIELDS) — the
  // groups below hide everything else while a narrow device is selected.
  const set = (patch) => {
    if (isBase) { onChange(prune({ ...style, ...patch }) || {}); return; }
    const nextOverride = prune({ ...scoped, ...patch });
    const next = { ...style };
    if (nextOverride) next[device] = nextOverride; else delete next[device];
    onChange(prune(next) || {});
  };

  // Reset one group's keys, on the device currently being edited.
  const resetKeys = (keys) => {
    const patch = Object.fromEntries(keys.map((k) => [k, undefined]));
    set(patch);
  };

  const resetAll = () => onChange({});

  // While editing tablet/mobile, show the inherited desktop value as the
  // placeholder — so it's clear what you're overriding, and clearing an
  // override visibly falls back rather than going blank.
  const inherited = (key) => (isBase ? undefined : style[key]);
  const placeholderFor = (key, fallback = 'auto') => {
    const value = inherited(key);
    return value === undefined ? fallback : String(value);
  };

  const hidden = style.hideOn || {};
  const setHidden = (dev, value) => {
    const next = { ...hidden };
    if (value) next[dev] = true; else delete next[dev];
    onChange(prune({ ...style, hideOn: Object.keys(next).length ? next : undefined }) || {});
  };

  const responsiveOnly = !isBase;
  const overrideCount = Object.keys(scoped).length;

  return (
    <div>
      {/* Device switcher — doubles as the preview width control (the parent
          keeps the canvas in sync), so you design at the size you're seeing. */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/25 border border-white/10 mb-3">
        {DEVICES.map((d) => {
          const Icon = d.icon;
          const active = device === d.value;
          const count = d.value === 'desktop' ? 0 : Object.keys(style[d.value] || {}).length;
          return (
            <button
              key={d.value}
              onClick={() => onDeviceChange(d.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition ${
                active ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon size={13} />
              {d.label}
              {count > 0 && <span className="w-1.5 h-1.5 rounded-full bg-glass-sky" title={`${count} override(s)`} />}
            </button>
          );
        })}
      </div>

      {responsiveOnly && (
        <div className="mb-3 rounded-lg border border-glass-sky/25 bg-glass-sky/[0.07] px-3 py-2">
          <p className="text-[11px] text-sky-200/90 leading-relaxed">
            Editing <strong>{device}</strong> only — these values apply at {BREAKPOINTS[device]}px and below.
            Everything you leave blank keeps its desktop setting.
            {overrideCount > 0 && (
              <>
                {' '}
                <button onClick={() => set(Object.fromEntries(RESPONSIVE_FIELDS.map((k) => [k, undefined])))} className="underline hover:text-white">
                  Clear all {device} overrides
                </button>
              </>
            )}
          </p>
        </div>
      )}

      <InspectorGroup title="Alignment" icon={AlignCenter} defaultOpen onReset={() => resetKeys(['textAlign'])}>
        <Field label="Text alignment">
          <Segmented options={TEXT_ALIGN_ROW} value={scoped.textAlign} onChange={(v) => set({ textAlign: v })} />
        </Field>
      </InspectorGroup>

      <InspectorGroup
        title="Layout"
        icon={LayoutTemplate}
        defaultOpen
        onReset={() => resetKeys(['direction', 'alignX', 'alignY', 'width', 'minHeight'])}
      >
        <Field label="Content alignment · horizontal">
          <Segmented options={ALIGN_X_ROW} value={scoped.alignX} onChange={(v) => set({ alignX: v })} />
        </Field>
        <Field label="Content alignment · vertical">
          <Segmented options={ALIGN_Y_ROW} value={scoped.alignY} onChange={(v) => set({ alignY: v })} />
        </Field>
        <Field label="Stacking direction" hint="How the pieces inside this block flow.">
          <Segmented options={DIRECTION_ROW} value={scoped.direction} onChange={(v) => set({ direction: v })} />
        </Field>
        <Field label="Content width">
          <GlassSelect
            value={scoped.width || ''}
            onChange={(e) => set({ width: e.target.value || undefined })}
            className="w-full py-1.5 text-xs"
          >
            <option value="">Not set{inherited('width') ? ` (desktop: ${WIDTH_PRESETS[inherited('width')]?.label})` : ''}</option>
            {Object.entries(WIDTH_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}{preset.maxWidth ? ` — ${preset.maxWidth}` : ''}</option>
            ))}
          </GlassSelect>
        </Field>
        <Field label="Minimum height">
          <NumberSlider
            value={scoped.minHeight}
            onChange={(v) => set({ minHeight: v })}
            min={0}
            max={1200}
            step={10}
            placeholder={placeholderFor('minHeight')}
          />
        </Field>
      </InspectorGroup>

      <InspectorGroup
        title="Spacing"
        icon={Move}
        defaultOpen
        summary={scoped.padding ? 'custom' : ''}
        onReset={() => resetKeys(['gap', 'padding', 'margin'])}
      >
        <Field label="Spacing between elements">
          <NumberSlider value={scoped.gap} onChange={(v) => set({ gap: v })} min={0} max={120} placeholder={placeholderFor('gap', '0')} />
        </Field>
        <Field label="Padding (inside)">
          <BoxField value={scoped.padding} onChange={(v) => set({ padding: v })} min={0} max={400} />
        </Field>
        <Field label="Margin (outside)" hint="Negative values pull neighbouring blocks closer.">
          <BoxField value={scoped.margin} onChange={(v) => set({ margin: v })} min={-200} max={400} sides={['top', 'bottom']} />
        </Field>
      </InspectorGroup>

      <InspectorGroup title="Text" icon={Type} onReset={() => resetKeys(isBase ? ['textColor', 'headingColor', 'linkColor', 'fontScale'] : ['fontScale'])}>
        <Field label="Text size" hint="Scales every piece of text in this block together.">
          <NumberSlider value={scoped.fontScale} onChange={(v) => set({ fontScale: v })} min={0.6} max={2.5} step={0.05} unit="×" placeholder={placeholderFor('fontScale', '1')} />
        </Field>
        {isBase && (
          <>
            <Field label="Body text colour">
              <ColorField value={style.textColor} onChange={(v) => set({ textColor: v })} swatches={swatches} />
            </Field>
            <Field label="Heading colour">
              <ColorField value={style.headingColor} onChange={(v) => set({ headingColor: v })} swatches={swatches} />
            </Field>
            <Field label="Link colour">
              <ColorField value={style.linkColor} onChange={(v) => set({ linkColor: v })} swatches={swatches} />
            </Field>
          </>
        )}
      </InspectorGroup>

      {isBase && (
        <>
          <InspectorGroup
            title="Background"
            icon={Paintbrush}
            summary={style.bgImage ? 'image' : style.bgColor ? 'colour' : ''}
            onReset={() => resetKeys(['bgColor', 'bgImage', 'bgSize', 'bgPosition', 'bgOverlay', 'bgOverlayColor'])}
          >
            <Field label="Background colour">
              <ColorField value={style.bgColor} onChange={(v) => set({ bgColor: v })} swatches={swatches} />
            </Field>
            <Field label="Background image">
              <div className="flex gap-1.5">
                {mediaLibrary.length > 0 && (
                  <GlassSelect
                    value=""
                    onChange={(e) => { const m = mediaLibrary.find((x) => x.id === e.target.value); if (m) set({ bgImage: m.url }); }}
                    className="w-24 shrink-0 py-1.5 text-xs"
                  >
                    <option value="">Library…</option>
                    {mediaLibrary.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </GlassSelect>
                )}
                <input
                  value={style.bgImage || ''}
                  onChange={(e) => set({ bgImage: e.target.value || undefined })}
                  placeholder="https://… or /uploads/…"
                  className="flex-1 min-w-0 bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-glass-indigo/60"
                />
              </div>
            </Field>
            {style.bgImage && (
              <>
                <Field label="Image fit">
                  <GlassSelect value={style.bgSize || 'cover'} onChange={(e) => set({ bgSize: e.target.value })} className="w-full py-1.5 text-xs">
                    {Object.entries(BG_SIZES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </GlassSelect>
                </Field>
                <Field label="Image position">
                  <GlassSelect value={style.bgPosition || 'center'} onChange={(e) => set({ bgPosition: e.target.value })} className="w-full py-1.5 text-xs">
                    {Object.entries(BG_POSITIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </GlassSelect>
                </Field>
              </>
            )}
            <Field label="Overlay strength" hint="Tints the background so text stays readable on top of a busy image.">
              <NumberSlider value={style.bgOverlay} onChange={(v) => set({ bgOverlay: v })} min={0} max={100} unit="%" placeholder="0" />
            </Field>
            {!!style.bgOverlay && (
              <Field label="Overlay colour">
                <ColorField value={style.bgOverlayColor} onChange={(v) => set({ bgOverlayColor: v })} swatches={swatches} />
              </Field>
            )}
          </InspectorGroup>

          <InspectorGroup
            title="Border & shadow"
            icon={Frame}
            onReset={() => resetKeys(['radius', 'borderWidth', 'borderColor', 'shadow'])}
          >
            <Field label="Corner radius">
              <NumberSlider value={style.radius} onChange={(v) => set({ radius: v })} min={0} max={120} placeholder="0" />
            </Field>
            <Field label="Border thickness">
              <NumberSlider value={style.borderWidth} onChange={(v) => set({ borderWidth: v })} min={0} max={20} placeholder="0" />
            </Field>
            {!!style.borderWidth && (
              <Field label="Border colour">
                <ColorField value={style.borderColor} onChange={(v) => set({ borderColor: v })} swatches={swatches} />
              </Field>
            )}
            <Field label="Shadow">
              <GlassSelect value={style.shadow || ''} onChange={(e) => set({ shadow: e.target.value || undefined })} className="w-full py-1.5 text-xs">
                <option value="">Not set</option>
                {Object.entries(SHADOWS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </GlassSelect>
            </Field>
          </InspectorGroup>

          <InspectorGroup title="Effects" icon={WandSparkles} onReset={() => resetKeys(['opacity', 'animation'])}>
            <Field label="Opacity">
              <NumberSlider value={style.opacity} onChange={(v) => set({ opacity: v })} min={0} max={100} unit="%" placeholder="100" />
            </Field>
            <Field label="Entrance animation" hint="Plays once when the page loads. Respects the visitor's reduced-motion setting.">
              <GlassSelect value={style.animation || 'none'} onChange={(e) => set({ animation: e.target.value === 'none' ? undefined : e.target.value })} className="w-full py-1.5 text-xs">
                {Object.entries(ANIMATIONS).map(([key, a]) => <option key={key} value={key}>{a.label}</option>)}
              </GlassSelect>
            </Field>
          </InspectorGroup>

          <InspectorGroup
            title="Show & hide"
            icon={Eye}
            summary={Object.keys(hidden).length ? `hidden on ${Object.keys(hidden).join(', ')}` : ''}
            onReset={() => onChange(prune({ ...style, hideOn: undefined }) || {})}
          >
            <p className="text-[11px] text-zinc-600 mb-1.5">Hide this block on screens you don't want it on — it stays in the editor either way.</p>
            {DEVICES.map((d) => (
              <ToggleRow
                key={d.value}
                label={`Hide on ${d.label.toLowerCase()}`}
                checked={!!hidden[d.value]}
                onChange={(v) => setHidden(d.value, v)}
              />
            ))}
          </InspectorGroup>
        </>
      )}

      {!isBase && (
        <p className="text-[11px] text-zinc-600 px-1 mt-1">
          Colours, background, borders and effects are set once on Desktop and apply everywhere.
          Switch to <button onClick={() => onDeviceChange('desktop')} className="underline hover:text-zinc-300">Desktop</button> to change them.
        </p>
      )}

      <button
        onClick={resetAll}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-red-300 py-2 rounded-lg border border-white/10 hover:border-red-400/30 transition"
      >
        <RotateCcw size={12} /> Reset all design on this block
      </button>
    </div>
  );
}
