// Homebrew Trainer audit 2026-10-31 (customhb, R2 bucket set.json): Tools and Stadiums whose
// text the authoritative reducer ignored. Card text is the bucket `effect` for the homebrew
// rewrites (Thick Scale customhb-049, Metal Core Barrier -165, Sky Field -485, Surfing Beach -209,
// Full Metal Lab -163, Mountain Ring -240); the rest is the pkmncards corpus row
// (out/pkmn-trainer-cards.json) named beside each constant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

// customhb-049 Thick Scale (bucket effect)
const THICK_SCALE =
  "The {N} Pokémon this card is attached to takes 20 less damage from attacks from your opponent's {G}, {R}, {W}, or {L} Pokémon (after applying Weakness and Resistance).";
// Dark Claw, Dark Explorers (corpus)
const DARK_CLAW =
  'If this card is attached to a {D} Pokémon, each of the attacks of that Pokémon does 20 more damage to the Active Pokémon (before applying Weakness and Resistance).';
// customhb-163 Full Metal Lab (bucket effect)
const FULL_METAL_LAB =
  "{M} Pokémon (both yours and your opponent's) take 10 less damage from attacks from the opponent's Pokémon (after applying Weakness and Resistance).";
// customhb-240 Mountain Ring (bucket effect)
const MOUNTAIN_RING =
  "Prevent all damage done to Benched {F} Pokémon by attacks (both yours and your opponent's).";
// Neutralization Zone, Shrouded Fable (corpus)
const NEUTRALIZATION_ZONE =
  "Prevent all damage done to Pokémon that don't have a Rule Box (both yours and your opponent's) by attacks from the opponent's Pokémon ex and Pokémon V. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)\n\nThis card can't be put into your hand or deck from the discard pile.";
// Fighting Stadium, Furious Fists (corpus)
const FIGHTING_STADIUM =
  "The attacks of each {F} Pokémon in play (both yours and your opponent's) do 20 more damage to the Defending Pokémon-EX (before applying Weakness and Resistance).";
// Steel Shelter, Phantom Forces (corpus)
const STEEL_SHELTER =
  "Each {M} Pokémon (both yours and your opponent's) can't be affected by any Special Conditions. (Remove any Special Conditions affecting those Pokémon.)";
// Perilous Jungle, Temporal Forces (corpus)
const PERILOUS_JUNGLE =
  "During Pokémon Checkup, put 2 more damage counters on each Poisoned non-{D} Pokémon (both yours and your opponent's).";

let nextId = 1000;
const mon = (name, type, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Pokémon', stage: 'Basic', types: [type], hp: 300, ...extra });
const energy = (type, extra = {}) => createCard({ instanceId: nextId++, name: `${type} Energy`, type: 'Energy', ...extra });
const trainer = (name, kind, text) => createCard({ instanceId: nextId++, name, type: 'Trainer', trainerType: kind, text });
const attach = (host, ...cards) => cards.map((c) => Object.assign(c, { attachedTo: host.instanceId }));
const hitter = (name, type, damage = 50, text = '', extra = {}) =>
  mon(name, type, { attacks: [{ name: 'Hit', cost: [], damage: String(damage), text }], ...extra });

function board({ p1 = {}, p2 = {}, stadium = null, turn = 3 } = {}) {
  const state = createGameState({ gameId: 'audit-tools-stadiums', seed: 7, rulesEnabled: true });
  for (const [id, z] of [['p1', p1], ['p2', p2]]) {
    const zones = createPlayerZones();
    for (const [k, v] of Object.entries(z)) zones[k].push(...v);
    if (!zones.active.length) zones.active.push(mon(`${id} Active`, 'Colorless'));
    while (zones.prizes.length < 6) zones.prizes.push(mon(`${id} prize`, 'Colorless'));
    while (zones.deck.length < 10) zones.deck.push(trainer(`${id} deck`, 'Item', 'Draw a card.'));
    state.players[id] = { playerId: id, username: id, zones, flags: { abilitiesUsed: {}, supporterPlayed: false } };
  }
  if (stadium) state.stadium = stadium;
  state.turn = { player: 'p1', number: turn, phase: 'main' };
  return state;
}

const run = (state, command, seed = 1) => applyCommand(state, command, createRng(seed));
const attack = (state, playerId = 'p1') => run(state, { type: 'attack', payload: { attackIndex: 0 }, playerId });
const p2Active = (res) => res.state.players.p2.zones.active.find((c) => !c.attachedTo);

test('Thick Scale (customhb-049): −20 against each listed type, never against an unlisted one', () => {
  for (const [type, expected] of [['Grass', 30], ['Fire', 30], ['Water', 30], ['Lightning', 30], ['Psychic', 50]]) {
    const holder = mon('Dragonite', 'Dragon');
    const res = attack(board({ p1: { active: [hitter('A', type)] }, p2: { active: [holder, ...attach(holder, trainer('Thick Scale', 'Tool', THICK_SCALE))] } }));
    assert.equal(res.error, null);
    assert.equal(p2Active(res).damage, expected, `${type} attacker`);
  }
});

test('Dark Claw: +20 only while its holder is a {D} Pokémon', () => {
  for (const [type, expected] of [['Darkness', 70], ['Fire', 50]]) {
    const a = hitter('A', type);
    const res = attack(board({ p1: { active: [a, ...attach(a, trainer('Dark Claw', 'Tool', DARK_CLAW))] }, p2: { active: [mon('D', 'Grass')] } }));
    assert.equal(p2Active(res).damage, expected, `${type} holder`);
  }
});

test('Full Metal Lab (customhb-163): {M} Pokémon take 10 less, others full', () => {
  const stadium = trainer('Full Metal Lab', 'Stadium', FULL_METAL_LAB);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('A', 'Fire')] }, p2: { active: [mon('Steelix', 'Metal')] }, stadium }))).damage, 40);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('A', 'Fire')] }, p2: { active: [mon('Charm', 'Fire')] }, stadium }))).damage, 50);
});

test('Mountain Ring (customhb-240): spread damage skips Benched {F} only; the Active still takes damage', () => {
  const stadium = trainer('Mountain Ring', 'Stadium', MOUNTAIN_RING);
  const spread = hitter('Spreader', 'Fire', 30, "This attack also does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)");
  const fBench = mon('Onix', 'Fighting');
  const rBench = mon('Vulpix', 'Fire');
  const res = attack(board({ p1: { active: [spread] }, p2: { active: [mon('Machop', 'Fighting')], bench: [fBench, rBench] }, stadium }));
  assert.equal(res.error, null);
  const bench = res.state.players.p2.zones.bench;
  assert.equal(bench.find((c) => c.instanceId === fBench.instanceId).damage, 0, 'Benched {F} prevented');
  assert.equal(bench.find((c) => c.instanceId === rBench.instanceId).damage, 20, 'Benched {R} damaged');
  assert.equal(p2Active(res).damage, 30, 'the Active {F} is not Benched');
});

test('Neutralization Zone: an ex attacker deals no damage to a Pokémon without a Rule Box', () => {
  const stadium = trainer('Neutralization Zone', 'Stadium', NEUTRALIZATION_ZONE);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('Big ex', 'Fire', 50, '', { subtypes: ['ex'] })] }, p2: { active: [mon('Plain', 'Fire')] }, stadium }))).damage, 0);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('Plain A', 'Fire')] }, p2: { active: [mon('Plain', 'Fire')] }, stadium }))).damage, 50, 'non-Rule-Box attacker');
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('Big ex', 'Fire', 50, '', { subtypes: ['ex'] })] }, p2: { active: [mon('Other ex', 'Fire', { subtypes: ['ex'] })] }, stadium }))).damage, 50, 'Rule-Box defender');
});

test('Fighting Stadium: a {F} attacker does 20 more to a Pokémon-EX only', () => {
  const stadium = trainer('Fighting Stadium', 'Stadium', FIGHTING_STADIUM);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('A', 'Fighting')] }, p2: { active: [mon('Lucario-EX', 'Fire', { subtypes: ['EX'] })] }, stadium }))).damage, 70);
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('A', 'Fighting')] }, p2: { active: [mon('Plain', 'Fire')] }, stadium }))).damage, 50, 'non-EX defender');
  assert.equal(p2Active(attack(board({ p1: { active: [hitter('A', 'Fire')] }, p2: { active: [mon('Lucario-EX', 'Fire', { subtypes: ['EX'] })] }, stadium }))).damage, 50, 'non-{F} attacker');
});

test('Steel Shelter: a {M} Active is never left Poisoned and takes no Checkup damage', () => {
  const stadium = trainer('Steel Shelter', 'Stadium', STEEL_SHELTER);
  const poisoner = "Your opponent's Active Pokémon is now Poisoned.";
  const metal = attack(board({ p1: { active: [hitter('A', 'Fire', 10, poisoner)] }, p2: { active: [mon('Steelix', 'Metal')] }, stadium }));
  assert.equal(p2Active(metal).specialCondition ?? null, null);
  assert.equal(p2Active(metal).damage, 10, 'attack damage only');
  const fire = attack(board({ p1: { active: [hitter('A', 'Fire', 10, poisoner)] }, p2: { active: [mon('Charm', 'Fire')] }, stadium }));
  assert.equal(p2Active(fire).damage, 20, 'a non-{M} Pokémon is Poisoned and takes Checkup damage');
});

test('Perilous Jungle: a Poisoned non-{D} Pokémon takes 2 more counters at Checkup; a {D} one does not', () => {
  const stadium = trainer('Perilous Jungle', 'Stadium', PERILOUS_JUNGLE);
  const pass = (type) =>
    run(board({ p2: { active: [mon('Sick', type, { specialCondition: 'Poisoned' })] }, stadium }), { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(p2Active(pass('Fire')).damage, 30);
  assert.equal(p2Active(pass('Darkness')).damage, 10);
});

// customhb-165 Metal Core Barrier (bucket effect)
const METAL_CORE_BARRIER =
  "If this card is attached to 1 of your Pokémon, discard it at the end of your opponent's turn.\n\nThe {M} Pokémon this card is attached to takes 50 less damage from your opponent's attacks (after applying Weakness and Resistance).";
// Leftovers, 151 (corpus)
const LEFTOVERS =
  'At the end of your turn, if the Pokémon this card is attached to is in the Active Spot, heal 20 damage from it.';
// Spell Tag, Lost Thunder (corpus)
const SPELL_TAG =
  "When the {P} Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, put 4 damage counters on your opponent's Pokémon in any way you like.";
// customhb-485 Sky Field (bucket effect)
const SKY_FIELD =
  "Once during each player's turn, you may move 1 Energy card from 1 of your {C} Pokémon to another of your {C} Pokémon.";
// customhb-209 Surfing Beach (bucket effect)
const SURFING_BEACH = "Once during each player's turn, that player may heal 20 damage from all their {W} Pokémon.";
// Community Center, Twilight Masquerade (corpus)
const COMMUNITY_CENTER =
  "Once during each player's turn, if they played a Supporter card from their hand this turn, they may heal 10 damage from each of their Pokémon.";

const passTurn = (state, playerId) => run(state, { type: 'pass', payload: {}, playerId });
const useStadium = (state, playerId = 'p1') => run(state, { type: 'stadium-effect', payload: {}, playerId });
const choose = (res, instanceId) =>
  run(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [instanceId] },
    playerId: res.pendingChoice.player,
  });

test("Metal Core Barrier (customhb-165): stays through its owner's turn, discarded at the end of the opponent's", () => {
  const steelix = mon('Steelix', 'Metal');
  const barrier = trainer('Metal Core Barrier', 'Tool', METAL_CORE_BARRIER);
  let res = run(board({ p1: { active: [steelix], hand: [barrier] } }), {
    type: 'attachCard',
    payload: { instanceId: barrier.instanceId, targetInstanceId: steelix.instanceId },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  res = passTurn(res.state, 'p1');
  assert.ok(res.state.players.p1.zones.active.some((c) => c.instanceId === barrier.instanceId), "kept after its owner's turn");
  res = passTurn(res.state, 'p2');
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === barrier.instanceId), "discarded after the opponent's turn");
});

test("Leftovers: heals 20 from the Active holder at the end of its owner's turn; a Benched holder is not healed", () => {
  const active = mon('Snorlax', 'Colorless', { damage: 50 });
  const benched = mon('Munchlax', 'Colorless', { damage: 50 });
  const res = passTurn(
    board({
      p1: {
        active: [active, ...attach(active, trainer('Leftovers', 'Tool', LEFTOVERS))],
        bench: [benched, ...attach(benched, trainer('Leftovers', 'Tool', LEFTOVERS))],
      },
    }),
    'p1'
  );
  assert.equal(res.state.players.p1.zones.active.find((c) => c.instanceId === active.instanceId).damage, 30);
  assert.equal(res.state.players.p1.zones.bench.find((c) => c.instanceId === benched.instanceId).damage, 50);
});

test("Spell Tag: its owner places 4 counters on the attacker's side after the {P} holder is Knocked Out", () => {
  const striker = hitter('Striker', 'Fire', 200, '', { hp: 200 });
  const strikerBench = mon('Bench', 'Fire', { hp: 200 });
  const holder = mon('Gastly', 'Psychic', { hp: 60 });
  let res = attack(
    board({
      p1: { active: [striker], bench: [strikerBench] },
      p2: { active: [holder, ...attach(holder, trainer('Spell Tag', 'Tool', SPELL_TAG))], bench: [mon('Next', 'Psychic')] },
    })
  );
  assert.equal(res.error, null);
  // Prize and promotion choices come first; Spell Tag waits for them.
  let picks = 0;
  for (let guard = 0; res.pendingChoice && guard < 12; guard++) {
    const spellTag = /Spell Tag/.test(res.pendingChoice.prompt || '');
    if (spellTag) picks++;
    const pick = spellTag
      ? picks <= 3 ? striker.instanceId : strikerBench.instanceId
      : res.pendingChoice.options[0].instanceId;
    res = choose(res, pick);
    assert.equal(res.error, null);
  }
  assert.equal(picks, 4, 'one pick per counter');
  const p1 = res.state.players.p1.zones;
  assert.equal(p1.active.find((c) => c.instanceId === striker.instanceId).damage, 30);
  assert.equal(p1.bench.find((c) => c.instanceId === strikerBench.instanceId).damage, 10);
});

test('Sky Field (customhb-485): moves an Energy between two {C} Pokémon only', () => {
  const snorlax = mon('Snorlax', 'Colorless');
  const pidgey = mon('Pidgey', 'Colorless');
  const charm = mon('Charmander', 'Fire');
  const fire = energy('Fire');
  let res = useStadium(
    board({ p1: { active: [snorlax, ...attach(snorlax, fire)], bench: [pidgey, charm] }, stadium: trainer('Sky Field', 'Stadium', SKY_FIELD) })
  );
  assert.equal(res.error, null);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [snorlax.instanceId], 'only {C} sources with Energy');
  res = choose(res, snorlax.instanceId);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [pidgey.instanceId], 'only another {C} Pokémon');
  res = choose(res, pidgey.instanceId);
  assert.equal(res.pendingChoice, null);
  const moved = res.state.players.p1.zones.bench.find((c) => c.instanceId === fire.instanceId);
  assert.equal(moved?.attachedTo, pidgey.instanceId);
});

test('Sky Field (customhb-485): with no Energy on a {C} Pokémon the activation does nothing', () => {
  const res = useStadium(
    board({ p1: { active: [mon('Snorlax', 'Colorless')], bench: [mon('Pidgey', 'Colorless')] }, stadium: trainer('Sky Field', 'Stadium', SKY_FIELD) })
  );
  assert.equal(res.pendingChoice, null);
  assert.ok(!res.state.players.p1.flags.stadiumUsedThisTurn, 'not spent');
});

test('Surfing Beach (customhb-209): heals 20 from every {W} Pokémon, none from others', () => {
  const a = mon('Squirtle', 'Water', { damage: 50 });
  const b = mon('Psyduck', 'Water', { damage: 30 });
  const c = mon('Vulpix', 'Fire', { damage: 30 });
  const res = useStadium(board({ p1: { active: [a], bench: [b, c] }, stadium: trainer('Surfing Beach', 'Stadium', SURFING_BEACH) }));
  assert.equal(res.error, null);
  const all = [...res.state.players.p1.zones.active, ...res.state.players.p1.zones.bench];
  assert.deepEqual([a, b, c].map((m) => all.find((x) => x.instanceId === m.instanceId).damage), [30, 10, 30]);
});

test('Community Center: heals only after a Supporter was played from hand this turn', () => {
  const stadium = () => trainer('Community Center', 'Stadium', COMMUNITY_CENTER);
  const without = useStadium(board({ p1: { active: [mon('A', 'Fire', { damage: 40 })] }, stadium: stadium() }));
  assert.equal(without.state.players.p1.zones.active[0].damage, 40, 'no Supporter played');
  const state = board({ p1: { active: [mon('A', 'Fire', { damage: 40 })] }, stadium: stadium() });
  state.players.p1.flags.supporterPlayed = true;
  assert.equal(useStadium(state).state.players.p1.zones.active[0].damage, 30, 'Supporter played');
});
