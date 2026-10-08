import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SINGLE_FILES, STATUS_BUNDLES, parseArgs, planCopies, safeName } from '../import-tcgl-status-fx.mjs';

test('parseArgs requires --src and rejects unknown flags', () => {
  assert.equal(parseArgs([]).error, '--src <extract dir> is required');
  assert.equal(parseArgs(['--src']).error, '--src needs a directory');
  assert.equal(parseArgs(['--src', '--check']).error, '--src needs a directory');
  assert.equal(parseArgs(['--src', 'E:/x', '--bogus']).error, 'unknown argument --bogus');
  assert.deepEqual(parseArgs(['--src', 'E:/x', '--check']), { src: 'E:/x', check: true });
});

test('safeName replaces Unity spaces', () => {
  assert.equal(safeName('T_VFX_Confusion_Spin 1.webp'), 'T_VFX_Confusion_Spin_1.webp');
});

test('planCopies maps each status bundle, skips particle dots and normal maps', () => {
  const listing = {
    status_sleep: ['T_VFX_Status_Sleep_Zs_2x2.webp', 'Default-ParticleSystem.webp'],
    status_poison: ['4733-normal.webp', 'Poison_Swirl.webp', 'readme.txt'],
    status_damage: ['T_VFX_Status_Damage_Normals.webp', 'T_VFX_Status_Damage_Hit_3x3.webp'],
  };
  const copies = planCopies((bundle) => listing[bundle] ?? []);
  const status = copies.slice(0, copies.length - SINGLE_FILES.length);
  assert.deepEqual(status, [
    { from: 'status_damage/T_VFX_Status_Damage_Hit_3x3.webp', to: 'status-fx/damage/T_VFX_Status_Damage_Hit_3x3.webp' },
    { from: 'status_poison/Poison_Swirl.webp', to: 'status-fx/poison/Poison_Swirl.webp' },
    { from: 'status_sleep/T_VFX_Status_Sleep_Zs_2x2.webp', to: 'status-fx/sleep/T_VFX_Status_Sleep_Zs_2x2.webp' },
  ]);
});

test('planCopies always appends the counter and badge files', () => {
  const copies = planCopies(() => []);
  assert.equal(copies.length, SINGLE_FILES.length);
  assert.ok(copies.some((c) => c.to === 'damage-counter/counter-flat.webp'));
  assert.ok(copies.some((c) => c.to === 'status-markers/poison-badge.webp'));
  assert.equal(Object.keys(STATUS_BUNDLES).length, 8);
});
