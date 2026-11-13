// Design 089 D2: an attack plays before what it does. The engine emits `attackExecuted` last, and
// only with the batch that resumes an attack suspended on a choice, so a Pokémon whose attack
// switched it out used to attack from the Bench. These tests replay real engine batches through the
// same pure steps advisory-animations.js runs (prepareAttackBatch → attackLeads → plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advisoryAnimationPlan,
  attackHitIds,
  attackLeads,
  prepareAttackBatch,
  settleDroppedPlan,
} from '../advisory-animations.mjs';
import { moveIdsForEvent, slideIdsForEvent } from '../mat-fx/lifecycle-pose.mjs';
import { createGameState } from '../../../../../shared/engine/state.mjs';
import { createCard } from '../../../../../shared/engine/cards.mjs';
import { createRng } from '../../../../../shared/engine/rng.mjs';
import { applyCommand } from '../../../../../shared/engine/reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 100, ...props });

function board({ text = '', damage = '30', ownBench = 2 } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1.zones;
  const p2 = state.players.p2.zones;
  p1.active.push(pokemon({ instanceId: 1, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', cost: [], damage, text }] }));
  for (let i = 0; i < ownBench; i += 1) p1.bench.push(pokemon({ instanceId: 2 + i, name: `Own Bench ${i}` }));
  p2.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 200 }));
  p2.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench 0' }), pokemon({ instanceId: 22, name: 'Opp Bench 1' }));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const attackWith = (state) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(5));
  assert.equal(res.error ?? null, null);
  return res;
};

const choose = (state, selection) => {
  const res = applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection }, playerId: state.pendingChoice.player },
    createRng(5)
  );
  assert.equal(res.error ?? null, null);
  return res;
};

/** Plays batches the way advisory-animations.js orders them; returns each batch's effect names. */
const createSequencer = () => {
  let open = null;
  return (events) => {
    const batch = prepareAttackBatch(events, open);
    open = batch.open;
    const leads = attackLeads(batch.events, { carried: batch.carried });
    const moved = new Set(leads.values());
    const hits = attackHitIds(batch.events);
    const played = [];
    const play = (event) => {
      const planned = advisoryAnimationPlan(event, 'p1', undefined, { hits: hits.get(event) ?? null });
      for (const plan of [planned].flat().filter(Boolean)) played.push({ ...plan, event });
    };
    for (const event of events) {
      if (moved.has(event) || batch.skipped.has(event)) continue;
      const attack = leads.get(event);
      if (attack) play(attack);
      play(event);
    }
    return played;
  };
};

const SWITCH_SELF = 'Switch this Pokémon with 1 of your Benched Pokémon.';
const effects = (played) => played.map((plan) => plan.effect ?? plan.kind);
/** The effects of the attacking turn (what follows the turn banner is the next turn's). */
const turnEffects = (played) => {
  const names = effects(played);
  const end = names.indexOf('turn-banner');
  return end === -1 ? names : names.slice(0, end);
};

test('a switch plans the retreat slide for both cards (Switch, gusts, attack switches)', () => {
  const event = { type: 'cardSwitched', playerId: 'p1', activeId: 1, benchId: 2 };
  assert.deepEqual(advisoryAnimationPlan(event, 'p1'), { kind: 'fx', effect: 'retreat', user: 'self', activeId: 1, benchId: 2 });
  assert.equal(advisoryAnimationPlan(event, 'p2').user, 'opp');
  assert.deepEqual(moveIdsForEvent(event), [1, 2]);
  assert.deepEqual(slideIdsForEvent(event), [1, 2]);
  // The plan (no `type`) names the same cards, so the effect slides what the pins held.
  assert.deepEqual(moveIdsForEvent(advisoryAnimationPlan(event, 'p1')), [1, 2]);
});

test('edge 3: damage, then an automatic self-switch (one Benched Pokémon): attack, hit, then the slide', () => {
  const run = createSequencer();
  const { events } = attackWith(board({ text: SWITCH_SELF, ownBench: 1 }));
  assert.deepEqual(turnEffects(run(events)), ['attack-banner', 'attack', 'damage', 'retreat']);
});

test('edge 4: damage, then a self-switch the player picks: the attack plays with the first batch, the slide alone with the second', () => {
  const run = createSequencer();
  const first = attackWith(board({ text: SWITCH_SELF }));
  const firstPlayed = run(first.events);
  assert.deepEqual(effects(firstPlayed), ['attack-banner', 'attack', 'damage']);
  // The early strike carries what the real attackExecuted will: who attacked whom, with what.
  const strike = firstPlayed[1].event;
  assert.equal(strike.early, true);
  assert.deepEqual(
    { attackerId: strike.attackerId, defenderId: strike.defenderId, attackName: strike.attackName, damage: strike.damage, benchDealt: strike.benchDealt },
    { attackerId: 1, defenderId: 20, attackName: 'Hit', damage: 30, benchDealt: 0 }
  );
  assert.deepEqual(firstPlayed[1].hits.map((hit) => hit.instanceId), [20]);

  const second = choose(first.state, [2]);
  assert.ok(second.events.some((event) => event.type === 'attackExecuted'), 'the engine reports the attack only now');
  assert.deepEqual(turnEffects(run(second.events)), ['retreat']);
});

test('edge 5: a no-damage switch attack plays the attack, then the slide', () => {
  const run = createSequencer();
  const { events } = attackWith(board({ text: SWITCH_SELF, damage: '', ownBench: 1 }));
  assert.deepEqual(turnEffects(run(events)), ['attack-banner', 'attack', 'retreat']);
});

test('edge 1: an attack suspended before it did anything plays nothing yet, then attack and slide with the batch that resumes it', () => {
  const run = createSequencer();
  const first = attackWith(board({ text: SWITCH_SELF, damage: '' }));
  assert.deepEqual(first.events.map((event) => event.type), ['attackStarted']);
  assert.deepEqual(effects(run(first.events)), []);
  const second = choose(first.state, [3]);
  assert.deepEqual(turnEffects(run(second.events)), ['attack-banner', 'attack', 'retreat']);
});

test('edge 6: a switch before the attack starts (Koga’s Ninja Trick) slides first; the attack then leads its hit', () => {
  const run = createSequencer();
  const events = [
    { type: 'cardSwitched', playerId: 'p2', activeId: 20, benchId: 21 },
    { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'Hit' },
    { type: 'damageUpdated', instanceId: 21, damage: 30, dealt: 30 },
    { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'Hit', damage: 30 },
  ];
  assert.deepEqual(effects(run(events)), ['retreat', 'attack-banner', 'attack', 'damage']);
});

test('edge 7: a gust before the damage slides first; the attack then leads the hit on the new Active', () => {
  const run = createSequencer();
  const events = [
    { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Drag Off' },
    { type: 'cardSwitched', playerId: 'p2', activeId: 20, benchId: 21 },
    { type: 'damageUpdated', instanceId: 21, damage: 30, dealt: 30 },
    { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Drag Off', damage: 30 },
  ];
  assert.deepEqual(effects(run(events)), ['retreat', 'attack-banner', 'attack', 'damage']);
});

test('an attack with no start marker and no hit keeps its place (an older server, a status move)', () => {
  const run = createSequencer();
  const events = [
    { type: 'cardSwitched', playerId: 'p1', activeId: 1, benchId: 2 },
    { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit', damage: 0 },
  ];
  assert.deepEqual(effects(run(events)), ['retreat', 'attack-banner', 'attack']);
});

test('edge 2: a second attackStarted for the attack already open is ignored', () => {
  const started = { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit' };
  const hit = { type: 'damageUpdated', instanceId: 20, damage: 30, dealt: 30 };
  const batch = prepareAttackBatch([started, { ...started, attackName: 'Copied' }, hit], null);
  const strikes = batch.events.filter((event) => event.type === 'attackExecuted');
  assert.equal(strikes.length, 1);
  assert.equal(strikes[0].attackName, 'Hit');
  assert.equal(batch.open.played, true);
});

test('the early strike counts what the attack dealt: the defender’s damage, the rest as Bench damage, never the attacker’s own', () => {
  const batch = prepareAttackBatch(
    [
      { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit' },
      { type: 'damageUpdated', instanceId: 20, damage: 50, dealt: 50 },
      { type: 'damageUpdated', instanceId: 21, damage: 20, dealt: 20 },
      { type: 'damageUpdated', instanceId: 22, damage: 40 },
      { type: 'damageUpdated', instanceId: 1, damage: 10, dealt: 10 },
    ],
    null
  );
  const strike = batch.events.at(-1);
  assert.equal(strike.type, 'attackExecuted');
  assert.equal(strike.early, true);
  assert.equal(strike.damage, 50);
  assert.equal(strike.benchDealt, 60);
});

test('a played attack is forgotten at its attackExecuted and at the next turn; another player’s attack is never skipped', () => {
  const open = { playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit', played: true };
  const real = { type: 'attackExecuted', playerId: 'p1', attackerId: 1, attackName: 'Hit', damage: 30 };
  const closed = prepareAttackBatch([real], open);
  assert.ok(closed.skipped.has(real));
  assert.equal(closed.open, null);
  assert.deepEqual(closed.events, []);

  const other = { type: 'attackExecuted', playerId: 'p2', attackerId: 20, attackName: 'Bite', damage: 10 };
  const kept = prepareAttackBatch([other], open);
  assert.equal(kept.skipped.size, 0);
  assert.deepEqual(kept.events, [other]);

  const turn = prepareAttackBatch([{ type: 'turnStarted', player: 'p2' }, other], open);
  assert.equal(turn.open, null);
  assert.equal(turn.skipped.size, 0);
});

test('an open attack that still does nothing stays open; nothing is carried into a batch that is not an array', () => {
  const open = { playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Hit', played: false };
  const idle = prepareAttackBatch([{ type: 'effectStepSkipped', reason: 'declined' }], open);
  assert.deepEqual(idle.open, open);
  assert.equal(idle.carried, true);
  assert.ok(!idle.events.some((event) => event.type === 'attackExecuted'));
  const none = prepareAttackBatch(null, open);
  assert.deepEqual(none.events, []);
  assert.deepEqual(none.open, open);
});

test('attackLeads: a carried attack with no hit leads its first consequence; coin flips never count', () => {
  const flip = { type: 'attackCoinFlipped', playerId: 'p1', flips: ['heads'] };
  const draw = { type: 'cardsDrawn', playerId: 'p1', cards: [{ instanceId: 9 }] };
  const attack = { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, damage: 0 };
  assert.equal(attackLeads([flip, draw, attack], { carried: true }).get(draw), attack);
  assert.equal(attackLeads([flip, draw, attack]).size, 0);
  const started = { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20 };
  assert.equal(attackLeads([started, flip, draw, attack]).get(draw), attack);
});

// ── design 089 D4: a dropped plan gives up what it held back ────────────────────────────────

const settleDeps = () => {
  const log = [];
  return {
    log,
    deps: {
      show: (card) => log.push(['show', card.id]),
      clearTimer: (id) => log.push(['clearTimer', id]),
      forgetKnockout: (id) => log.push(['forget', id]),
    },
  };
};

test('a dropped draw shows its cards at once, cancels its backstop and releases a Prize sleeve', () => {
  const { log, deps } = settleDeps();
  const released = [];
  settleDroppedPlan(
    {
      kind: 'draw',
      backstop: 41,
      drawn: [{ id: 'a' }, { id: 'b', from: { release: () => released.push('b') } }],
    },
    deps
  );
  assert.deepEqual(log, [['clearTimer', 41], ['show', 'a'], ['show', 'b']]);
  assert.deepEqual(released, ['b']);
});

test('a dropped reveal shows its held cards; a dropped knockout forgets its snapshot; other plans hold nothing', () => {
  const { log, deps } = settleDeps();
  settleDroppedPlan({ kind: 'reveal', backstop: 7, held: [{ id: 'r' }] }, deps);
  settleDroppedPlan({ kind: 'knockout', instanceId: 20 }, deps);
  settleDroppedPlan({ kind: 'fx', effect: 'attack' }, deps);
  settleDroppedPlan({ kind: 'draw' }, deps);
  settleDroppedPlan(null, deps);
  assert.deepEqual(log, [['clearTimer', 7], ['show', 'r'], ['forget', 20]]);
});
