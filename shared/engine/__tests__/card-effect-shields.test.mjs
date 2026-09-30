import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { applyCommand } from '../reduce.mjs';
import { cardEffectShielded, cardEffectSource } from '../effects/trainer-steps.mjs';
import {
  abilityPreventsCardEffects,
  abilityPreventsCardEffectsOnPlayer,
  sideContextFor,
} from '../rules/ability-combat.mjs';
import { blocksItemPlay } from '../rules/ability-executors.mjs';

// I219: Abilities that prevent the effects of Item / Supporter / Ability / Stadium cards.
// Ability texts are rows of out/pkmn-pokemon-cards.json and out/pkmn-ancient-trait-cards.json;
// Trainer texts are rows of out/pkmn-trainer-cards.json.
const SHIELDS = {
  // Unnerve (Galvantula TEU 48)
  unnerve:
    'Whenever your opponent plays an Item or Supporter card from their hand, prevent all effects of that card done to this Pokémon.',
  // Ninja Body (Greninja V-UNION SWSH155)
  ninjaBody:
    'Whenever your opponent plays an Item card from their hand, prevent all effects of that card done to this Pokémon.',
  // Obnoxious Whirring (Vibrava CEC 109)
  vibrava: 'Whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to this Pokémon.',
  // Wide Wall (Rhyperior SCR 076)
  wideWall:
    'As long as this Pokémon is in the Active Spot, whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to all of your Pokémon.',
  // Princess's Curtain (Diancie ASR 068)
  diancie:
    'As long as this Pokémon is in the Active Spot, whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to your Benched Basic Pokémon.',
  // Mysterious Buzz (Ribombee LOT 146)
  ribombee:
    'As long as this Pokémon is on your Bench, whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to your {Y} Pokémon in play.',
  // Baffling (Thievul ASR 104)
  thievul:
    'If your opponent has 2 or fewer Prize cards remaining, whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to your Benched Pokémon V.',
  // Guardian of Love (Enamorus V LOR 082)
  enamorus:
    "Prevent all effects of your opponent's Pokémon's Abilities done to each of your Pokémon that has any {P} Energy attached, except any Enamorus V.",
  // Luminous Wing (Mega Clefable ex MEP 072), θ Stop
  luminousWing: "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon.",
  // Ω Barrier (Regirock XY49)
  omegaBarrier:
    'Whenever your opponent plays a Trainer card (excluding Pokémon Tools and Stadium cards), prevent all effects of that card done to this Pokémon.',
  // New Moon (Lunatone OBF 092)
  lunatone: 'If you have Solrock in play, prevent all effects of any Stadium done to your Pokémon in play.',
  // Dew Guard (Milotic EVS 038)
  milotic:
    'Whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to you or your hand.',
};

const TRAINERS = {
  // Ascended Heroes 256
  bossOrders: { text: 'Switch in 1 of your opponent’s Benched Pokémon to the Active Spot.', type: 'Supporter' },
  // Twilight Masquerade 224
  enhancedHammer: { text: 'Discard a Special Energy from 1 of your opponent’s Pokémon.', type: 'Item' },
  // Scarlet & Violet Promos 124
  iono: {
    text: 'Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining Prize cards.',
    type: 'Supporter',
  },
};

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', hp: 100, types: ['Colorless'], ...extra });
const shielded = (instanceId, name, key, extra = {}) => mon(instanceId, name, { abilities: [{ name: key, text: SHIELDS[key] }], ...extra });
const energy = (instanceId, name, attachedTo, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', attachedTo, ...extra });

function board({ p1Active = mon(1, 'Attacker'), p2Active, p2Bench = [], p2Prizes = 6 } = {}) {
  const state = createGameState({ gameId: 'shields', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  state.players.p1.zones.active.push(p1Active);
  state.players.p2.zones.active.push(p2Active);
  state.players.p2.zones.bench.push(...p2Bench);
  for (let i = 0; i < p2Prizes; i++) state.players.p2.zones.prizes.push(mon(800 + i, `Prize ${i}`));
  for (let i = 0; i < 3; i++) state.players.p2.zones.deck.push(mon(700 + i, `Deck ${i}`));
  return state;
}

const shieldOf = (state, root, source) =>
  cardEffectShielded(state, { owner: state.players.p2, root, source });

test('cardEffectSource names the played card kind, an Ability or a Stadium', () => {
  assert.equal(cardEffectSource('trainer', { trainerType: 'Supporter' }), 'Supporter');
  assert.equal(cardEffectSource('trainer', { trainerType: 'Item' }), 'Item');
  assert.equal(cardEffectSource('trainer', { trainerType: 'Tool' }), null);
  assert.equal(cardEffectSource('ability', {}), 'Ability');
  assert.equal(cardEffectSource('stadium', {}), 'Stadium');
  assert.equal(cardEffectSource('attackSteps', { trainerType: 'Supporter' }), null, 'a Supporter used as an attack');
});

test('self shields: each wording covers exactly its card kinds', () => {
  const cases = [
    ['unnerve', ['Item', 'Supporter']],
    ['ninjaBody', ['Item']],
    ['vibrava', ['Supporter']],
    ['luminousWing', ['Ability']],
    ['omegaBarrier', ['Item', 'Supporter']],
  ];
  for (const [key, covered] of cases) {
    const holder = shielded(2, 'Holder', key);
    const other = mon(3, 'Other');
    const state = board({ p2Active: holder, p2Bench: [other] });
    for (const source of ['Item', 'Supporter', 'Ability', 'Stadium']) {
      assert.equal(shieldOf(state, holder, source), covered.includes(source), `${key} vs ${source}`);
      assert.equal(shieldOf(state, other, source), false, `${key} does not cover another Pokémon`);
    }
  }
});

test('team shields read their holder position and target', () => {
  // Wide Wall: only while Active, then every Pokémon on that side.
  const rhyperior = shielded(2, 'Rhyperior', 'wideWall');
  const benched = mon(3, 'Benched');
  assert.equal(shieldOf(board({ p2Active: rhyperior, p2Bench: [benched] }), benched, 'Supporter'), true);
  const rhyperiorBenched = shielded(4, 'Rhyperior', 'wideWall');
  const active = mon(5, 'Active');
  assert.equal(shieldOf(board({ p2Active: active, p2Bench: [rhyperiorBenched] }), active, 'Supporter'), false);

  // Princess's Curtain: Benched Basic only.
  const diancie = shielded(2, 'Diancie', 'diancie');
  const basic = mon(3, 'Basic');
  const stage1 = mon(4, 'Stage 1', { stage: 'Stage 1' });
  const curtain = board({ p2Active: diancie, p2Bench: [basic, stage1] });
  assert.equal(shieldOf(curtain, basic, 'Supporter'), true);
  assert.equal(shieldOf(curtain, stage1, 'Supporter'), false);
  assert.equal(shieldOf(curtain, diancie, 'Supporter'), false, 'the Active holder is not Benched');

  // Mysterious Buzz: from the Bench, your {Y} Pokémon.
  const ribombee = shielded(2, 'Ribombee', 'ribombee');
  const fairy = mon(3, 'Fairy', { types: ['Fairy'] });
  const buzz = board({ p2Active: fairy, p2Bench: [ribombee] });
  assert.equal(shieldOf(buzz, fairy, 'Supporter'), true);
});

test('Thievul reads the opponent’s Prize count; Enamorus V needs {P} Energy and excludes itself', () => {
  const thievul = shielded(2, 'Thievul', 'thievul');
  const v = mon(3, 'Zacian V', { subtypes: ['Basic', 'V'] });
  const at = (prizes) => {
    const state = board({ p2Active: thievul, p2Bench: [v] });
    state.players.p1.zones.prizes.push(...Array.from({ length: prizes }, (_, i) => mon(900 + i, `P1 Prize ${i}`)));
    return shieldOf(state, v, 'Supporter');
  };
  assert.equal(at(2), true);
  assert.equal(at(3), false);

  const enamorus = shielded(2, 'Enamorus V', 'enamorus', { subtypes: ['Basic', 'V'] });
  const powered = mon(3, 'Powered');
  const bare = mon(4, 'Bare');
  const state = board({
    p2Active: enamorus,
    p2Bench: [powered, bare, energy(5, 'Basic Psychic Energy', 3, { types: ['Psychic'] }), energy(6, 'Basic Psychic Energy', 2, { types: ['Psychic'] })],
  });
  assert.equal(shieldOf(state, powered, 'Ability'), true);
  assert.equal(shieldOf(state, bare, 'Ability'), false);
  assert.equal(shieldOf(state, enamorus, 'Ability'), false);
});

test('Lunatone shields from Stadium effects only with Solrock in play', () => {
  const lunatone = shielded(2, 'Lunatone', 'lunatone');
  const ally = mon(3, 'Ally');
  assert.equal(shieldOf(board({ p2Active: lunatone, p2Bench: [ally, mon(4, 'Solrock')] }), ally, 'Stadium'), true);
  assert.equal(shieldOf(board({ p2Active: lunatone, p2Bench: [ally] }), ally, 'Stadium'), false);
});

test('a suppressed Ability shields nothing; a θ Stop Ancient Trait ignores suppression', () => {
  const suppressor = mon(9, 'Suppressor', {
    abilities: [{ name: 'Lock', text: "Each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities." }],
  });
  const holder = shielded(2, 'Holder', 'luminousWing');
  const state = board({ p1Active: suppressor, p2Active: holder });
  const ctx = sideContextFor(state, 'p2');
  const plain = abilityPreventsCardEffects(holder, 'Ability', ctx);
  const trait = mon(3, 'Celebi', { abilities: [{ name: 'θ Stop', type: 'Ancient Trait', text: SHIELDS.luminousWing }] });
  const traitState = board({ p1Active: suppressor, p2Active: trait });
  assert.equal(abilityPreventsCardEffects(trait, 'Ability', sideContextFor(traitState, 'p2')), true);
  assert.equal(plain, false, 'a suppressed Luminous Wing does not shield');
});

function play(state, key, answers = []) {
  const { text, type } = TRAINERS[key];
  const card = createCard({ instanceId: 950, name: key, supertype: 'Trainer', type, trainerType: type, text });
  state.players.p1.zones.hand.push(card);
  const events = [];
  let res = executeTrainer(state, { card, playerId: 'p1', events });
  const prompts = [];
  for (const answer of answers) {
    if (!res.pendingChoice) break;
    prompts.push(res.pendingChoice);
    res = executeTrainer(state, { card, playerId: 'p1', events, selection: answer, resumeToken: res.pendingChoice.resumeToken });
  }
  if (res.pendingChoice) prompts.push(res.pendingChoice);
  return { res, prompts, events };
}

test('Boss’s Orders cannot bring up a Pokémon shielded from Supporters', () => {
  const vibrava = shielded(3, 'Vibrava', 'vibrava');
  const plain = mon(4, 'Plain');
  const state = board({ p2Active: mon(2, 'Active'), p2Bench: [vibrava, plain] });
  play(state, 'bossOrders');
  // One legal target left: it is switched in without a prompt.
  assert.equal(state.players.p2.zones.active.find((c) => !c.attachedTo).name, 'Plain');

  const onlyShielded = board({ p2Active: mon(2, 'Active'), p2Bench: [shielded(3, 'Vibrava', 'vibrava')] });
  play(onlyShielded, 'bossOrders');
  assert.equal(onlyShielded.players.p2.zones.active.find((c) => !c.attachedTo).name, 'Active');
});

test('Enhanced Hammer cannot discard Energy from a Pokémon shielded from Items', () => {
  const greninja = shielded(2, 'Greninja V-UNION', 'ninjaBody');
  const special = energy(3, 'Double Turbo Energy', 2, { subtypes: ['Special'] });
  const state = board({ p2Active: greninja, p2Bench: [special] });
  play(state, 'enhancedHammer');
  assert.equal(state.players.p2.zones.bench.some((c) => c.instanceId === 3), true, 'still attached');
});

test('Iono leaves a Milotic player’s hand alone', () => {
  const milotic = shielded(2, 'Milotic', 'milotic');
  const state = board({ p2Active: milotic, p2Prizes: 3 });
  state.players.p2.zones.hand.push(mon(600, 'Kept'));
  state.players.p1.zones.hand.push(mon(601, 'Mine'));
  state.players.p1.zones.prizes.push(mon(602, 'P1 Prize'));
  state.players.p1.zones.deck.push(mon(603, 'P1 Deck'));
  play(state, 'iono');
  assert.deepEqual(state.players.p2.zones.hand.map((c) => c.name), ['Kept']);
  assert.equal(abilityPreventsCardEffectsOnPlayer('Supporter', sideContextFor(state, 'p2')), true);
  assert.equal(abilityPreventsCardEffectsOnPlayer('Item', sideContextFor(state, 'p2')), false);
});

test('an opponent’s Ability cannot Confuse a Pokémon with Luminous Wing', () => {
  const state = board({ p2Active: shielded(2, 'Mega Clefable ex', 'luminousWing') });
  const events = [];
  executeSteps(state, {
    steps: [{ type: 'applyStatus', target: 'opponentActive', conditions: ['Confused'] }],
    effectType: 'ability',
    sourceCard: state.players.p1.zones.active[0],
    playerId: 'p1',
    events,
  });
  assert.deepEqual(state.players.p2.zones.active[0].specialConditions || [], []);
  assert.ok(events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'ability_shield'));
});

test('an Item shield is not an Item lock (the legacy client stopped every Item)', () => {
  assert.equal(blocksItemPlay({ abilities: [{ text: SHIELDS.ninjaBody }] }), false);
  assert.equal(blocksItemPlay({ abilities: [{ text: 'Your opponent can’t play any Item cards from their hand.' }] }), true);
});

// ── review follow-ups: reduce-level paths ─────────────────────────────────────

const TAILS = { next: () => 0.9, shuffle: (cards) => cards };

function passBoard(p2Active, p2Bench = []) {
  const state = board({ p2Active, p2Bench });
  for (const id of ['p1', 'p2']) state.players[id].flags = { abilitiesUsed: {}, supporterPlayed: false };
  for (let i = 0; i < 3; i++) state.players.p1.zones.deck.push(mon(750 + i, `P1 Deck ${i}`));
  return state;
}

test('Checkup Ability counters skip a Pokémon with Luminous Wing', () => {
  // Trevenant Forest Miasma (corpus row): "During Pokémon Checkup, if this Pokémon is in the Active
  // Spot, put 1 damage counter on your opponent's Active Pokémon."
  const miasma = "During Pokémon Checkup, if this Pokémon is in the Active Spot, put 1 damage counter on your opponent's Active Pokémon.";
  const run = (p2Active) => {
    const state = passBoard(p2Active);
    state.players.p1.zones.active[0] = mon(1, 'Trevenant', { abilities: [{ name: 'Forest Miasma', text: miasma }] });
    const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, TAILS);
    assert.equal(res.error, null);
    return res.state.players.p2.zones.active[0].damage || 0;
  };
  assert.equal(run(mon(2, 'Plain')), 10, 'control: the counter lands');
  assert.equal(run(shielded(2, 'Mega Clefable ex', 'luminousWing')), 0);
});

test('Lunatone with Solrock stops between-turns Stadium damage on its side only', () => {
  const state = passBoard(shielded(2, 'Lunatone', 'lunatone'), [mon(3, 'Solrock')]);
  state.stadium = {
    card: createCard({
      instanceId: 900,
      name: 'Test Stadium',
      supertype: 'Trainer',
      subtypes: ['Stadium'],
      text: 'Between turns, put 1 damage counter on each Pokémon (both yours and your opponent’s).',
    }),
    ownerId: 'p1',
  };
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, TAILS);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0);
  assert.equal(res.state.players.p2.zones.bench[0].damage || 0, 0);
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
});

test('Marnie against Milotic: the Milotic player keeps their hand and draws nothing', () => {
  // Marnie, Sword & Shield Promos SWSH121 (corpus row).
  const marnie =
    'Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom of their deck in this way, you draw 5 cards, and your opponent draws 4 cards.';
  const state = board({ p2Active: shielded(2, 'Milotic', 'milotic') });
  state.players.p2.zones.hand.push(mon(600, 'Kept'));
  state.players.p1.zones.hand.push(mon(601, 'Mine'));
  for (let i = 0; i < 6; i++) state.players.p1.zones.deck.push(mon(610 + i, `P1 Deck ${i}`));
  const card = createCard({ instanceId: 950, name: 'Marnie', supertype: 'Trainer', type: 'Supporter', trainerType: 'Supporter', text: marnie });
  state.players.p1.zones.hand.push(card);
  executeTrainer(state, { card, playerId: 'p1', events: [] });
  assert.deepEqual(state.players.p2.zones.hand.map((c) => c.name), ['Kept']);
  assert.equal(state.players.p1.zones.hand.length, 5);
});
