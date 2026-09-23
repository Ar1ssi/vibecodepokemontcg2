// Activated Abilities the ability parser leaves without an executor (I89) or reads as passive
// only (I95) run through the shared effect templates (rules/attack-steps.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { EXECUTOR_STEP_TYPES } from '../effects/executor.mjs';
import { parseAbilityEffectSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type, attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    attachedTo,
  });

function withAbility(text, { name = 'Holder', zone = 'active', setup = () => {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'ability-templates', seed: 4, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 5; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const holder = mon(name, { abilities: [{ name: 'Test Ability', type: 'Ability', text }] });
  state.players.p1.zones[zone].push(holder);
  if (zone === 'bench') state.players.p1.zones.active.push(mon('Own Active'));
  state.players.p2.zones.active.push(mon('Opp Active'));
  const ctx = { state, holder, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(4) };
}

const use = (b) =>
  applyCommand(b.state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: b.holder.instanceId } }, b.rng);
const choose = (res, selection, rng) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    rng
  );

test('EXECUTOR_STEP_TYPES lists exactly the executeSteps switch cases', () => {
  const src = fs.readFileSync(new URL('../effects/executor.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function executeSteps'));
  const cases = new Set([...body.matchAll(/^ {6}case '([A-Za-z]+)':/gm)].map((m) => m[1]));
  assert.deepEqual([...cases].sort(), [...EXECUTOR_STEP_TYPES].sort());
});

test('parseAbilityEffectSteps: reads the effect after the activation wording only', () => {
  assert.deepEqual(
    parseAbilityEffectSteps('As often as you like during your turn, you may use this Ability. Move a {W} Energy from 1 of your Benched Pokémon to your Active Pokémon.').steps,
    [{ type: 'atkMoveEnergy', from: 'bench', to: 'active', count: 1, energyType: 'W' }]
  );
  assert.deepEqual(parseAbilityEffectSteps('Once during your turn, if you have 3 Prize cards left, you may draw a card.').steps, []);
  assert.deepEqual(parseAbilityEffectSteps("If this Pokémon is damaged by an attack, discard an Energy from your opponent's Active Pokémon.").steps, []);
});

test('ability: Dewgong Wash Out moves a {W} Energy from the Bench to the Active Pokémon (I89)', () => {
  let water;
  const b = withAbility(
    'As often as you like during your turn, you may use this Ability. Move a {W} Energy from 1 of your Benched Pokémon to your Active Pokémon.',
    {
      name: 'Dewgong',
      zone: 'bench',
      setup: ({ p1 }) => {
        const benched = mon('Benched');
        p1.zones.bench.push(benched);
        water = energy('Water', benched.instanceId);
        p1.zones.bench.push(water, energy('Fire', benched.instanceId));
      },
    }
  );
  // The one {W} Energy moves without a prompt; the Fire Energy stays.
  const res = use(b);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice, null);
  const active = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(res.state.players.p1.zones.active.find((c) => c.instanceId === water.instanceId)?.attachedTo, active.instanceId);
  assert.equal(res.state.players.p1.zones.bench.filter((c) => c.name === 'Basic Fire Energy').length, 1);
});

test('ability: Alomomola Gentle Fin needs the Active Spot and a Basic with 70 HP or less (I89)', () => {
  const text = 'Once during your turn, if this Pokémon is in the Active Spot, you may put a Basic Pokémon with 70 HP or less from your discard pile onto your Bench.';
  let small;
  const setup = ({ p1 }) => {
    small = mon('Small', { hp: 60 });
    p1.zones.discard.push(small, mon('Big', { hp: 120 }));
  };
  const res = use(withAbility(text, { name: 'Alomomola', setup }));
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.bench.some((c) => c.instanceId === small.instanceId));
  assert.equal(res.state.players.p1.zones.bench.length, 1);

  const benched = use(withAbility(text, { name: 'Alomomola', zone: 'bench', setup }));
  assert.equal(benched.state.players.p1.zones.bench.some((c) => c.name === 'Small'), false, 'not from the Bench');
  assert.ok(!benched.state.players.p1.flags.abilitiesUsed[1], 'the Ability is not spent');
});

test('ability: Galarian Mr. Rime Shuffle Dance swaps a Prize with the top of the deck (I95)', () => {
  const b = withAbility(
    "Once during your turn, you may switch 1 of your opponent's face-down Prize cards with the top card of their deck. (The cards stay face down.)",
    { name: 'Galarian Mr. Rime' }
  );
  const top = b.p2.zones.deck[0];
  const res1 = use(b);
  assert.equal(res1.error, null);
  const choice = res1.state.pendingChoice;
  assert.ok(choice.options.every((o) => o.name === ''), 'Prize cards stay face down');
  const prizeId = choice.options[2].instanceId;
  const res2 = choose(res1, [prizeId], b.rng);
  assert.equal(res2.state.players.p2.zones.deck[0].instanceId, prizeId);
  assert.ok(res2.state.players.p2.zones.prizes.some((c) => c.instanceId === top.instanceId));
});

test('ability: an effect with no executor is reported and does not spend the Ability (I89)', () => {
  // Flygon PRC 110: parses to handDeckSwapAbility, which has no executor.
  const b = withAbility(
    'Once during your turn (before your attack), you may choose either player. That player shuffles his or her hand into his or her deck and draws 4 cards.'
  );
  const res = use(b);
  assert.equal(res.error, null);
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'unsupported_step'));
  assert.ok(!res.state.players.p1.flags.abilitiesUsed[b.holder.instanceId]);
});
