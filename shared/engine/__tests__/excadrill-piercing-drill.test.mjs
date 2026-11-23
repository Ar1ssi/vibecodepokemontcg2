// Excadrill ex Piercing Drill: the Bench hit may only go to a Benched Pokémon with damage counters.
// Homebrew (customhb set.json HB 077): 60, "This attack also does 20 damage to 1 of your opponent's
// Benched Pokémon that has any damage counters on it." Printed (corpus: Black Bolt 168): 60 and 60.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const HOMEBREW = SET.cards.find((c) => c.localId === '077').attacks.find((a) => a.name === 'Piercing Drill');
const PRINTED_TEXT =
  "This attack also does 60 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it. (Don't apply Weakness and Resistance for Benched Pokémon.)";

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, types: ['Colorless'], ...extra });

function attack(text, bench) {
  const state = createGameState({ gameId: 'piercing-drill', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon('prize'));
  }
  state.players.p1.zones.active.push(
    mon('Excadrill ex', { types: ['Fighting'], attacks: [{ name: 'Piercing Drill', cost: [], damage: '60', text }] })
  );
  state.players.p2.zones.active.push(mon('Def'));
  state.players.p2.zones.bench.push(...bench);
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
}
const damageOf = (res, card) => res.state.players.p2.zones.bench.find((c) => c.instanceId === card.instanceId).damage || 0;

test('HB 077 Piercing Drill text is the one under test', () => {
  assert.equal(HOMEBREW.damage, 60);
  assert.match(HOMEBREW.effect, /20 damage to 1 of your opponent's Benched Pokémon that has any damage counters on it/);
});

test('the choice offers only damaged Benched Pokémon', () => {
  const clean = mon('Clean');
  const hurtA = mon('Hurt A', { damage: 30 });
  const hurtB = mon('Hurt B', { damage: 10 });
  const res = attack(HOMEBREW.effect, [clean, hurtA, hurtB]);
  assert.equal(res.error ?? null, null, String(res.error));
  const ids = res.state.pendingChoice.options.map((o) => o.instanceId).sort();
  assert.deepEqual(ids, [hurtA.instanceId, hurtB.instanceId].sort());
});

test('one damaged Benched Pokémon takes the 20; a clean one takes nothing', () => {
  const clean = mon('Clean');
  const hurt = mon('Hurt', { damage: 30 });
  const res = attack(HOMEBREW.effect, [clean, hurt]);
  assert.equal(res.error ?? null, null, String(res.error));
  assert.equal(damageOf(res, hurt), 50);
  assert.equal(damageOf(res, clean), 0);
  assert.equal(res.state.players.p2.zones.active[0].damage, 60);
});

test('no damaged Benched Pokémon: only the Active is hit', () => {
  const clean = mon('Clean');
  const res = attack(HOMEBREW.effect, [clean]);
  assert.equal(res.error ?? null, null, String(res.error));
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res, clean), 0);
  assert.equal(res.state.players.p2.zones.active[0].damage, 60);
});

test('printed Black Bolt wording: same restriction, 60 to the damaged one', () => {
  const clean = mon('Clean');
  const hurt = mon('Hurt', { damage: 10 });
  const res = attack(PRINTED_TEXT, [clean, hurt]);
  assert.equal(damageOf(res, hurt), 70);
  assert.equal(damageOf(res, clean), 0);
});
