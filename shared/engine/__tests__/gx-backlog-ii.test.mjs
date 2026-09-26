// Design 048 (I184-I189): GX backlog engine features, board-level and parser tests.
// Every card's text is the corpus row in out/pkmn-gx-cards.json (cited by set/number below).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const supporter = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Supporter'] });
const item = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'] });
const energyCard = (type, attachedTo = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
  });
const atk = (name, damage, text, cost = []) => ({ name, cost, damage, text });

function game(setup) {
  const state = createGameState({ gameId: 'gx-backlog-ii', seed: 7, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 15; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  setup(state, state.players.p1, state.players.p2);
  return state;
}

function runAttack(state, { attackIndex = 0, selectionFor = () => [] } = {}) {
  let res = applyCommand(
    state,
    { type: 'attack', playerId: 'p1', payload: { attackIndex } },
    createRng(7)
  );
  assert.equal(res.error, null, res.reason);
  let guard = 0;
  while (res.state.pendingChoice && guard++ < 12) {
    const pc = res.state.pendingChoice;
    res = applyCommand(
      res.state,
      {
        type: 'resolveChoice',
        playerId: pc.player,
        payload: { choiceId: pc.choiceId, selection: selectionFor(pc) },
      },
      createRng(7 + guard)
    );
    assert.equal(res.error, null, res.reason);
  }
  return res;
}

const eventTypes = (res) => new Set((res.events || []).map((e) => e.type));
const activeRoot = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);
const benchRoots = (state, pid) => state.players[pid].zones.bench.filter((c) => !c.attachedTo);

// ── I187: scaling residuals + Kaleidostorm anomaly ──────────────────────────

const KALEIDOSTORM =
  'Move any number of Energy from your Pokémon to your other Pokémon in any way you like.';
const BREAKDOWN =
  "For each card in your opponent's hand, put 1 damage counter on their Active Pokémon.";
const DITCH_AND_SPLASH =
  'Discard any number of Supporter cards from your hand. This attack does 40 damage for each card you discarded in this way.';
const CHUCK_AWAY =
  'Discard up to 2 cards from your hand. This attack does 40 damage for each card you discarded in this way.';
const JUMPING_BALLOON =
  "This attack does 60 more damage for each of your opponent's Pokémon-GX and Pokémon-EX in play.";

test('I187 parse: Kaleidostorm does not fabricate ×Energy damage from its move clause', () => {
  const parsed = parseAttackDamage({ damage: 150, text: KALEIDOSTORM }, {}, {}, { energyCount: 2 });
  assert.equal(parsed.total, 150);
  assert.deepEqual(parsed.components, []);
});

test('I187 parse: hand-discard scaling reads the discarded count', () => {
  const ditch = parseAttackDamage({ damage: 40, text: DITCH_AND_SPLASH }, {}, {}, { handDiscarded: 2 });
  assert.equal(ditch.total, 80);
  assert.ok(ditch.components.includes('per-hand-discarded'));
  const chuck = parseAttackDamage({ damage: 40, text: CHUCK_AWAY }, {}, {}, { handDiscarded: 1 });
  assert.equal(chuck.total, 40);
});

test('I187 parse: Breakdown is a per-opponent-hand counter step', () => {
  const parsed = parseAttackSteps(BREAKDOWN);
  assert.deepEqual(parsed.after, [
    { type: 'atkCountersEach', count: 1, scope: 'active', perOpponentHand: true },
  ]);
});

test('I187 parse: Jumping Balloon scales with the opponent GX/EX count', () => {
  const withTwo = parseAttackDamage({ damage: 60, text: JUMPING_BALLOON }, {}, {}, { opponentGxExCount: 2 });
  assert.equal(withTwo.total, 180);
  const none = parseAttackDamage({ damage: 60, text: JUMPING_BALLOON }, {}, {}, { opponentGxExCount: 0 });
  assert.equal(none.total, 60);
});

test('I187 board: Kaleidostorm deals its printed 150 and still moves Energy', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Gardevoir & Sylveon-GX', {
      hp: 200,
      attacks: [atk('Kaleidostorm', 150, KALEIDOSTORM, ['Fairy', 'Fairy', 'Colorless'])],
    });
    const bench = mon('Bench A');
    p1.zones.active.push(attacker);
    p1.zones.bench.push(bench, energyCard('Water', attacker.instanceId), energyCard('Psychic', attacker.instanceId));
    const defender = mon('Defender', { hp: 300, types: ['Water'] });
    defender.damage = 30;
    p2.zones.active.push(defender);
  });
  const res = runAttack(state);
  const defender = activeRoot(res.state, 'p2');
  assert.equal(defender.damage, 180, '150 + pre-existing 30, not 300');
  assert.ok(!eventTypes(res).has('pokemonKnockedOut'));
});

test('I187 board: Breakdown places one counter per card in the opponent hand', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Mr. Mime-GX', { hp: 200, attacks: [atk('Breakdown', 0, BREAKDOWN)] });
    p1.zones.active.push(attacker);
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.hand.push(supporter('a'), supporter('b'), item('c'), mon('d'));
  });
  const res = runAttack(state);
  assert.equal(activeRoot(res.state, 'p2').damage, 40);
});

test('I187 board: Ditch and Splash scales with the discarded Supporters', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Slowpoke & Psyduck-GX', {
      hp: 200,
      attacks: [atk('Ditch and Splash', 40, DITCH_AND_SPLASH)],
    });
    p1.zones.active.push(attacker);
    p1.zones.hand.push(supporter('Sup A'), supporter('Sup B'), mon('HandMon'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, {
    selectionFor: (pc) =>
      pc.options
        .filter((o) => /Sup/.test(o.name || ''))
        .map((o) => o.instanceId)
        .slice(0, 2),
  });
  assert.equal(p1HandSize(res), 1, 'both Supporters were discarded');
  assert.equal(activeRoot(res.state, 'p2').damage, 80);
});

test('I187 board: Chuck Away scales with up to two discarded cards', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Alolan Raticate-GX', {
      hp: 200,
      attacks: [atk('Chuck Away', 40, CHUCK_AWAY)],
    });
    p1.zones.active.push(attacker);
    p1.zones.hand.push(supporter('one'), item('two'), mon('three'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, {
    selectionFor: (pc) => pc.options.slice(0, 2).map((o) => o.instanceId),
  });
  assert.equal(p1HandSize(res), 1);
  assert.equal(activeRoot(res.state, 'p2').damage, 80);
});

function p1HandSize(res) {
  return res.state.players.p1.zones.hand.length;
}

// ── I186: bounce / bench setup ──────────────────────────────────────────────

test('placeholder I186', () => {});

// ── I185: KO / prize gaps ───────────────────────────────────────────────────

test('placeholder I185', () => {});

// ── I184: locks / extra turns ───────────────────────────────────────────────

test('placeholder I184', () => {});

// ── I188 / I189: recovery, copy, abilities ──────────────────────────────────

test('placeholder I188/I189', () => {});

test('placeholder bench helper is used', () => {
  assert.equal(typeof benchRoots, 'function');
});
