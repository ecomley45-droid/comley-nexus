// Design tokens are user input that ends up inside a <style> block, so the
// normaliser is a security boundary as much as a data one. These pin both
// halves: nothing unexpected survives normalisation, and the CSS that comes
// out means what the inspector said it would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSectionStyle, buildSectionStyleCss, buildPageStyleCss,
  hasSectionStyle, describeSectionStyle,
} from '../src/shared/blockStyle.js';

test('an empty or absent style normalises to undefined', () => {
  assert.equal(normalizeSectionStyle(undefined), undefined);
  assert.equal(normalizeSectionStyle({}), undefined);
  assert.equal(normalizeSectionStyle({ animation: 'none' }), undefined, 'an inert value is not a style');
  assert.equal(hasSectionStyle({}), false);
});

test('colors: only parseable forms survive', () => {
  const ok = ['#fff', '#ffffff', '#ffffffaa', 'rgb(1,2,3)', 'rgba(1,2,3,.5)', 'transparent', 'var(--color-accent)'];
  for (const c of ok) assert.equal(normalizeSectionStyle({ bgColor: c })?.bgColor, c, `${c} should survive`);

  const bad = ['red; } body { display:none } .x {', 'url(x)', 'expression(alert(1))', '#12', '"; }'];
  for (const c of bad) assert.equal(normalizeSectionStyle({ bgColor: c }), undefined, `${c} should be dropped`);
});

test('background images: only absolute http(s), root-relative or data: URIs', () => {
  assert.ok(normalizeSectionStyle({ bgImage: 'https://cdn.test/a.png' })?.bgImage);
  assert.ok(normalizeSectionStyle({ bgImage: '/uploads/a.png' })?.bgImage);
  for (const u of ['a.png") ; } script {', 'javascript:x', "x'", 'a b.png', 'data:text/html,<script>']) {
    assert.equal(normalizeSectionStyle({ bgImage: u }), undefined, `${u} should be dropped`);
  }
});

test('numbers clamp, enums are allowlisted, unknown keys vanish', () => {
  const s = normalizeSectionStyle({
    radius: 1e9, gap: -50, opacity: 500, fontScale: 99,
    shadow: 'enormous', direction: 'sideways', animation: 'explode',
    padding: { top: 40, bogus: 5, left: 'abc' },
    somethingElse: 'nope',
  });
  assert.equal(s.radius, 200);
  assert.equal(s.gap, 0);
  assert.equal(s.opacity, 100);
  assert.equal(s.fontScale, 2.5);
  assert.ok(!('shadow' in s) && !('direction' in s) && !('animation' in s), 'unknown enum values are dropped');
  assert.deepEqual(s.padding, { top: 40 });
  assert.ok(!('somethingElse' in s));
});

test('responsive overrides keep only responsive-capable fields', () => {
  const s = normalizeSectionStyle({ mobile: { textAlign: 'center', bgColor: '#fff', gap: 12 } });
  assert.deepEqual(s.mobile, { gap: 12, textAlign: 'center' }, 'bgColor is desktop-only and must not ride along');
});

test('CSS is scoped to the section, and a hostile id yields nothing', () => {
  const css = buildSectionStyleCss('sec-1', { padding: { top: 10 } });
  assert.ok(css.startsWith('[data-section-id="sec-1"]{'));
  assert.equal(buildSectionStyleCss('sec"] , * {color:red} [x="', { padding: { top: 10 } }), '',
    'an id that could break out of the attribute selector is refused outright');
});

test('untouched sections contribute no CSS at all', () => {
  assert.equal(buildSectionStyleCss('sec-1', undefined), '');
  assert.equal(buildPageStyleCss([{ id: 'a', html: '<p>x</p>' }, { id: 'b' }]), '');
});

test('alignment maps to the right axis for the direction', () => {
  const row = buildSectionStyleCss('s', { direction: 'horizontal', alignX: 'center', alignY: 'start' });
  assert.ok(row.includes('flex-direction:row'));
  assert.ok(row.includes('justify-content:center'), 'alignX is the main axis in a row');
  assert.ok(row.includes('align-items:flex-start'));

  const col = buildSectionStyleCss('s', { direction: 'vertical', alignX: 'center', alignY: 'start' });
  assert.ok(col.includes('align-items:center'), 'alignX is the cross axis in a column');
  assert.ok(col.includes('justify-content:flex-start'));
});

test('a responsive direction flip re-emits inherited alignment on the right axis', () => {
  const css = buildSectionStyleCss('s', {
    direction: 'horizontal', alignX: 'center', alignY: 'center', gap: 24,
    mobile: { direction: 'vertical' },
  });
  const mobile = css.split('@media (max-width:640px)')[1];
  assert.ok(mobile.includes('flex-direction:column'));
  assert.ok(mobile.includes('align-items:center'), 'horizontal centring must be preserved when the stack flips');
  assert.ok(mobile.includes('gap:24px'), 'inherited gap comes along so the rule is self-consistent');
});

test('an override that touches no flex property stays override-only', () => {
  const css = buildSectionStyleCss('s', { gap: 24, tablet: { padding: { top: 10 } } });
  const tablet = css.split('@media (max-width:1024px)')[1];
  assert.ok(tablet.includes('padding-top:10px'));
  assert.ok(!tablet.includes('gap:'), 'an unrelated override must not restate the base');
});

test('hideOn emits non-overlapping media queries, mobile last', () => {
  const css = buildSectionStyleCss('s', { hideOn: { desktop: true, tablet: true, mobile: true } });
  assert.ok(css.includes('@media (min-width:1025px)'));
  assert.ok(css.includes('@media (min-width:641px) and (max-width:1024px)'));
  assert.ok(css.includes('@media (max-width:640px)'));
});

test('animation keyframes ship once, and only when something animates', () => {
  const withAnim = buildPageStyleCss([{ id: 'a', style: { animation: 'fade-up' } }, { id: 'b', style: { animation: 'fade-in' } }]);
  assert.equal(withAnim.split('@keyframes nx-anim-up').length - 1, 2, 'defined once per motion preference, not once per section');
  assert.ok(withAnim.includes('prefers-reduced-motion'), 'motion must be opt-out for people who ask');
  assert.ok(!buildPageStyleCss([{ id: 'a', style: { gap: 4 } }]).includes('@keyframes'));
});

test('describeSectionStyle summarises without throwing on junk', () => {
  assert.equal(describeSectionStyle(undefined), '');
  assert.ok(describeSectionStyle({ direction: 'horizontal', padding: { top: 4 } }).includes('row'));
});
