// Primal Groudon-EX Gaia Volcano and the "…this attack does N more damage. [Then,] discard
// that Stadium." family (Gyarados-GX Draconic Disaster, Lugia-EX Deep Hurricane, Flygon-GX
// Desert Hurricane, Mega Hawlucha ex Somersault Dive, Hisuian Avalugg Mountain Gale,
// Tornadus VMAX Max Wind Spirit, Walrein ex Wreck): the bonus reads the in-play Stadium and
// the discard runs after damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

const GAIA_VOLCANO =
  'If there is any Stadium card in play, this attack does 100 more damage. Discard that Stadium card.';
const DESERT_HURRICANE =
  'If there is any Stadium card in play, this attack does 120 more damage. Then, discard that Stadium card.';
const SOMERSAULT_DIVE =
  'If a Stadium is in play, this attack does 140 more damage. Then, discard that Stadium.';
const WRECK =
  'If there is any Stadium card in play, this attack does 70 damage plus 20 more damage. Discard that Stadium card.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const stadium = (name = 'Artazon', ownerId = 'p2') =>
  createCard({
    instanceId: nextId++,
    ownerId,
    name,
    supertype: 'Trainer',
    subtypes: ['Stadium'],
  });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Attacker', damage = '0', attackName = 'Test Attack', setup = () => {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-stadium-discard', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const atk = mon(name, { hp: 300, attacks: [{ name: attackName, cost: [], damage, text }] });
  state.players.p1.zones.active.push(atk);
  const defender = mon('Defender', { hp: 900 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker: atk, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(5) };
}

function attack(b) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

const damageOn = (res, name) =>
  res.state.players.p2.zones.active.find((c) => c.name === name)?.damage || 0;

test('parsers: the Stadium-bonus-discard clause becomes an atkDiscardStadium step', () => {
  const after = (text) => parseAttackSteps(text).after;
  assert.deepEqual(after(GAIA_VOLCANO), [{ type: 'atkDiscardStadium', owner: 'any' }]);
  assert.deepEqual(after(DESERT_HURRICANE), [{ type: 'atkDiscardStadium', owner: 'any' }]);
  assert.deepEqual(after(SOMERSAULT_DIVE), [{ type: 'atkDiscardStadium', owner: 'any' }]);
  assert.deepEqual(after(WRECK), [{ type: 'atkDiscardStadium', owner: 'any' }]);
});

test('parseAttackDamage: the Stadium condition is read from ctx.stadiumInPlay', () => {
  const gaia = { name: 'Gaia Volcano', damage: 100, text: GAIA_VOLCANO };
  assert.equal(parseAttackDamage(gaia, {}, {}, { stadiumInPlay: true }).total, 200);
  assert.equal(parseAttackDamage(gaia, {}, {}, { stadiumInPlay: false }).total, 100);
  // No board read supplied: the bonus stays honestly unresolved, not silently applied.
  const unresolved = parseAttackDamage(gaia, {}, {}, {});
  assert.equal(unresolved.total, 100);
  assert.ok(unresolved.notes.some((note) => /conditional \+100/.test(note)));

  // "If a Stadium is in play" (modern wording) and "70 damage plus 20 more damage".
  const dive = { name: 'Somersault Dive', damage: 120, text: SOMERSAULT_DIVE };
  assert.equal(parseAttackDamage(dive, {}, {}, { stadiumInPlay: true }).total, 260);
  const wreck = { name: 'Wreck', damage: '70+', text: WRECK };
  assert.equal(parseAttackDamage(wreck, {}, {}, { stadiumInPlay: true }).total, 90);
  assert.equal(parseAttackDamage(wreck, {}, {}, { stadiumInPlay: false }).total, 70);
});

test('Gaia Volcano: +100 and the Stadium is discarded after damage', () => {
  const b = board(GAIA_VOLCANO, { name: 'Primal Groudon-EX', damage: '100+', attackName: 'Gaia Volcano' });
  b.state.stadium = stadium();
  const res = attack(b);

  assert.equal(damageOn(res, 'Defender'), 200);
  assert.equal(res.state.stadium, null);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Artazon'));
  const moved = res.events.find((e) => e.type === 'cardMoved' && e.from === 'stadium');
  assert.equal(moved?.playerId, 'p2');
});

test('Gaia Volcano: no Stadium means the printed 100 and nothing discarded', () => {
  const b = board(GAIA_VOLCANO, { name: 'Primal Groudon-EX', damage: '100+', attackName: 'Gaia Volcano' });
  const res = attack(b);

  assert.equal(damageOn(res, 'Defender'), 100);
  assert.equal(res.state.stadium, null);
  assert.equal(res.state.players.p2.zones.discard.length, 0);
});

test('Modern wording: the Stadium owned by the attacker is discarded too', () => {
  const b = board(SOMERSAULT_DIVE, { name: 'Mega Hawlucha ex', damage: '120+', attackName: 'Somersault Dive' });
  b.state.stadium = stadium('Artazon', 'p1');
  const res = attack(b);

  assert.equal(damageOn(res, 'Defender'), 260);
  assert.equal(res.state.stadium, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.name === 'Artazon'));
});
