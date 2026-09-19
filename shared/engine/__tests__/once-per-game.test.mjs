// Rulebook 30c 1.2: a VSTAR Power and a GX attack are separate once-per-game
// allowances, and they survive turn handovers (they live on player.oncePerGame,
// which advanceTurn's flags reset does not touch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const TAILS = { next: () => 0.9, shuffle: (cards) => cards };

function vstarGxState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Lugia VSTAR', subtypes: ['VSTAR'], hp: 280 })
  );
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 2, name: 'Mewtwo GX', subtypes: ['GX'], hp: 180 })
  );
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 30, name: 'P1 Deck Card' })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 10, name: 'Eevee', hp: 60 })
  );
  state.players.p2.zones.deck.push(
    createCard({ instanceId: 40, name: 'P2 Deck Card' })
  );
  return state;
}

function use(state, { instanceId, kind }, playerId = 'p1') {
  const payload = kind === undefined ? { instanceId } : { instanceId, kind };
  return applyCommand(state, { type: 'useVStarGX', payload, playerId }, TAILS);
}

test('once-per-game: using a VSTAR only spends the VSTAR allowance', () => {
  const res = use(vstarGxState(), { instanceId: 1, kind: 'vstar' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.vstarUsed, true);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, false);

  const gx = use(res.state, { instanceId: 2, kind: 'gx' });
  assert.equal(gx.error, null, 'a GX on a different card is still legal');
  assert.equal(gx.state.players.p1.oncePerGame.gxUsed, true);
});

test('once-per-game: using a GX leaves the VSTAR allowance untouched', () => {
  const res = use(vstarGxState(), { instanceId: 2, kind: 'gx' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, true);
  assert.equal(res.state.players.p1.oncePerGame.vstarUsed, false);

  const vstar = use(res.state, { instanceId: 1, kind: 'vstar' });
  assert.equal(vstar.error, null, 'a VSTAR is still legal after a GX');
  assert.equal(vstar.state.players.p1.oncePerGame.vstarUsed, true);
});

test('once-per-game: a spent allowance is blocked for the same kind', () => {
  const first = use(vstarGxState(), { instanceId: 1, kind: 'vstar' });
  assert.equal(first.error, null);
  const again = use(first.state, { instanceId: 1, kind: 'vstar' });
  assert.match(again.error, /already used this game/);
  assert.equal(again.state.players.p1.oncePerGame.vstarUsed, true);
});

test('once-per-game: the flag survives a full turn cycle, and the other kind stays legal', () => {
  const used = use(vstarGxState(), { instanceId: 1, kind: 'vstar' });
  assert.equal(used.error, null);

  const toOpponent = applyCommand(
    used.state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    TAILS
  );
  assert.equal(toOpponent.error, null);
  assert.equal(toOpponent.state.turn.player, 'p2');
  assert.equal(
    toOpponent.state.players.p1.oncePerGame.vstarUsed,
    true,
    'the VSTAR flag survives advanceTurn'
  );

  const backToP1 = applyCommand(
    toOpponent.state,
    { type: 'pass', payload: {}, playerId: 'p2' },
    TAILS
  );
  assert.equal(backToP1.error, null);
  assert.equal(backToP1.state.turn.player, 'p1');
  assert.equal(backToP1.state.players.p1.oncePerGame.vstarUsed, true);

  const vstarBlocked = use(backToP1.state, { instanceId: 1, kind: 'vstar' });
  assert.match(vstarBlocked.error, /already used this game/);

  const gxStillLegal = use(backToP1.state, { instanceId: 2, kind: 'gx' });
  assert.equal(gxStillLegal.error, null);
});

test('once-per-game: kind is inferred from the source card when omitted', () => {
  const res = use(vstarGxState(), { instanceId: 1 });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.vstarUsed, true);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, false);
});

test('once-per-game: a kind outside the enum is a shape error', () => {
  const res = use(vstarGxState(), { instanceId: 1, kind: 'unknown' });
  assert.equal(res.error, 'bad_command');
  assert.match(res.reason, /kind/);
});
