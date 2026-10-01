// Design 062 § D: WotC attack wordings rewritten to the modern wording the parser already knows.
// Card text: out/pkmn-wotc-cards.json (pkmncards rows cited per case).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGACY_ATTACK_REWRITES, rewriteLegacyAttackWording } from '../legacy-attack-wording.mjs';
import { parseAttackSteps } from '../attack-steps.mjs';
import { normalizeAttackText } from '../attack-text.mjs';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { applyCommand } from '../../reduce.mjs';

const steps = (text, selfName) => {
  const { before, after } = parseAttackSteps(text, { selfName });
  return [...before, ...after];
};
const marker = (target, window, m, extra = {}) => [{ type: 'atkAddMarker', target, window, marker: m, ...extra }];

/** Same pre-rewrite normalization parseAttackSteps applies. */
const normalizeLikeParser = (text, selfName) =>
  normalizeAttackText(text, selfName)
    .replace(/\s*\((before|after) applying weakness and resistance\)/g, ' <wr:$1>')
    .replace(/\s*\([^)]*\)/g, '');

test('rewrite: empty input stays empty (edge case 1)', () => {
  assert.equal(rewriteLegacyAttackWording(''), '');
  assert.equal(rewriteLegacyAttackWording(undefined), '');
});

// Kakuna [Base Set 33] Stiffen
test('Kakuna Stiffen → heads-gated incomingPrevent', () => {
  const text =
    "Flip a coin. If heads, prevent all damage done to Kakuna during your opponent's next turn. (Any other effects of attacks still happen.)";
  assert.deepEqual(
    steps(text, 'Kakuna'),
    marker('self', 'opponentNextTurn', { kind: 'incomingPrevent', filter: null }, { gate: 'heads' })
  );
});

// Clefable [Jungle 1] Minimize; Brock's Dugtrio [Gym Challenge 22] Lie Low
test("Clefable Minimize and Brock's Dugtrio Lie Low → incomingReduce 20", () => {
  const expected = marker('self', 'opponentNextTurn', { kind: 'incomingReduce', amount: 20, afterWR: true, filter: null });
  const minimize =
    "All damage done by attacks to Clefable during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).";
  const lieLow =
    "All damage done to Brock's Dugtrio during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).";
  assert.deepEqual(steps(minimize, 'Clefable'), expected);
  assert.deepEqual(steps(lieLow, "Brock's Dugtrio"), expected);
});

// Onix [Base Set 56] Harden
test('Onix Harden → incomingPrevent maxDamage 30', () => {
  const text =
    "During your opponent's next turn, whenever 30 or less damage is done to Onix (after applying Weakness and Resistance), prevent that damage. (Any other effects of attacks still happen.)";
  const result = steps(text, 'Onix');
  assert.equal(result.length, 1);
  const [step] = result;
  assert.equal(step.type, 'atkAddMarker');
  assert.equal(step.target, 'self');
  assert.equal(step.window, 'opponentNextTurn');
  assert.equal(step.marker.kind, 'incomingPrevent');
  assert.equal(step.marker.maxDamage, 30);
});

// Croconaw [Neo Genesis 31] Screech
test('Croconaw Screech → incomingBonus 20 on the opponent through your next turn', () => {
  const text =
    'Until the end of your next turn, if an attack damages the Defending Pokémon (after applying Weakness and Resistance), that attack does 20 more damage to the Defending Pokémon';
  const result = steps(text, 'Croconaw');
  assert.equal(result.length, 1);
  const [step] = result;
  assert.equal(step.type, 'atkAddMarker');
  assert.equal(step.target, 'opponentActive');
  assert.equal(step.window, 'throughYourNextTurn');
  assert.equal(step.marker.kind, 'incomingBonus');
  assert.equal(step.marker.amount, 20);
  assert.equal(step.marker.afterWR, true);
});

// Psyduck [Fossil 53] Headache
test('Psyduck Headache → Trainer play lock', () => {
  assert.deepEqual(steps("Your opponent can't play Trainer cards during his or her next turn.", 'Psyduck'), [
    { type: 'atkOppPlayLock', kinds: ['trainer'] },
  ]);
});

// Ninetales [Base Set 12] Lure
test('Ninetales Lure → gust chosen by the attacker', () => {
  const text = 'If your opponent has any Benched Pokémon, choose 1 of them and switch it with his or her Active Pokémon.';
  assert.deepEqual(steps(text, 'Ninetales'), [{ type: 'atkGust', chooser: 'self' }]);
});

// Sentret [Neo Discovery 63] Scout; Mankey [Team Rocket 61] Mischief
test('Sentret Scout and Mankey Mischief', () => {
  assert.deepEqual(steps("Look at your opponent's hand.", 'Sentret'), [{ type: 'atkRevealOppHand' }]);
  assert.deepEqual(steps("Shuffle your opponent's deck.", 'Mankey'), [{ type: 'atkShuffleOppDeck' }]);
});

test('modern wordings pass through the rewrite unchanged (edge case 7)', () => {
  const modern = [
    "During your opponent's next turn, prevent all damage done to this Pokémon by attacks.",
    "During your opponent's next turn, any damage done to this Pokémon by attacks is reduced by 20.",
    "Your opponent can't play any Trainer cards from their hand during their next turn.",
    "Switch in 1 of your opponent's Benched Pokémon to the Active Spot.",
    'Your opponent reveals their hand.',
    'Have your opponent shuffle their deck.',
    'Your opponent shuffles their hand into their deck and draws 4 cards.',
  ];
  for (const text of modern) {
    const normalized = normalizeLikeParser(text, 'Mon');
    assert.equal(rewriteLegacyAttackWording(normalized), normalized, text);
  }
});

test('sweep: every WotC attack matching a rewrite parses to at least one step', () => {
  const corpusPath = fileURLToPath(new URL('../../../../out/pkmn-wotc-cards.json', import.meta.url));
  const raw = JSON.parse(readFileSync(corpusPath, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.cards;
  let matched = 0;
  const unparsed = [];
  for (const row of rows) {
    for (const block of String(row.text || '').split(/\n\n(?=[^\n]*→)/)) {
      const [header, ...rest] = block.split('\n\n');
      if (!header.includes('→')) continue;
      const effect = rest.join(' ').trim();
      if (!effect) continue;
      const normalized = normalizeLikeParser(effect, row.name);
      if (!LEGACY_ATTACK_REWRITES.some(([re]) => new RegExp(re.source).test(normalized))) continue;
      matched += 1;
      if (steps(effect, row.name).length === 0) unparsed.push(`${row.name} [${row.set} ${row.number}]: ${effect}`);
    }
  }
  assert.deepEqual(unparsed, []);
  assert.ok(matched >= 9, `matched ${matched}`);
});

function stiffenBoard() {
  // Kakuna [Base Set 33] Stiffen
  const stiffen =
    "Flip a coin. If heads, prevent all damage done to Kakuna during your opponent's next turn. (Any other effects of attacks still happen.)";
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Kakuna',
      supertype: 'Pokémon',
      type: 'Pokémon',
      hp: 80,
      types: ['Grass'],
      attacks: [{ name: 'Stiffen', cost: [], damage: '', text: stiffen }],
    })
  );
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 20,
      name: 'Foe',
      supertype: 'Pokémon',
      type: 'Pokémon',
      hp: 100,
      types: ['Colorless'],
      enteredPlayTurn: 1,
      attacks: [{ name: 'Hit', cost: [], damage: '40', text: '' }],
    })
  );
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

test('runtime: Stiffen heads prevents the next 40-damage attack', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const first = applyCommand(stiffenBoard(), { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(seed));
    assert.ok(!first.error, first.error);
    if (first.events.find((e) => e.type === 'attackCoinFlipped')?.coin !== 'heads') continue;
    const next = first.state;
    next.turn = { player: 'p2', number: 3, phase: 'main' };
    next.players.p2.flags = {};
    const second = applyCommand(next, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, createRng(seed));
    assert.ok(!second.error, second.error);
    assert.equal(second.state.players.p1.zones.active.find((c) => c.instanceId === 1).damage || 0, 0);
    return;
  }
  assert.fail('no heads seed in 1..40');
});
