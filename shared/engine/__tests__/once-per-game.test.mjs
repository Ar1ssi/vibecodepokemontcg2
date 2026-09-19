// Rulebook 30c 1.2 / App. 9/19: a VSTAR Power and a GX attack are separate
// once-per-game allowances, and they survive turn handovers (they live on
// player.oncePerGame, which advanceTurn's flags reset does not touch). A GX
// *attack* is additionally gated on the attack command itself (design 018).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';
import { isGxAttack } from '../rules/damage-parser.mjs';

// A mid-game state for p1 (turn 2 so the first player may attack). Both decks keep a
// card so a `pass` never ends the game on deck-out.
function baseState() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.deck.push(
    createCard({ instanceId: 900, name: 'P1 Draw' })
  );
  state.players.p2.zones.deck.push(
    createCard({ instanceId: 901, name: 'P2 Draw' })
  );
  return state;
}

function addGxAttacker(state) {
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Ninetales GX',
      subtypes: ['GX'],
      hp: 210,
      attacks: [
        { name: 'Quick Blow', cost: [], damage: 20 },
        { name: 'Super Blaze GX', cost: [], damage: 40 },
      ],
    })
  );
}

function addDefender(state) {
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, name: 'Blastoise', hp: 300 })
  );
}

function pass(playerId, state) {
  return applyCommand(state, { type: 'pass', playerId });
}

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

test('isGxAttack: detects the printed GX marker, ignores other names', () => {
  assert.equal(isGxAttack({ name: 'Super Blaze GX' }), true);
  assert.equal(isGxAttack({ name: 'Double Blaze-GX' }), true);
  assert.equal(isGxAttack({ name: 'GX' }), true);
  assert.equal(isGxAttack('Tag Bolt GX'), true);
  assert.equal(isGxAttack({ name: 'Quick Blow' }), false);
  assert.equal(isGxAttack({}), false);
  assert.equal(isGxAttack(null), false);
});

test('a GX attack is consumed once and blocked across turns; a plain attack stays legal', () => {
  const state = baseState();
  addGxAttacker(state);
  addDefender(state);

  const first = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 1 },
    playerId: 'p1',
  });
  assert.equal(first.error, null);
  assert.equal(first.state.players.p1.oncePerGame.gxUsed, true);
  assert.ok(first.events.some((e) => e.type === 'gxAttackUsed'));

  // Advance the turn away from and back to p1 (flags reset, oncePerGame must not).
  const afterP2 = pass('p2', first.state);
  assert.equal(afterP2.state.players.p1.oncePerGame.gxUsed, true);

  const secondGx = applyCommand(afterP2.state, {
    type: 'attack',
    payload: { attackIndex: 1 },
    playerId: 'p1',
  });
  assert.match(secondGx.error, /one GX attack/i);

  const plain = applyCommand(afterP2.state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(plain.error, null);
  // Defender already took 40 from the GX attack; the 20-damage attack adds to it.
  assert.equal(plain.state.players.p2.zones.active[0].damage, 60);
});

test('VSTAR and GX limits are independent and survive the turn', () => {
  const state = baseState();

  const vstar = applyCommand(state, {
    type: 'useVStarGX',
    payload: { kind: 'vstar' },
    playerId: 'p1',
  });
  assert.equal(vstar.error, null);
  assert.equal(vstar.state.players.p1.oncePerGame.vstarUsed, true);
  assert.equal(vstar.state.players.p1.oncePerGame.gxUsed, false);
  assert.ok(vstar.events.some((e) => e.type === 'vstarUsed'));

  // useVStarGX does not end the turn: p1 passes, p2 passes, then p1 is back.
  const afterP1 = pass('p1', vstar.state);
  const backToP1 = pass('p2', afterP1.state);

  const again = applyCommand(backToP1.state, {
    type: 'useVStarGX',
    payload: { kind: 'vstar' },
    playerId: 'p1',
  });
  assert.match(again.error, /VSTAR Power/i);

  const gx = applyCommand(backToP1.state, {
    type: 'useVStarGX',
    payload: { kind: 'gx' },
    playerId: 'p1',
  });
  assert.equal(gx.error, null);
  assert.equal(gx.state.players.p1.oncePerGame.gxUsed, true);
  assert.equal(gx.state.players.p1.oncePerGame.vstarUsed, true);
});

test('useVStarGX rejects an unknown kind', () => {
  const state = baseState();
  const res = applyCommand(state, {
    type: 'useVStarGX',
    payload: { kind: 'both' },
    playerId: 'p1',
  });
  assert.equal(res.error, 'bad_command');
  assert.match(res.reason, /kind/);
});

test('view projects once-per-game markers into flags for the special-move buttons', () => {
  const state = baseState();
  const res = applyCommand(state, {
    type: 'useVStarGX',
    payload: { kind: 'vstar' },
    playerId: 'p1',
  });
  const view = viewFor(res.state, 'p1');
  assert.equal(view.you.flags.vstarUsed, true);
  assert.equal(view.you.flags.gxUsed, false);
});

test('a GX attack that fizzles to Confusion does not spend the GX limit', () => {
  const state = baseState();
  addGxAttacker(state);
  addDefender(state);
  state.players.p1.zones.active[0].specialCondition = 'Confused';

  const res = applyCommand(
    state,
    { type: 'attack', payload: { attackIndex: 1 }, playerId: 'p1' },
    { next: () => 0.9 } // >= 0.5 -> tails
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, false);
  assert.equal(res.state.players.p1.zones.active[0].damage, 30);
});

test('a GX attack suspended for a target choice spends the limit only on resume', () => {
  const state = baseState();
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Snipe GX',
      subtypes: ['GX'],
      hp: 210,
      attacks: [
        {
          name: 'Snipe GX',
          cost: [],
          damage: 0,
          text: "This attack does 60 damage to 1 of your opponent's Benched Pokémon.",
        },
      ],
    })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, name: 'Active', hp: 300 })
  );
  state.players.p2.zones.bench.push(
    createCard({ instanceId: 3, name: 'Bench A', hp: 100 }),
    createCard({ instanceId: 4, name: 'Bench B', hp: 100 })
  );

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'attack should suspend for a target choice');
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, false);

  const choice = res.state.pendingChoice;
  const resolved = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: {
      choiceId: choice.choiceId,
      selection: [choice.options[0].instanceId],
    },
    playerId: 'p1',
  });
  assert.equal(resolved.error, null);
  assert.equal(resolved.state.players.p1.oncePerGame.gxUsed, true);
});

test('a state without oncePerGame still accepts a GX attack and seeds the marker', () => {
  const state = baseState();
  delete state.players.p1.oncePerGame;
  addGxAttacker(state);
  addDefender(state);

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.gxUsed, true);
});

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
