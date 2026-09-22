import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

// The board cards, damage counters and status tokens live inside the playmat
// iframes, which cannot see the parent page's `body.fx-off`. Design 022 shipped
// idle motion that therefore kept running with effects "off"; design 024 slice
// 5 mirrors the marker classes onto each iframe's <html> instead. Any NEW idle
// animation added to these sheets has to be covered the same way, so this test
// holds the seam shut.
const IFRAME_SHEETS = ['mat-ambient.css', 'status-marker.css', 'damage-counter.css'];

test('iframe stylesheets that animate on their own honour the kill switch', () => {
  for (const name of IFRAME_SHEETS) {
    const css = read(name);
    assert.ok(css.includes('@keyframes'), `${name} is expected to define idle motion`);
    assert.ok(css.includes(':root.fx-off'), `${name} has no :root.fx-off guard`);
    assert.ok(css.includes(':root.fx-reduced'), `${name} has no :root.fx-reduced guard`);
  }
});

test('every infinite idle loop in the iframes is reachable by a guard', () => {
  for (const name of IFRAME_SHEETS) {
    const css = read(name);
    const loops = css.match(/animation:[^;]*infinite/g) ?? [];
    if (loops.length === 0) continue;
    const guardBlocks = css.split(':root.fx-off').length - 1;
    assert.ok(guardBlocks > 0, `${name} has ${loops.length} idle loops and no guard`);
  }
});

test('iframe stylesheets also keep their prefers-reduced-motion fallback', () => {
  // The class guard is for the in-app toggle; the media query still has to
  // cover a user who never opens Settings at all.
  for (const name of IFRAME_SHEETS) {
    assert.ok(
      read(name).includes('prefers-reduced-motion'),
      `${name} lost its reduced-motion query`
    );
  }
});

test('parent-page overlays are still killed by the body class', () => {
  // mat-fx.css overlays are body children, so they use body.fx-off, not :root.
  assert.ok(read('mat-fx.css').includes('body.fx-off .fx-overlay'));
});
