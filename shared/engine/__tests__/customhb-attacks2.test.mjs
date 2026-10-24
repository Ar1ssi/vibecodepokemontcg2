// Homebrew set customhb (client/src/assets/custom-sets/customhb/set.json): second batch of attack
// texts the engine ran partly or not at all. Each test names the card by its HB number; the text
// is the set.json effect, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { stampActivePromotions } from '../reduce/knockout.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });
const energy = (type, attachedTo = null, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
    ...extra,
  });

/** p1 attacks with `text`; `setup(state, { attacker, defender })` adds anything else to the board. */
function board(name, text, { damage = '', setup = () => {}, attackerExtra = {}, defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }], ...attackerExtra });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}

const attack = (state, seed = 3) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
const attackWith = (state, attackIndex, playerId = 'p1', seed = 3) =>
  applyCommand(state, { type: 'attack', playerId, payload: { attackIndex } }, createRng(seed));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(4)
  );
const ids = (cards) => cards.map((c) => c.instanceId);
const zone = (state, pid, name) => state.players[pid].zones[name];

const damageOf = (res) => res.state.players.p2.zones.active.find((c) => !c.attachedTo)?.damage ?? 0;
const attachedTo = (state, pid, host) =>
  [...zone(state, pid, 'active'), ...zone(state, pid, 'bench')].filter((c) => c.attachedTo === host.instanceId);

// ── HB 040 Garchomp ex Scale Shot ───────────────────────────────────────────────────────────

const SCALE_SHOT =
  'Flip 4 coins. This attack does 20 damage for each heads. If all of them are heads, attach a Basic Energy card from your discard pile to this Pokémon.';

test('HB 040 Garchomp ex Scale Shot attaches a Basic Energy from the discard only when all four coins are heads', () => {
  const headsSeen = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const { state, attacker } = board('Garchomp ex', SCALE_SHOT, {
      damage: '20×',
      setup: (s) => s.players.p1.zones.discard.push(energy('Fire')),
    });
    const res = attack(state, seed);
    assert.equal(res.error, null);
    const pending = res.state.pendingChoice ? choose(res, [res.state.pendingChoice.options[0].instanceId]) : res;
    const heads = damageOf(res) / 20;
    headsSeen.add(heads);
    assert.equal(attachedTo(pending.state, 'p1', attacker).length, heads === 4 ? 1 : 0, `${heads} heads`);
  }
  assert.ok(headsSeen.has(4) && headsSeen.size >= 3, 'the coins vary across seeds, so the all-heads case is tested');
});

test('HB 040 Garchomp ex Scale Shot with no Basic Energy in the discard does its damage and nothing more', () => {
  const { state, attacker } = board('Garchomp ex', SCALE_SHOT, { damage: '20×' });
  for (let seed = 1; seed <= 80; seed++) {
    const res = attack(state, seed);
    assert.equal(res.error, null);
    assert.equal(attachedTo(res.state, 'p1', attacker).length, 0);
  }
});

// ── HB 168 Alakazam Card Trick ───────────────────────────────────────────────────────────────

const CARD_TRICK = "For each {P} Energy attached to this Pokémon, discard 1 card from your opponent's hand";

test('HB 168 Alakazam Card Trick makes the opponent discard one card per {P} Energy on it', () => {
  const { state, attacker } = board('Alakazam', CARD_TRICK, {
    damage: '40',
    setup: (s, { attacker: a }) => {
      s.players.p1.zones.active.push(energy('Psychic', a.instanceId), energy('Psychic', a.instanceId), energy('Fire', a.instanceId));
      s.players.p2.zones.hand.push(trainer('Hand A', 'Item'), trainer('Hand B', 'Item'), trainer('Hand C', 'Item'));
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'the opponent picks the cards');
  assert.equal(res.state.pendingChoice.player, 'p2');
  const done = choose(res, ids(zone(res.state, 'p2', 'hand')).slice(0, 2));
  // 3 cards - 2 discarded, then the opponent draws 1 at the start of their turn.
  assert.equal(zone(done.state, 'p2', 'hand').length, 2, 'two {P} Energy, two cards');
  assert.equal(zone(done.state, 'p2', 'discard').length, 2);
  assert.equal(damageOf(done), 40);
  assert.equal(attachedTo(done.state, 'p1', attacker).length, 3);
});

test('HB 168 Alakazam Card Trick with no {P} Energy attached discards nothing', () => {
  const { state } = board('Alakazam', CARD_TRICK, {
    damage: '40',
    setup: (s, { attacker: a }) => {
      s.players.p1.zones.active.push(energy('Fire', a.instanceId));
      s.players.p2.zones.hand.push(trainer('Hand A', 'Item'), trainer('Hand B', 'Item'));
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
  // 2 cards, nothing discarded, then the opponent draws 1 at the start of their turn.
  assert.equal(zone(res.state, 'p2', 'hand').length, 3);
  assert.equal(zone(res.state, 'p2', 'discard').length, 0);
});

// ── HB 176 Klefki Return Keys ────────────────────────────────────────────────────────────────

const RETURN_KEYS =
  'Move all attached Energy and Pokémon Tools from this Pokémon to 1 of your Benched Pokémon. Then, discard this Pokémon.';

test('HB 176 Klefki Return Keys moves its Energy and Tool to a chosen Benched Pokémon, then discards Klefki', () => {
  let friend;
  let other;
  const { state, attacker } = board('Klefki', RETURN_KEYS, {
    damage: '20',
    setup: (s, { attacker: a }) => {
      friend = mon('Friend');
      other = mon('Other');
      s.players.p1.zones.bench.push(friend, other);
      s.players.p1.zones.active.push(energy('Water', a.instanceId), trainer('Choice Band', 'Pokémon Tool', { attachedTo: a.instanceId }));
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'choose the Benched Pokémon');
  const done = choose(res, [friend.instanceId]);
  assert.deepEqual(
    attachedTo(done.state, 'p1', friend).map((c) => c.name).sort(),
    ['Basic Water Energy', 'Choice Band']
  );
  assert.equal(attachedTo(done.state, 'p1', other).length, 0);
  assert.ok(zone(done.state, 'p1', 'discard').some((c) => c.instanceId === attacker.instanceId), 'Klefki is discarded');
  assert.equal(zone(done.state, 'p1', 'active').some((c) => c.instanceId === attacker.instanceId), false);
  assert.equal(zone(done.state, 'p1', 'prizes').length, 6, 'a discard is not a Knock Out: no Prize cards');
  assert.equal(zone(done.state, 'p2', 'prizes').length, 6);
  assert.equal(damageOf(done), 20, 'the attack still does its damage first');
});

test('HB 176 Klefki Return Keys with no Benched Pokémon moves nothing and is not discarded', () => {
  const { state, attacker } = board('Klefki', RETURN_KEYS, {
    damage: '20',
    setup: (s, { attacker: a }) => s.players.p1.zones.active.push(energy('Water', a.instanceId)),
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(zone(res.state, 'p1', 'active').some((c) => c.instanceId === attacker.instanceId), 'Klefki stays Active');
  assert.equal(attachedTo(res.state, 'p1', attacker).length, 1);
});

// ── HB 179 Cofagrigus Law of the Underworld ─────────────────────────────────────────────────

const LAW_OF_THE_UNDERWORLD =
  "Put 6 damage counters on each Pokémon that has an Ability (both yours and your opponent's).";
const withAbility = (name, extra = {}) =>
  mon(name, { abilities: [{ name: 'Some Ability', text: 'Ability text.', type: 'Ability' }], ...extra });

test('HB 179 Cofagrigus Law of the Underworld puts 6 counters on every Pokémon with an Ability, both sides', () => {
  let oppBenchAbility;
  let oppBenchPlain;
  let ownBenchAbility;
  let ownBenchPlain;
  const { state, attacker, defender } = board('Cofagrigus', LAW_OF_THE_UNDERWORLD, {
    attackerExtra: { abilities: [{ name: 'Some Ability', text: 'Ability text.', type: 'Ability' }] },
    defenderExtra: { abilities: [{ name: 'Some Ability', text: 'Ability text.', type: 'Ability' }] },
    setup: (s) => {
      oppBenchAbility = withAbility('Foe Ability', { hp: 50 });
      oppBenchPlain = mon('Foe Plain', { hp: 300 });
      ownBenchAbility = withAbility('My Ability', { hp: 300 });
      ownBenchPlain = mon('My Plain', { hp: 300 });
      s.players.p2.zones.bench.push(oppBenchAbility, oppBenchPlain);
      s.players.p1.zones.bench.push(ownBenchAbility, ownBenchPlain);
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  const onBoard = (pid, zoneName, card) => zone(res.state, pid, zoneName).find((c) => c.instanceId === card.instanceId);
  assert.equal(onBoard('p1', 'active', attacker).damage, 60, 'my Pokémon with an Ability');
  assert.equal(onBoard('p2', 'active', defender).damage, 60, 'the opposing Active with an Ability');
  assert.equal(onBoard('p1', 'bench', ownBenchAbility).damage, 60);
  assert.equal(onBoard('p1', 'bench', ownBenchPlain).damage ?? 0, 0, 'no Ability, no counters');
  assert.equal(onBoard('p2', 'bench', oppBenchPlain).damage ?? 0, 0, 'no Ability, no counters');
  assert.equal(zone(res.state, 'p2', 'bench').some((c) => c.instanceId === oppBenchAbility.instanceId), false, 'the 50 HP Ability Pokémon is Knocked Out');
  // The Knock Out raises the prize picker for me; take the first offered Prize.
  assert.equal(res.state.pendingChoice?.player, 'p1', 'I take the Prize for it');
  const prized = choose(res, ids(res.state.pendingChoice.options.slice(0, res.state.pendingChoice.min)));
  assert.equal(zone(prized.state, 'p1', 'prizes').length, 5);
});

// ── HB 214 Quagsire Drenched Headbutt ───────────────────────────────────────────────────────

const DRENCHED_HEADBUTT =
  'Discard up to the top 3 cards of your deck, and this attack does 80 damage for each card you discarded in this way.';

test('HB 214 Quagsire Drenched Headbutt does 80 per card discarded from the top 3, with no printed 50 added', () => {
  const { state } = board('Quagsire', DRENCHED_HEADBUTT, { damage: '50×' });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'how many cards to discard');
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.instanceId), [1, 2, 3, 4], 'up to 3, from 0');
  const done = choose(res, [4]);
  assert.equal(zone(done.state, 'p1', 'discard').length, 3);
  assert.equal(zone(done.state, 'p1', 'deck').length, 7);
  assert.equal(damageOf(done), 240);
});

test('HB 214 Quagsire Drenched Headbutt discarding none does no damage', () => {
  const { state } = board('Quagsire', DRENCHED_HEADBUTT, { damage: '50×' });
  const done = choose(attack(state), [1]);
  assert.equal(zone(done.state, 'p1', 'discard').length, 0);
  assert.equal(damageOf(done), 0);
});

// ── HB 247 Weavile Ransack ───────────────────────────────────────────────────────────────────

const RANSACK =
  "Flip 2 coins. If either of them is heads, your opponent reveals their hand. For each heads, choose a card you find there and put it on the bottom of your opponent's deck in any order.";

test('HB 247 Weavile Ransack puts one chosen revealed card per heads on the bottom of the opponent deck', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const { state } = board('Weavile', RANSACK, {
      setup: (s) => {
        s.players.p2.zones.hand.push(trainer('Hand A', 'Item'), trainer('Hand B', 'Item'), trainer('Hand C', 'Item'));
      },
    });
    const deckBefore = zone(state, 'p2', 'deck').map((c) => c.name);
    const res = attack(state, seed);
    assert.equal(res.error, null);
    if (!res.state.pendingChoice) {
      outcomes.add(0);
      // Nothing moves; the opponent then draws 1 at the start of their turn.
      assert.equal(zone(res.state, 'p2', 'hand').length, 4, 'no heads: nothing moves');
      assert.deepEqual(zone(res.state, 'p2', 'deck').map((c) => c.name), deckBefore.slice(1));
      continue;
    }
    const heads = res.state.pendingChoice.max;
    outcomes.add(heads);
    assert.equal(res.state.pendingChoice.player, 'p1', 'I pick the cards');
    const picked = res.state.pendingChoice.options.slice(0, heads);
    const done = choose(res, ids(picked));
    const deck = zone(done.state, 'p2', 'deck').map((c) => c.name);
    assert.deepEqual(deck.slice(-heads), picked.map((c) => c.name), `${heads} heads: picks at the bottom`);
    // The revealed hand loses `heads` cards; the opponent then draws 1 at the start of their turn.
    assert.equal(zone(done.state, 'p2', 'hand').length, 3 - heads + 1);
    assert.equal(deck.length, deckBefore.length + heads - 1);
  }
  assert.ok(outcomes.has(0) && (outcomes.has(1) || outcomes.has(2)), 'both the no-heads and heads outcomes occur');
});

// ── HB 124 Dragapult Dragon Launcher ────────────────────────────────────────────────────────

const DRAGON_LAUNCHER =
  "Discard a number of your Benched Dreepy up to the number of your opponent's Pokémon in play. Then, for each Dreepy you discarded in this way, choose 1 of your opponent's Pokémon and do 100 damage to it. You can't choose the same Pokémon more than once. This damage isn't affected by Weakness or Resistance.";

test('HB 124 Dragapult Dragon Launcher discards two Benched Dreepy and does 100 to two different opposing Pokémon', () => {
  let dreepyA;
  let dreepyB;
  let benchOther;
  let oppA;
  let oppB;
  const { state } = board('Dragapult', DRAGON_LAUNCHER, {
    setup: (s) => {
      dreepyA = mon('Dreepy');
      dreepyB = mon('Dreepy');
      benchOther = mon('Other Bench');
      s.players.p1.zones.bench.push(dreepyA, dreepyB, benchOther);
      oppA = mon('Foe A', { hp: 300 });
      oppB = mon('Foe B', { hp: 300 });
      s.players.p2.zones.bench.push(oppA, oppB);
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  const chosenDreepy = choose(res, ids([dreepyA, dreepyB]));
  assert.ok(chosenDreepy.state.pendingChoice, 'first target');
  assert.equal(zone(chosenDreepy.state, 'p1', 'discard').filter((c) => c.name === 'Dreepy').length, 2);
  assert.equal(zone(chosenDreepy.state, 'p1', 'bench').length, 1, 'the unchosen Bench Pokémon stays');
  const firstPick = choose(chosenDreepy, [oppA.instanceId]);
  assert.ok(firstPick.state.pendingChoice, 'second target');
  assert.equal(
    firstPick.state.pendingChoice.options.some((o) => o.instanceId === oppA.instanceId),
    false,
    'the same Pokémon cannot be chosen twice'
  );
  const done = choose(firstPick, [oppB.instanceId]);
  assert.equal(done.state.pendingChoice ?? null, null);
  const damaged = (card) => zone(done.state, 'p2', 'bench').find((c) => c.instanceId === card.instanceId)?.damage ?? 0;
  assert.equal(damaged(oppA), 100);
  assert.equal(damaged(oppB), 100);
  assert.equal(damageOf(done), 0, 'the Active Pokémon was not chosen');
});

test('HB 124 Dragapult Dragon Launcher ignores Weakness on the chosen Pokémon', () => {
  let dreepy;
  let foe;
  const { state } = board('Dragapult', DRAGON_LAUNCHER, {
    attackerExtra: { types: ['Psychic'] },
    setup: (s) => {
      dreepy = mon('Dreepy');
      s.players.p1.zones.bench.push(dreepy);
      foe = mon('Weak Foe', { hp: 300, weakness: { type: 'Psychic', value: 2 } });
      s.players.p2.zones.bench.push(foe);
    },
  });
  const res = attack(state);
  const first = choose(res, [dreepy.instanceId]);
  const done = choose(first, [foe.instanceId]);
  assert.equal(zone(done.state, 'p2', 'bench').find((c) => c.instanceId === foe.instanceId).damage, 100);
});

test('HB 124 Dragapult Dragon Launcher with no Benched Dreepy does nothing', () => {
  const { state } = board('Dragapult', DRAGON_LAUNCHER, {
    setup: (s) => s.players.p2.zones.bench.push(mon('Foe', { hp: 300 })),
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.pendingChoice ?? null, null);
  assert.equal(zone(res.state, 'p2', 'bench')[0].damage ?? 0, 0);
});

// ── HB 114 Galarian Zapdos ex Bulk Up ───────────────────────────────────────────────────────

const BULK_UP =
  "As long as this Pokémon remains in the Active Spot, its attacks do 30 more damage and it takes 30 less damage. This effect doesn't stack.";
const zapdosAttacks = [
  { name: 'Bulk Up', cost: [], damage: '', text: BULK_UP },
  { name: 'Hit', cost: [], damage: '60', text: '' },
];

test('HB 114 Galarian Zapdos ex Bulk Up adds 30 to its attacks once, however often it is used', () => {
  const { state } = board('Galarian Zapdos ex', BULK_UP, { attackerExtra: { attacks: zapdosAttacks } });
  // Each new turn clears the per-turn attack flag, as the turn reducer does.
  const nextTurn = (s, number) => ({
    ...s,
    turn: { player: 'p1', number, phase: 'main' },
    players: { ...s.players, p1: { ...s.players.p1, flags: { ...s.players.p1.flags, attackerAttacked: false } } },
  });
  let res = attackWith(state, 0);
  assert.equal(res.error, null);
  res = attackWith(nextTurn(res.state, 7), 0);
  assert.equal(res.error, null);
  res = attackWith(nextTurn(res.state, 9), 1);
  assert.equal(res.error, null);
  assert.equal(damageOf(res), 90, '60 + 30, the second Bulk Up adds nothing');
});

test('HB 114 Galarian Zapdos ex Bulk Up takes 30 less damage while Active', () => {
  const { state, attacker } = board('Galarian Zapdos ex', BULK_UP, {
    attackerExtra: { attacks: zapdosAttacks },
    defenderExtra: { attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }] },
  });
  const bulked = attackWith(state, 0);
  assert.equal(bulked.error, null);
  const hitBack = attackWith({ ...bulked.state, turn: { player: 'p2', number: 6, phase: 'main' } }, 0, 'p2');
  assert.equal(hitBack.error, null);
  const zapdos = zone(hitBack.state, 'p1', 'active').find((c) => c.instanceId === attacker.instanceId);
  assert.equal(zapdos.damage, 30, '60 - 30');
});

test('HB 114 Galarian Zapdos ex Bulk Up ends when it leaves the Active Spot', () => {
  const { state, attacker } = board('Galarian Zapdos ex', BULK_UP, { attackerExtra: { attacks: zapdosAttacks } });
  const bulked = attackWith(state, 0);
  const prev = structuredClone(bulked.state);
  const next = structuredClone(bulked.state);
  const zap = next.players.p1.zones.active.find((c) => c.instanceId === attacker.instanceId);
  assert.ok(zap.attackMarkers.some((m) => m.whileActive), 'Bulk Up is in force while Active');
  next.players.p1.zones.active = next.players.p1.zones.active.filter((c) => c !== zap);
  next.players.p1.zones.bench.push(zap);
  stampActivePromotions(prev, next);
  assert.equal(zap.attackMarkers.some((m) => m.whileActive), false, 'it ends when Zapdos leaves the Active Spot');
});

test('only Bulk Up’s "remains in the Active Spot" marker follows an evolution (Spider Web keeps its evolve clear)', async () => {
  const { parseAttackSteps } = await import('../rules/attack-steps.mjs');
  const markerOf = (text) => parseAttackSteps(text).after.find((s) => s.type === 'atkAddMarker');
  const bulkUp = markerOf("As long as this Pokémon remains in the Active Spot, its attacks do 30 more damage and it takes 30 less damage. This effect doesn't stack.");
  assert.equal(bulkUp.presence, true);
  const web = markerOf("The Defending Pokémon can't attack. (Benching or evolving that Pokémon ends this effect.)") ??
    markerOf("Your opponent's Active Pokémon can't retreat.");
  assert.ok(!web?.presence, 'a no-window lock keeps the top-card tracking');
});
