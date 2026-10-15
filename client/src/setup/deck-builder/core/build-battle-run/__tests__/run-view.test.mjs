import test from 'node:test';
import assert from 'node:assert/strict';

import { RUN_TEXT, matchResultLine, progressLabel, summaryHeadline } from '../run-view.mjs';

test('the meter reads like TCG Live: played over total', () => {
  assert.equal(progressLabel({ played: 2, total: 5 }), '2/5 Matches');
});

test('a match line names the node and the outcome', () => {
  assert.equal(matchResultLine(0, true), 'Match 1: Victory');
  assert.equal(matchResultLine(4, false), 'Match 5: Defeat');
});

test('the summary headline says whether the run was forfeited', () => {
  assert.equal(summaryHeadline({ wins: 3, losses: 2, endedEarly: false }), 'Run complete · 3–2');
  assert.equal(summaryHeadline({ wins: 1, losses: 0, endedEarly: true }), 'Run forfeited · 1–0');
});

test('no run text promises rewards or Event Tokens', () => {
  const text = JSON.stringify(RUN_TEXT);
  assert.equal(/reward|token/i.test(text), false);
});
