import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// rules-bridge.js imports browser-only modules and cannot load under node --test, so its
// contracts are checked in source (same approach as glow-holo-refresh.test.mjs).
const src = readFileSync(new URL('../rules-bridge.js', import.meta.url), 'utf8');
const inspectorSrc = readFileSync(new URL('../card-inspector.mjs', import.meta.url), 'utf8');

const bodyOf = (startMarker, endMarker) => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} missing`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} missing after ${startMarker}`);
  return src.slice(start, end);
};

test('rules-bridge runs no rules locally: the server owns every rule (design 090)', () => {
  for (const legacy of [
    'runTrainerSteps',
    'runAbilitySteps',
    'initTrainerExecution',
    'checkKnockouts',
    'evaluateAndApplyWinConditions',
    'hookTurnStartDraw',
    'hookTrainerPlay',
    'forceRulesActiveTurn',
    'runTurnOrderCoinFlip',
    'resolveTurnBoundary',
    'addDamageCounter',
    'moveCardBundle',
  ]) {
    assert.doesNotMatch(src, new RegExp(`\\b${legacy}\\b`), `${legacy} is local rule execution`);
  }
  assert.doesNotMatch(src, /Math\.random/, 'no client-side dice: the server flips every coin');
  assert.doesNotMatch(src, /from '[^']*chat-buttons\.js'/, 'ability executors are gone');
  for (const gone of ['trainer-execution', 'ability-picker', 'debug-menu']) {
    assert.equal(existsSync(new URL(`../${gone}.js`, import.meta.url)), false, `${gone}.js is deleted`);
  }
});

test('the opening runs only under server turn order and deals nothing locally', () => {
  const click = bodyOf('const handleSetupClick = () => {', '// ── ');
  assert.match(click, /if \(!isServerOwnedTurnOrder\(\)\) return;/);
  assert.doesNotMatch(click, /Math\.random|coinFlipPending|syncedTurnOrder/);
  const begin = bodyOf('const beginSetupWithTurnOrder = (firstPlayer) => {', 'design 013: server-owned');
  assert.doesNotMatch(begin, /drawOpeningHand|shuffleAndDraw|evaluateMulligans/);
  assert.match(begin, /promptStartingActiveSelection\(firstPlayer, session\)/);
});

test('the pass hook sends the pass command for a seat this client owns and leaves other clicks alone', () => {
  const hook = bodyOf('const hookTurnButton = () => {', 'const hookSetupButton');
  assert.match(
    hook,
    /const passesForSeat = systemState\.isTwoPlayer && \(endingPlayer === 'self' \|\| systemState\.solo\);/
  );
  // The early return comes before preventDefault, so pass() answers a click this seat cannot pass.
  assert.ok(hook.indexOf('if (!passesForSeat) return;') < hook.indexOf('event.preventDefault()'));
  assert.match(hook, /processAction\(endingPlayer, true, 'pass', \[\{\}\]\)/);
  assert.doesNotMatch(hook, /parseCheckupEffect|resolveTurnBoundary|checkWinConditions|abilityUsed/);
});

test('a starting-Active prompt answers for both seats only in a solo room', () => {
  assert.match(src, /const choosesBoth = systemState\.solo;/);
  assert.doesNotMatch(src, /!systemState\.isTwoPlayer \|\| systemState\.solo/);
});

test('the card inspector refuses an ability the server cannot take instead of running it locally', () => {
  assert.doesNotMatch(inspectorSrc, /runAbilitySteps|rules-bridge/);
  const use = inspectorSrc.slice(inspectorSrc.indexOf('const useAbility = (card, zone) => {'));
  assert.match(use.slice(0, use.indexOf('\n};')), /failClosed: true/);
});

test('rules-bridge declares nothing it never uses', () => {
  for (const dead of ['playAttackFeedback', 'escapeHtml', 'executeAttack', 'canPayAttackCost', 'handleKO', 'coinCallCaller', 'anyMulligans']) {
    assert.doesNotMatch(src, new RegExp(`\\b${dead}\\b`), `${dead} is dead code`);
  }
});
