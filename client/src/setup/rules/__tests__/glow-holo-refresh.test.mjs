import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The affordance glow is painted on whichever node glowNodeFor resolves: the
// bare <img> before holo hydration, the .mat-holo wrapper after. Hydration is
// async, so unless wrapping/unwrapping triggers a glow refresh the glow stays
// on the stale node (a padded, inset rim inside the holo, or no glow at all).
// Neither module can load under node --test (browser-only imports), so the
// contract is checked in source.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const EVENT = 'holo-wrapper-changed';

test('hydrate-holo announces both wrapping and unwrapping', () => {
  const src = read('../../deck-constructor/hydrate-holo.js');
  assert.ok(src.includes(`'${EVENT}'`), 'event name missing');
  const announce = /announceHoloChange\(\);/;
  const hydrate = src.slice(src.indexOf('export function hydrateHolo'), src.indexOf('export function unhydrateHolo'));
  const unhydrate = src.slice(src.indexOf('export function unhydrateHolo'));
  assert.match(hydrate, announce, 'hydrateHolo does not announce');
  assert.match(unhydrate, announce, 'unhydrateHolo does not announce');
});

test('rules-bridge glow refresh listens for the holo change', () => {
  const src = read('../rules-bridge.js');
  const hook = src.slice(src.indexOf('const hookActionAffordances'));
  const triggers = hook.slice(0, hook.indexOf('.forEach((name) => document.addEventListener'));
  assert.ok(triggers.includes(`'${EVENT}'`), 'glow refresh ignores holo wrapper changes');
});
