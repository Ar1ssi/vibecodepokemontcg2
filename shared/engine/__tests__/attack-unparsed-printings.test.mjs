// The last design-031 printings the server did not run (design 033, I119): deck-reveal and
// shuffle-to-scale damage, hand-discard chosen-target damage, timed markers from older
// wordings, attack locks, hand swaps, and looking at the opponent's deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import {
  attackTargetClause,
  deckRevealScaling,
  discardEnergyScaling,
} from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type = 'Fire') =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
  });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(
  text,
  { name = 'Attacker', damage = '0', attackName = 'Test Attack', attacker = {}, setup = () => {}, seed = 5, rules = false } = {}
) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-i119', seed, rulesEnabled: rules });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const atk = mon(name, { hp: 300, attacks: [{ name: attackName, cost: [], damage, text }], ...attacker });
  state.players.p1.zones.active.push(atk);
  const defender = mon('Defender', { hp: 900 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker: atk, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b, attackIndex = 0) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

function choose(res, selection, rng) {
  const next = applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      playerId: res.state.pendingChoice.player,
      payload: { choiceId: res.state.pendingChoice.choiceId, selection },
    },
    rng
  );
  assert.equal(next.error, null);
  return next;
}

const zone = (res, pid, name) => res.state.players[pid].zones[name];
const find = (res, pid, zoneName, name) => zone(res, pid, zoneName).find((c) => c.name === name);
const damageOn = (res, pid, zoneName, name) => find(res, pid, zoneName, name)?.damage || 0;
const optionNames = (res) => res.state.pendingChoice.options.map((o) => o.name);

// ── slice 1: damage path ────────────────────────────────────────────────────

const MUD_FLOOD =
  'Reveal the top 4 cards of your deck. This attack does 40 more damage for each {W} Energy you find there. Shuffle the revealed cards back into your deck.';
const ROCKET_SPLASH =
  'Shuffle any amount of {W} Energy from your Pokémon into your deck. This attack does 60 damage for each card you shuffled into your deck in this way.';
const VOLTAGE_SHOOT =
  "Discard 2 {L} Energy cards from your hand and choose 1 of your opponent's Pokémon. This attack does 80 to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";

test('parsers: Mud Flood reveal, Rocket Splash shuffle, Voltage Shoot target and hand discard', () => {
  assert.deepEqual(deckRevealScaling(MUD_FLOOD), {
    count: 4,
    perUnit: 40,
    filter: { kind: 'energy', energyType: 'Water', basicOnly: false, name: null },
  });
  assert.equal(deckRevealScaling('Reveal the top 4 cards of your deck.'), null);
  assert.deepEqual(discardEnergyScaling(ROCKET_SPLASH), {
    max: Infinity,
    source: 'all',
    energyType: 'Water',
    basicOnly: false,
    destination: 'deck',
  });
  assert.deepEqual(attackTargetClause(VOLTAGE_SHOOT), { kind: 'damage', amount: 80, count: 1, scope: 'any' });
  assert.deepEqual(parseAttackSteps(VOLTAGE_SHOOT).before, [
    { type: 'atkDiscardHandEnergy', count: 2, energyType: 'L' },
  ]);
  // Conditional hand discards ("If you do, …") stay unread.
  assert.deepEqual(parseAttackSteps('Discard a {R} Energy card from your hand. If you do, draw 3 cards.').before, []);
});

test('Mud Flood: 40 more for each {W} Energy among the top 4, then the deck is shuffled', () => {
  const b = board(MUD_FLOOD, {
    name: 'Swampert-EX',
    damage: '40+',
    setup: ({ p1 }) => p1.zones.deck.unshift(energy('Water'), mon('filler'), energy('Water'), energy('Fire')),
  });
  const res = attack(b);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 120);
  const revealed = res.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(revealed.cards.length, 4);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
  assert.equal(zone(res, 'p1', 'deck').length + zone(res, 'p1', 'hand').length, 14);
});

test('Mud Flood: a short deck reveals what is there; an empty deck leaves the base', () => {
  const short = board(MUD_FLOOD, {
    damage: '40+',
    setup: ({ p1 }) => p1.zones.deck.splice(0, p1.zones.deck.length, energy('Water'), mon('filler')),
  });
  assert.equal(damageOn(attack(short), 'p2', 'active', 'Defender'), 80);
  const empty = board(MUD_FLOOD, { damage: '40+', setup: ({ p1 }) => p1.zones.deck.splice(0) });
  const res = attack(empty);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 40);
  assert.ok(!res.events.some((e) => e.type === 'cardsRevealed'));
});

function rocketSplashBoard() {
  return board(ROCKET_SPLASH, {
    name: 'Blastoise-GX',
    damage: '60×',
    setup: ({ p1, attacker }) => {
      const bench = mon('Benched Buddy');
      p1.zones.bench.push(bench);
      for (const [host, e] of [[attacker, energy('Water')], [bench, energy('Water')], [attacker, energy('Fire')]]) {
        e.attachedTo = host.instanceId;
        (host === attacker ? p1.zones.active : p1.zones.bench).push(e);
      }
    },
  });
}

test('Rocket Splash: the chosen {W} Energy from any of your Pokémon go into the deck, 60 each', () => {
  const b = rocketSplashBoard();
  const asked = attack(b);
  assert.match(asked.state.pendingChoice.prompt, /shuffle into your deck/);
  assert.deepEqual(optionNames(asked), ['Basic Water Energy', 'Basic Water Energy']);
  const res = choose(asked, asked.state.pendingChoice.options.map((o) => o.instanceId), b.rng);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 120);
  assert.equal(zone(res, 'p1', 'deck').filter((c) => c.name === 'Basic Water Energy').length, 2);
  assert.equal(zone(res, 'p1', 'discard').length, 0);
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('Rocket Splash: shuffling no Energy does no damage and moves nothing', () => {
  const b = rocketSplashBoard();
  const res = choose(attack(b), [], b.rng);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 0);
  assert.equal(zone(res, 'p1', 'active').filter((c) => c.name === 'Basic Water Energy').length, 1);
});

function voltageBoard(handEnergy, rules = false) {
  return board(VOLTAGE_SHOOT, {
    name: 'Raichu LV.X',
    attackName: 'Voltage Shoot',
    attacker: { types: ['Lightning'] },
    rules,
    setup: ({ p1, p2 }) => {
      p1.zones.hand.push(...handEnergy());
      p2.zones.bench.push(mon('Benched Target', { hp: 300 }));
    },
  });
}

test('Voltage Shoot: discards 2 {L} Energy cards from the hand, then 80 to the chosen Pokémon', () => {
  const b = voltageBoard(() => [energy('Lightning'), energy('Lightning'), energy('Lightning'), energy('Fire')]);
  const pickDiscard = attack(b);
  assert.deepEqual(optionNames(pickDiscard), ['Basic Lightning Energy', 'Basic Lightning Energy', 'Basic Lightning Energy']);
  const ids = pickDiscard.state.pendingChoice.options.slice(0, 2).map((o) => o.instanceId);
  const pickTarget = choose(pickDiscard, ids, b.rng);
  assert.equal(zone(pickTarget, 'p1', 'discard').length, 2);
  assert.match(pickTarget.state.pendingChoice.prompt, /Choose 1 of your opponent's Pokémon/);
  const target = pickTarget.state.pendingChoice.options.find((o) => o.name === 'Benched Target');
  const res = choose(pickTarget, [target.instanceId], b.rng);
  assert.equal(damageOn(res, 'p2', 'bench', 'Benched Target'), 80);
  assert.equal(damageOn(res, 'p2', 'active', 'Defender'), 0);
  assert.deepEqual(zone(res, 'p1', 'hand').map((c) => c.name).sort(), ['Basic Fire Energy', 'Basic Lightning Energy']);
});

test('Voltage Shoot: refused with fewer than 2 {L} Energy cards in hand', () => {
  const b = voltageBoard(() => [energy('Lightning'), energy('Fire')], true);
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.match(String(res.error), /Energy card\(s\) in your hand/);
});
