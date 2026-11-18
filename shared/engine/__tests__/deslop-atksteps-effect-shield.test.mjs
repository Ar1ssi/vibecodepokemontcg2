// One effect-shield predicate for every attack step that acts on the opponent's Active Pokémon
// (effects/attack-steps.mjs attackEffectShielded), and one HP source for the "can't leave it with
// less than N HP" doubling clause. Card texts: out/pkmn-special-energy-cards.json (Mist Energy,
// Temporal Forces 161), out/pkmn-pokemon-cards.json (Crobat BREAK, XY Promos XY181), and the
// customhb set.json row for Mega Absol ex Terminal Cut (an unreleased custom card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { readFileSync } from 'node:fs';
import { ATTACK_STEP_HANDLERS, EXTRA_ENERGY_SELF_GATED } from '../effects/attack-steps.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const filler = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'], type: 'Item' });
const attachedCard = (props) => createCard({ instanceId: nextId++, supertype: 'Energy', ...props });
const mist = (attachedTo) =>
  attachedCard({
    name: 'Mist Energy',
    type: 'Energy',
    subtypes: ['Special Energy'],
    text: 'As long as this card is attached to a Pokémon, it provides {C} Energy. Prevent all effects of attacks used by your opponent’s Pokémon done to the Pokémon this card is attached to. (Existing effects are not removed. Damage is not an effect.)',
    attachedTo,
  });

function board(name, text, { damage = '30', defenderExtra = {}, setup = () => {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'deslop-atksteps', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(filler(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}

const attack = (state) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(3)
  );
const rootOf = (state, playerId, instanceId) =>
  [...state.players[playerId].zones.active, ...state.players[playerId].zones.bench].find(
    (c) => c.instanceId === instanceId
  );

// Crobat BREAK Silent Bite (XY Promos XY181).
const SILENT_BITE =
  "You may leave your opponent's Active Pokémon Paralyzed. If you do, shuffle this Pokémon and all cards attached to into your deck.";

test('Mist Energy on the Defending Pokémon stops Silent Bite’s Paralysis', () => {
  const shielded = board('Crobat BREAK', SILENT_BITE, {
    damage: '60',
    setup: (s, { defender }) => s.players.p2.zones.active.push(mist(defender.instanceId)),
  });
  const offered = attack(shielded.state);
  const res = offered.state.pendingChoice ? choose(offered, [-11]) : offered;
  assert.equal(rootOf(res.state, 'p2', shielded.defender.instanceId).specialCondition ?? null, null);
  const bare = board('Crobat BREAK', SILENT_BITE, { damage: '60' });
  const control = choose(attack(bare.state), [-11]);
  assert.equal(rootOf(control.state, 'p2', bare.defender.instanceId).specialCondition, 'Paralyzed');
});

// ── one HP source for the counter-placing steps ─────────────────────────────

// Hero’s Cape (Temporal Forces 152): "The Pokémon this card is attached to gets +100 HP."
const heroCape = (attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: 'Hero’s Cape',
    type: 'Trainer',
    subtypes: ['Pokémon Tool'],
    isTool: true,
    attachedTo,
    text: 'The Pokémon this card is attached to gets +100 HP.',
  });
const withCape = (s, { defender }) => s.players.p2.zones.active.push(heroCape(defender.instanceId));

// Medicham ex Chi-Atsu (Stellar Crown 161): remaining HP counts the Tool's +100.
test('Chi-Atsu leaves the Defending Pokémon at 50 remaining HP, Tool bonus included', () => {
  const text = "Put damage counters on your opponent's Active Pokémon until its remaining HP is 50.";
  const { state, defender } = board('Medicham ex', text, { damage: '', defenderExtra: { hp: 200 }, setup: withCape });
  assert.equal(rootOf(attack(state).state, 'p2', defender.instanceId).damage, 250);
});

// customhb Mega Absol ex Terminal Cut, with and without the printed full stop: both wordings
// are one rule and read the same (Tool-inclusive) HP.
test('Terminal Cut floors at 10 remaining HP, Tool bonus included, whatever the full stop', () => {
  const printed =
    "Double the number of damage counters on your opponent's Active Pokémon. This attack can't leave it with less than 10 HP remaining";
  for (const text of [printed, `${printed}.`]) {
    const { state, defender } = board('Mega Absol ex', text, {
      damage: '',
      defenderExtra: { hp: 400, damage: 250 },
      setup: withCape,
    });
    assert.equal(rootOf(attack(state).state, 'p2', defender.instanceId).damage, 490, text);
  }
});

// ── leaving play clears attack markers ──────────────────────────────────────

const STALE_MARKER = { kind: 'noWeakness', untilTurn: 99 };

// Shaymin-EX Sky Return (Roaring Skies 77a): "Return this Pokémon and all cards attached to it to your hand."
test('Sky Return: the Pokémon returned to hand carries no attack markers back into play', () => {
  const text = 'Return this Pokémon and all cards attached to it to your hand.';
  const { state, attacker } = board('Shaymin-EX', text, {
    setup: (s, { attacker: a }) => {
      a.attackMarkers = [{ ...STALE_MARKER }];
      s.players.p1.zones.bench.push(mon('Bench Friend'));
    },
  });
  const returned = attack(state).state.players.p1.zones.hand.find((c) => c.instanceId === attacker.instanceId);
  assert.ok(returned, 'Shaymin-EX is in hand');
  assert.equal(returned.attackMarkers, undefined);
});

// Crobat BREAK Silent Bite (XY Promos XY181): "shuffle this Pokémon and all cards attached to into your deck."
test('Silent Bite: the Pokémon shuffled into the deck carries no attack markers', () => {
  const { state, attacker } = board('Crobat BREAK', SILENT_BITE, {
    damage: '60',
    setup: (s, { attacker: a }) => {
      a.attackMarkers = [{ ...STALE_MARKER }];
      s.players.p1.zones.bench.push(mon('Zubat'));
    },
  });
  const res = choose(attack(state), [-11]);
  const shuffled = res.state.players.p1.zones.deck.find((c) => c.instanceId === attacker.instanceId);
  assert.ok(shuffled, 'Crobat BREAK is in the deck');
  assert.equal(shuffled.attackMarkers, undefined);
});

// ── one table per fact ──────────────────────────────────────────────────────

const parsedAfter = (text) => parseAttackSteps(text).after.map(({ attackName, ...step }) => step);

test('the five Special Conditions parse the same in every wording that names them', () => {
  // Team Aqua Technical Machine 01 (Team Magma vs Team Aqua 79; out/pkmn-trainer-cards.json) names the
  // whole list; Porygon2 Delta Beam (Neo Revelation 12) names three.
  assert.deepEqual(
    parsedAfter("Choose 1 Special Condition. Your opponent's Active Pokémon is now affected by that Special Condition."),
    [{ type: 'atkChooseCondition', options: ['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned'] }]
  );
  assert.deepEqual(
    parsedAfter("Choose whether your opponent's Active Pokémon becomes Asleep, Confused, or Paralyzed."),
    [{ type: 'atkChooseCondition', options: ['Asleep', 'Confused', 'Paralyzed'] }]
  );
});

test('every attack step that checks its own extra-Energy requirement is in EXTRA_ENERGY_SELF_GATED', () => {
  const source = readFileSync(new URL('../effects/attack-steps.mjs', import.meta.url), 'utf8');
  const gating = [...source.matchAll(/^function (atk\w+)\(ctx\) \{([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => body.includes('extraEnergySatisfied('))
    .map(([, name]) => name);
  assert.ok(gating.length > 0);
  for (const name of gating) assert.ok(EXTRA_ENERGY_SELF_GATED.has(name), `${name} gates itself but is not listed`);
  for (const name of EXTRA_ENERGY_SELF_GATED) assert.equal(typeof ATTACK_STEP_HANDLERS[name], 'function', name);
});
