import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILD_BATTLE_DEFAULT_FLOW,
  BUILD_BATTLE_LEGACY_PATH,
  BUILD_BATTLE_WINDOW_PATH,
  HOMEBREW_BATTLE_WINDOW_NAME,
  HOMEBREW_BATTLE_WINDOW_PATH,
  resolveBuildBattleFlow,
  resolveBuilderMode,
  resolveBuilderRole,
} from '../core/builder-window.mjs';

test('the Homebrew path is a builder tab in Build & Battle mode with its own flow', () => {
  assert.equal(HOMEBREW_BATTLE_WINDOW_PATH, '/homebrew-battle');
  assert.equal(resolveBuilderRole(HOMEBREW_BATTLE_WINDOW_PATH), 'editor');
  assert.equal(resolveBuilderRole('/homebrew-battle/'), 'editor');
  assert.equal(resolveBuilderMode(HOMEBREW_BATTLE_WINDOW_PATH), 'build-battle');
  assert.equal(resolveBuildBattleFlow(HOMEBREW_BATTLE_WINDOW_PATH), 'homebrew');
  assert.equal(resolveBuildBattleFlow('/homebrew-battle/'), 'homebrew');
});

test('the other Build & Battle paths keep their flows, and the tab has a name of its own', () => {
  assert.equal(resolveBuildBattleFlow(BUILD_BATTLE_WINDOW_PATH), BUILD_BATTLE_DEFAULT_FLOW);
  assert.equal(resolveBuildBattleFlow(BUILD_BATTLE_LEGACY_PATH), 'legacy');
  assert.equal(resolveBuilderMode('/deck-builder'), 'standard');
  assert.equal(resolveBuilderRole('/homebrew'), 'host');
  assert.equal(HOMEBREW_BATTLE_WINDOW_NAME, 'ptcgHomebrewBattle');
});
