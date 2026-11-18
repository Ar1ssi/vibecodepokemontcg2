import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// rules-bridge.js imports browser-only modules and cannot load under node --test, so its
// contracts are checked in source (same approach as glow-holo-refresh.test.mjs).
const src = readFileSync(new URL('../rules-bridge.js', import.meta.url), 'utf8');

const bodyOf = (startMarker, endMarker) => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} missing`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} missing after ${startMarker}`);
  return src.slice(start, end);
};

test('the win sweep leaves deck-out to checkDeckOut', () => {
  // A deck-out loss is "must draw and cannot" (shared/engine/reduce/turn.mjs advanceTurn). The
  // sweep also runs on every card move and on pass, so a deckCounts argument ended the game
  // when a player drew their last card.
  const sweep = bodyOf('export function evaluateAndApplyWinConditions', '// ── turn flow');
  assert.doesNotMatch(sweep, /deckCounts\s*:/);
});

test('checkDeckOut stands down under server authority', () => {
  const body = bodyOf('const checkDeckOut = () => {', "document.addEventListener('rules-turn-began', checkDeckOut)");
  assert.match(body, /if \(systemState\.serverAuthoritative\) return;/);
});

test('every damage-counter addition goes through addDamage', () => {
  assert.equal([...src.matchAll(/(?<![\w.])addDamageCounter\(/g)].length, 1, 'only addDamage may call addDamageCounter');
  assert.doesNotMatch(src, /damageCounter\.textContent\s*=[^=]/, 'counter text is written by damage-counter.js only');
  const helper = bodyOf('const addDamage = (', '\n    };');
  assert.match(helper, /if \(!\(amount > 0\)\) return;/, 'addDamageCounter treats a falsy amount as 10');
  assert.ok([...src.matchAll(/\baddDamage\(/g)].length >= 6, 'the damage sites route through addDamage');
});

test('rules-bridge declares nothing it never uses', () => {
  for (const dead of ['playAttackFeedback', 'escapeHtml', 'executeAttack', 'canPayAttackCost', 'handleKO', 'coinCallCaller', 'anyMulligans']) {
    assert.doesNotMatch(src, new RegExp(`\\b${dead}\\b`), `${dead} is dead code`);
  }
});
