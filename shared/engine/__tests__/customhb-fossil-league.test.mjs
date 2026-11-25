// Homebrew set customhb (HB publish 2026-11-24): G Scope, Lucky Energy, Lugia ex, Shieldon, the two
// Bastiodon, Archeops, Carracosta and Relicanth. Card text source (directive 7): the user's set.json
// records, verbatim, from cardback — each constant below names its record. The cards are built from
// those records the way the client's cardStats sends them to the server (card-stats.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

// G Scope (set.json record customhb-674, from cardback).
const G_SCOPE = {
  name: 'G Scope',
  trainerType: 'Tool',
  effect:
    'The Genesect this card is attached to can also use the attack on this card. (You still need the necessary Energy to use this attack.)',
  attacks: [
    {
      cost: ['Metal', 'Grass', 'Colorless'],
      name: 'G Scope',
      effect: "This attack does 100 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      damage: '',
    },
  ],
};
// Lucky Energy (set.json record customhb-866, from cardback).
const LUCKY_ENERGY =
  "As long as this card is attached to a Pokémon, it provides {C} Energy.\n\nIf the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if it is Knocked Out), draw 3 cards.";
// Lugia ex (set.json record customhb-872, from cardback; two printings: Elemental Blast with no damage and 180).
const SILVER_SPARKLE =
  "If Lugia ex is your Active Pokémon and is damaged by an opponent's attack (even if Lugia ex is Knocked Out), flip a coin. If heads, choose an Energy card attached to the Attacking Pokémon and return it to your opponent's hand.";
const ELEMENTAL_BLAST = 'Discard a {R} Energy, {W} Energy, and {L} Energy attached to Lugia ex.';
// Bastiodon (set.json record customhb-874, from cardback).
const ANCIENT_BULWARK =
  "As long as this Pokémon is on your Bench, prevent all damage done to each of your Pokémon by attacks from your opponent's Pokémon that have 2 or less Energy attached.";
// Bastiodon (set.json record customhb-875, from cardback).
const PRIMAL_FORTRESS =
  "Your Pokémon take 30 less damage from attacks from your opponent's Pokémon V (after applying Weakness and Resistance).";
// Archeops (set.json record customhb-881, from cardback).
const ANCIENT_WING =
  "Once during your turn, if this Pokémon is in the Active Spot, you may devolve 1 of your opponent's Evolved Pokémon by putting the highest Stage Evolution card on it into your opponent's hand.";
// Carracosta (set.json record customhb-888, from cardback).
const PRIMAL_KNOWLEDGE =
  "Attacks used by your Pokémon do 30 more damage to your opponent's Active Evolution Pokémon (before applying Weakness and Resistance).";
// Relicanth (set.json record customhb-890, from cardback).
const ANTIQUE_SEARCH =
  'Once during your turn, you may use this Ability. Search your deck for an Item that has“Antique” in its name and put it onto your Bench. Then, shuffle your deck.';
const FOSSIL_BEATDOWN = 'This attack does 20 more damage for each of your Benched Pokémon that has "Antique" in its name.';
// Shieldon (set.json record customhb-873, from cardback).
const COVERED = 'This Pokémon cannot be affected by any Special Conditions.';
// Antique Skull Fossil (corpus: out/pkmn-trainer-cards.json, Pitch Black 073), play clause only.
const ANTIQUE_FOSSIL_PLAY =
  'Play this card as if it were a 60-HP Basic {C} Pokémon. This card can’t be affected by any Special Conditions and can’t retreat. At any time during your turn, you may discard this card from play.';

let nextId = 1;
const ability = (name, text) => ({ abilities: [{ type: 'Ability', name, text }] });
const mon = (name, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name,
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 200,
    types: ['Colorless'],
    attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }],
    ...extra,
  });
const evolved = (name, from, extra = {}) => mon(name, { stage: 'Stage 1', evolvesFrom: from, ...extra });
const energy = (type, host = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo: host?.instanceId ?? null,
  });
const item = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'], type: 'Item', trainerType: 'Item', ...extra });
const gScope = (host) =>
  createCard({
    instanceId: nextId++,
    name: G_SCOPE.name,
    supertype: 'Trainer',
    subtypes: ['Pokémon Tool'],
    type: 'Pokémon Tool',
    trainerType: G_SCOPE.trainerType,
    text: G_SCOPE.effect,
    attacks: G_SCOPE.attacks.map((a) => ({ name: a.name, cost: a.cost, damage: a.damage, text: a.effect })),
    attachedTo: host.instanceId,
  });
const luckyEnergy = (host) =>
  createCard({
    instanceId: nextId++,
    name: 'Lucky Energy',
    supertype: 'Energy',
    type: 'Energy',
    subtypes: ['Special'],
    text: LUCKY_ENERGY,
    attachedTo: host.instanceId,
  });
const lugia = (damage = '') =>
  mon('Lugia ex', {
    hp: 140,
    types: ['Colorless'],
    ...ability('Silver Sparkle', SILVER_SPARKLE),
    attacks: [{ name: 'Elemental Blast', cost: ['Fire', 'Water', 'Lightning'], damage, text: ELEMENTAL_BLAST }],
  });

function game({ p1 = [], p2 = [], p1Bench = [], p2Bench = [], player = 'p1', turn = 5 } = {}) {
  const state = createGameState({ gameId: 'customhb-fossil-league', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(item(`${id} deck ${i}`));
  }
  state.players.p1.zones.active.push(...p1);
  state.players.p2.zones.active.push(...p2);
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.bench.push(...p2Bench);
  state.turn = { player, number: turn, phase: 'main' };
  return state;
}

const run = (state, type, playerId, payload, seed = 3) => applyCommand(state, { type, playerId, payload }, createRng(seed));
const attack = (state, { player = 'p1', index = 0, seed = 3 } = {}) => run(state, 'attack', player, { attackIndex: index }, seed);
const use = (state, holder, { player = 'p1', seed = 3 } = {}) =>
  run(state, 'useAbility', player, { instanceId: holder.instanceId, abilityIndex: 0 }, seed);
function resolveAll(res, pick = (pc) => pc.options.slice(0, Math.max(pc.min ?? 1, 1)).map((o) => o.instanceId)) {
  let n = 0;
  const events = [...(res?.events || [])];
  while (res && !res.error && res.state.pendingChoice && n++ < 30) {
    const pc = res.state.pendingChoice;
    res = run(res.state, 'resolveChoice', pc.player, { choiceId: pc.choiceId, selection: pick(pc) }, 4);
    events.push(...(res.events || []));
  }
  return res && { ...res, events };
}
const byId = (state, card) => {
  for (const pid of ['p1', 'p2']) {
    for (const [zone, cards] of Object.entries(state.players[pid].zones)) {
      const found = Array.isArray(cards) && cards.find((c) => c.instanceId === card.instanceId);
      if (found) return { card: found, zone, pid };
    }
  }
  return null;
};
const damageOf = (state, card) => byId(state, card)?.card.damage ?? null;
const ok = (res) => assert.equal(res.error ?? null, null, res.reason || res.error);

// ── G Scope (customhb-674) ───────────────────────────────────────────────────────────────────

test('customhb-674 G Scope: the Genesect it is attached to uses G Scope for 100 on a Benched Pokémon, no W/R', () => {
  const genesect = mon('Genesect', { types: ['Metal'] });
  const target = mon('Target', { weakness: { type: 'Metal', value: 2 } });
  const other = mon('Other');
  const state = game({
    p1: [genesect, gScope(genesect), energy('Metal', genesect), energy('Grass', genesect), energy('Water', genesect)],
    p2: [mon('Def')],
    p2Bench: [target, other],
  });
  const res = resolveAll(attack(state, { index: 1 }), (pc) => [pc.options.find((o) => o.instanceId === target.instanceId).instanceId]);
  ok(res);
  assert.equal(damageOf(res.state, target), 100);
  assert.equal(damageOf(res.state, other), 0);
  assert.equal(res.state.players.p2.zones.active[0].damage, 0);
});

test('customhb-674 G Scope: a holder not named Genesect, or one short of Energy, cannot use the attack', () => {
  const pokemon = mon('Magnezone', { types: ['Metal'] });
  const notGenesect = game({
    p1: [pokemon, gScope(pokemon), energy('Metal', pokemon), energy('Grass', pokemon), energy('Water', pokemon)],
    p2: [mon('Def')],
    p2Bench: [mon('Target')],
  });
  assert.ok(attack(notGenesect, { index: 1 }).error);
  const genesect = mon('Genesect', { types: ['Metal'] });
  const short = game({ p1: [genesect, gScope(genesect), energy('Metal', genesect), energy('Water', genesect)], p2: [mon('Def')], p2Bench: [mon('Target')] });
  assert.ok(attack(short, { index: 1 }).error);
});

// ── Lucky Energy (customhb-866) ──────────────────────────────────────────────────────────────

// Cards p2 drew during the attack and the turn hand-over: the deck it started with, less what is left.
const p2Draws = (res) => 10 - res.state.players.p2.zones.deck.length;

test('customhb-866 Lucky Energy: its Active holder damaged by an attack draws its owner 3 cards, even when Knocked Out', () => {
  for (const hp of [200, 60]) {
    const plain = mon('Holder', { hp });
    const baseline = resolveAll(attack(game({ p1: [mon('Atk')], p2: [plain], p2Bench: [mon('Spare')] })));
    ok(baseline);
    const holder = mon('Holder', { hp });
    const res = resolveAll(attack(game({ p1: [mon('Atk')], p2: [holder, luckyEnergy(holder)], p2Bench: [mon('Spare')] })));
    ok(res);
    assert.equal(p2Draws(res), p2Draws(baseline) + 3, `hp ${hp}`);
    if (hp === 60) assert.equal(byId(res.state, holder).zone, 'discard');
  }
});

test('customhb-866 Lucky Energy: provides {C}, and draws nothing when its holder is Benched', () => {
  const holder = mon('Holder', { attacks: [{ name: 'Tap', cost: ['Colorless'], damage: '10', text: '' }] });
  ok(attack(game({ p1: [holder, luckyEnergy(holder)], p2: [mon('Def')] })));
  assert.ok(attack(game({ p1: [holder], p2: [mon('Def')] })).error, 'Tap costs {C}');
  const spread = mon('Spreader', { attacks: [{ name: 'Spray', cost: [], damage: '', text: "This attack does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }] });
  const baseline = resolveAll(attack(game({ p1: [spread], p2: [mon('Def')], p2Bench: [mon('Benched')] })));
  const benched = mon('Benched');
  const res = resolveAll(attack(game({ p1: [spread], p2: [mon('Def')], p2Bench: [benched, luckyEnergy(benched)] })));
  ok(res);
  assert.equal(damageOf(res.state, benched), 20);
  assert.equal(p2Draws(res), p2Draws(baseline));
});

// ── Lugia ex (customhb-872) ──────────────────────────────────────────────────────────────────

test('customhb-872 Lugia ex Silver Sparkle: heads returns the chosen Energy card on the Attacking Pokémon to its owner’s hand', () => {
  const faces = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const holder = lugia();
    const attacker = mon('Atk');
    const fire = energy('Fire', attacker);
    const water = energy('Water', attacker);
    const state = game({ p1: [attacker, fire, water], p2: [holder] });
    const res = resolveAll(attack(state, { seed }), (pc) => [pc.options.find((o) => o.instanceId === water.instanceId)?.instanceId ?? pc.options[0].instanceId]);
    ok(res);
    const flip = res.events.find((e) => e.type === 'coinFlipped');
    assert.ok(flip, `seed ${seed}: Silver Sparkle flips`);
    faces.add(flip.face);
    const inHand = res.state.players.p1.zones.hand.map((c) => c.instanceId);
    if (flip.face === 'heads') {
      assert.deepEqual(inHand, [water.instanceId], `seed ${seed}`);
      assert.equal(byId(res.state, fire).card.attachedTo, attacker.instanceId);
    } else {
      assert.deepEqual(inHand, [], `seed ${seed}`);
    }
  }
  assert.deepEqual([...faces].sort(), ['heads', 'tails']);
});

test('customhb-872 Lugia ex Silver Sparkle: fires when Lugia ex is Knocked Out, never from the Bench', () => {
  let ko = false;
  for (let seed = 1; seed <= 12 && !ko; seed++) {
    const holder = mon('Lugia ex', { hp: 60, ...ability('Silver Sparkle', SILVER_SPARKLE) });
    const attacker = mon('Atk');
    const fire = energy('Fire', attacker);
    const state = game({ p1: [attacker, fire], p2: [holder], p2Bench: [mon('Spare')] });
    const res = resolveAll(attack(state, { seed }));
    ok(res);
    if (res.events.find((e) => e.type === 'coinFlipped')?.face !== 'heads') continue;
    assert.equal(byId(res.state, holder).zone, 'discard');
    assert.equal(byId(res.state, fire).zone, 'hand', 'the Energy is back in the attacker’s hand beside the Prizes taken');
    ko = true;
  }
  assert.ok(ko, 'a heads seed');
  const benched = lugia();
  const spread = mon('Spreader', { attacks: [{ name: 'Spray', cost: [], damage: '', text: "This attack does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }] });
  const res = resolveAll(attack(game({ p1: [spread, energy('Fire', spread)], p2: [mon('Def')], p2Bench: [benched] })));
  ok(res);
  assert.equal(res.events.some((e) => e.type === 'coinFlipped'), false);
});

for (const damage of ['', '180']) {
  test(`customhb-872 Lugia ex Elemental Blast (damage "${damage}") discards one {R}, one {W} and one {L} Energy`, () => {
    const holder = lugia(damage);
    const extraFire = energy('Fire', holder);
    const state = game({
      p1: [holder, energy('Fire', holder), extraFire, energy('Water', holder), energy('Lightning', holder)],
      p2: [mon('Def', { hp: 300 })],
    });
    const res = resolveAll(attack(state));
    ok(res);
    const left = res.state.players.p1.zones.active.filter((c) => c.attachedTo === holder.instanceId).map((c) => c.energyType);
    assert.deepEqual(left, ['Fire']);
    assert.deepEqual(res.state.players.p1.zones.discard.map((c) => c.energyType).sort(), ['Fire', 'Lightning', 'Water']);
    assert.equal(res.state.players.p2.zones.active[0].damage, damage ? 180 : 0);
  });
}

// ── Bastiodon (customhb-874, customhb-875) ───────────────────────────────────────────────────

test('customhb-874 Bastiodon Ancient Bulwark: from the Bench, prevents damage from attackers with 2 or less Energy', () => {
  const bulwark = () => mon('Bastiodon', { stage: 'Stage 2', evolvesFrom: 'Shieldon', ...ability('Ancient Bulwark', ANCIENT_BULWARK) });
  const cases = [
    { energies: 2, benched: true, expect: 0 },
    { energies: 3, benched: true, expect: 60 },
    { energies: 0, benched: true, expect: 0 },
    { energies: 2, benched: false, expect: 60 },
  ];
  for (const c of cases) {
    const attacker = mon('Atk');
    const defender = c.benched ? mon('Def') : bulwark();
    const state = game({
      p1: [attacker, ...Array.from({ length: c.energies }, () => energy('Fire', attacker))],
      p2: [defender],
      p2Bench: c.benched ? [bulwark()] : [mon('Spare')],
    });
    const res = resolveAll(attack(state));
    ok(res);
    assert.equal(damageOf(res.state, defender), c.expect, JSON.stringify(c));
  }
});

const SPRAY = "This attack does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";

test('customhb-874 Bastiodon Ancient Bulwark also covers Benched Pokémon, against an attacker with 2 or less Energy', () => {
  for (const energies of [1, 3]) {
    const benched = mon('Benched');
    const spread = mon('Spreader', { attacks: [{ name: 'Spray', cost: [], damage: '', text: SPRAY }] });
    const bastiodon = mon('Bastiodon', { stage: 'Stage 2', evolvesFrom: 'Shieldon', ...ability('Ancient Bulwark', ANCIENT_BULWARK) });
    const state = game({
      p1: [spread, ...Array.from({ length: energies }, () => energy('Fire', spread))],
      p2: [mon('Def')],
      p2Bench: [bastiodon, benched],
    });
    const res = resolveAll(attack(state));
    ok(res);
    const expect = energies <= 2 ? 0 : 20;
    assert.equal(damageOf(res.state, benched), expect, `${energies} Energy`);
    assert.equal(damageOf(res.state, bastiodon), expect, `${energies} Energy`);
  }
});

test('customhb-875 Bastiodon Primal Fortress also takes 30 off a Pokémon V’s damage to the Bench', () => {
  for (const [name, expect] of [['Zacian V', 10], ['Zacian', 40]]) {
    const benched = mon('Benched');
    const sniper = mon(name, { attacks: [{ name: 'Spray', cost: [], damage: '', text: SPRAY.replace('20', '40') }] });
    const fortress = mon('Bastiodon', { stage: 'Stage 2', evolvesFrom: 'Shieldon', ...ability('Primal Fortress', PRIMAL_FORTRESS) });
    const res = resolveAll(attack(game({ p1: [sniper], p2: [mon('Def')], p2Bench: [fortress, benched] })));
    ok(res);
    assert.equal(damageOf(res.state, benched), expect, name);
  }
});

test('customhb-875 Bastiodon Primal Fortress: 30 less damage from a Pokémon V, after Weakness; none off a non-V', () => {
  const cases = [
    { name: 'Zacian V', subtypes: ['Basic', 'V'], expect: 90 },
    { name: 'Zacian', subtypes: ['Basic'], expect: 120 },
  ];
  for (const c of cases) {
    const attacker = mon(c.name, { subtypes: c.subtypes, types: ['Fire'] });
    const defender = mon('Def', { weakness: { type: 'Fire', value: 2 } });
    const fortress = mon('Bastiodon', { stage: 'Stage 2', evolvesFrom: 'Shieldon', ...ability('Primal Fortress', PRIMAL_FORTRESS) });
    const res = resolveAll(attack(game({ p1: [attacker], p2: [defender], p2Bench: [fortress] })));
    ok(res);
    assert.equal(damageOf(res.state, defender), c.expect, c.name);
  }
});

// ── Archeops (customhb-881) ──────────────────────────────────────────────────────────────────

test('customhb-881 Archeops Ancient Wing: from the Active Spot, devolves an opponent’s Evolved Pokémon into their hand', () => {
  const archeops = mon('Archeops', { stage: 'Stage 2', evolvesFrom: 'Archen', ...ability('Ancient Wing', ANCIENT_WING) });
  const basic = mon('Charmander', { damage: 30 });
  const stage1 = evolved('Charmeleon', 'Charmander', { attachedTo: basic.instanceId });
  const state = game({ p1: [archeops], p2: [mon('Def')], p2Bench: [basic, stage1] });
  const res = resolveAll(use(state, archeops));
  ok(res);
  assert.deepEqual(res.state.players.p2.zones.hand.map((c) => c.name), ['Charmeleon']);
  assert.equal(byId(res.state, basic).zone, 'bench');
  const again = use(res.state, byId(res.state, archeops).card);
  assert.ok(again.error, 'once during your turn');
});

test('customhb-881 Archeops Ancient Wing cannot be used from the Bench', () => {
  const archeops = mon('Archeops', { stage: 'Stage 2', evolvesFrom: 'Archen', ...ability('Ancient Wing', ANCIENT_WING) });
  const basic = mon('Charmander');
  const stage1 = evolved('Charmeleon', 'Charmander', { attachedTo: basic.instanceId });
  const state = game({ p1: [mon('Act')], p1Bench: [archeops], p2: [basic, stage1] });
  assert.ok(use(state, archeops).error);
});

// ── Carracosta (customhb-888) ────────────────────────────────────────────────────────────────

test('customhb-888 Carracosta Primal Knowledge: +30 before Weakness to the opponent’s Active Evolution Pokémon only', () => {
  const cases = [
    { evolvedDefender: true, expect: (60 + 30) * 2 },
    { evolvedDefender: false, expect: 60 * 2 },
  ];
  for (const c of cases) {
    const attacker = mon('Atk', { types: ['Water'] });
    const carracosta = mon('Carracosta', { stage: 'Stage 2', evolvesFrom: 'Tirtouga', ...ability('Primal Knowledge', PRIMAL_KNOWLEDGE) });
    const base = mon('Base', { weakness: { type: 'Water', value: 2 }, hp: 300 });
    const top = evolved('Top', 'Base', { weakness: { type: 'Water', value: 2 }, hp: 300, attachedTo: base.instanceId });
    const p2 = c.evolvedDefender ? [base, top] : [base];
    const res = resolveAll(attack(game({ p1: [attacker], p1Bench: [carracosta], p2 })));
    ok(res);
    assert.equal(damageOf(res.state, base), c.expect, JSON.stringify(c));
  }
});

test('customhb-888 Carracosta Primal Knowledge does not add to damage on Benched Evolution Pokémon', () => {
  const attacker = mon('Atk', { attacks: [{ name: 'Snipe', cost: [], damage: '', text: "This attack does 40 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }] });
  const carracosta = mon('Carracosta', { stage: 'Stage 2', evolvesFrom: 'Tirtouga', ...ability('Primal Knowledge', PRIMAL_KNOWLEDGE) });
  const base = mon('Base');
  const top = evolved('Top', 'Base', { attachedTo: base.instanceId });
  const res = resolveAll(attack(game({ p1: [attacker, carracosta].slice(0, 1), p1Bench: [carracosta], p2: [mon('Def')], p2Bench: [base, top] })));
  ok(res);
  assert.equal(damageOf(res.state, base), 40);
});

// ── Relicanth (customhb-890) ─────────────────────────────────────────────────────────────────

test('customhb-890 Relicanth Antique Search puts an "Antique" Item from the deck onto the Bench, once a turn', () => {
  const relicanth = mon('Relicanth', { types: ['Water'], ...ability('Antique Search', ANTIQUE_SEARCH) });
  const state = game({ p1: [relicanth], p2: [mon('Def')] });
  const fossil = item('Antique Skull Fossil', { text: ANTIQUE_FOSSIL_PLAY });
  state.players.p1.zones.deck.push(item('Skull Fossil Lookalike'), fossil);
  const first = use(state, relicanth);
  ok(first);
  assert.deepEqual(first.state.pendingChoice?.options.map((o) => o.instanceId), [fossil.instanceId]);
  const res = resolveAll(first);
  ok(res);
  const placed = byId(res.state, fossil);
  assert.equal(placed.zone, 'bench');
  assert.equal(placed.card.supertype, 'Pokémon');
  assert.equal(res.state.players.p1.zones.deck.length, 11);
  assert.ok(use(res.state, byId(res.state, relicanth).card).error, 'once during your turn');
});

test('customhb-890 Relicanth Fossil Beatdown: 10 + 20 for each Benched Pokémon with "Antique" in its name', () => {
  const relicanth = mon('Relicanth', {
    types: ['Water'],
    attacks: [{ name: 'Fossil Beatdown', cost: ['Colorless'], damage: '10+', text: FOSSIL_BEATDOWN }],
  });
  const fossilMon = (name) => mon(name, { hp: 60 });
  const state = game({
    p1: [relicanth, energy('Water', relicanth)],
    p1Bench: [fossilMon('Antique Skull Fossil'), fossilMon('Antique Armor Fossil'), mon('Bystander')],
    p2: [mon('Def', { hp: 300 })],
  });
  const res = resolveAll(attack(state));
  ok(res);
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
});

// ── Shieldon (customhb-873) ──────────────────────────────────────────────────────────────────

test('customhb-873 Shieldon Covered: an attack’s Special Condition does not land on it', () => {
  const shieldon = mon('Shieldon', { stage: 'Stage 1', evolvesFrom: 'Unidentified Fossil', ...ability('Covered', COVERED) });
  const attacker = mon('Atk', { attacks: [{ name: 'Sting', cost: [], damage: '10', text: 'Your opponent’s Active Pokémon is now Poisoned and Confused.' }] });
  const res = resolveAll(attack(game({ p1: [attacker], p2: [shieldon] })));
  ok(res);
  const card = byId(res.state, shieldon).card;
  assert.equal(card.damage, 10);
  assert.ok(!card.specialCondition && !(card.specialConditions || []).length, JSON.stringify(card.specialConditions ?? card.specialCondition));
});

// ── What the Bench damage path reads (review of the Bastiodon change) ────────────────────────

// Flygon-GX Dusty Defense (corpus: out/pkmn-pokemon-cards.json, Cosmic Eclipse 110).
const DUSTY_DEFENSE =
  "As long as this Pokémon is your Active Pokémon, all of your Pokémon take 30 less damage from your opponent's attacks (after applying Weakness and Resistance).";
// Leavanny Blanket Weaver (corpus: out/pkmn-pokemon-cards.json, Unified Minds 9).
const BLANKET_WEAVER =
  "Your {G} Pokémon take 40 less damage from your opponent's attacks (after applying Weakness and Resistance). You can't apply more than 1 Blanket Weaver Ability at a time.";

test('"As long as this Pokémon is your Active Pokémon" shields nothing while the holder is Benched', () => {
  const flygon = mon('Flygon-GX', ability('Dusty Defense', DUSTY_DEFENSE));
  const defender = mon('Def');
  const benched = mon('Benched');
  const attacker = mon('Atk', { attacks: [{ name: 'Hit', cost: [], damage: '60', text: SPRAY }] });
  const res = resolveAll(attack(game({ p1: [attacker], p2: [defender], p2Bench: [flygon, benched] })));
  ok(res);
  assert.equal(damageOf(res.state, defender), 60);
  assert.equal(damageOf(res.state, benched), 20);
  assert.equal(damageOf(res.state, flygon), 20);
});

test('a type-qualified team shield (your {G} Pokémon) does not reach Bench damage', () => {
  const leavanny = mon('Leavanny', { types: ['Grass'], ...ability('Blanket Weaver', BLANKET_WEAVER) });
  const benched = mon('Benched', { types: ['Water'] });
  const spread = mon('Spreader', { attacks: [{ name: 'Spray', cost: [], damage: '', text: SPRAY.replace('20', '60') }] });
  const res = resolveAll(attack(game({ p1: [spread], p2: [mon('Def')], p2Bench: [leavanny, benched] })));
  ok(res);
  assert.equal(damageOf(res.state, benched), 60);
});
