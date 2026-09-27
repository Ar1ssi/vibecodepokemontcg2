// Parse-hole sweep D4: activated Abilities whose "If you do," half was dropped. Texts are the
// printed corpus rows in out/pkmn-pokemon-cards.json (set and number named per test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';

function setupGame() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'ability-if-you-do', seed: 42, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = {
      playerId,
      username: playerId,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {} },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

const mon = (instanceId, name = 'Mon', extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', ...extra });

function board(text, { zone = 'active', name = 'Holder', ownBench = [81, 82], oppBench = [91, 92] } = {}) {
  const { state, rng } = setupGame();
  const holder = mon(70, name, { hp: 200, abilities: [{ name: 'Test Ability', type: 'Ability', text }] });
  const p1 = state.players.p1.zones;
  const p2 = state.players.p2.zones;
  if (zone === 'active') p1.active.push(holder);
  else {
    p1.active.push(mon(80, 'Own Active'));
    p1.bench.push(holder);
  }
  for (const id of ownBench) p1.bench.push(mon(id, `Own ${id}`));
  p2.active.push(mon(90, 'Opp Active'));
  for (const id of oppBench) p2.bench.push(mon(id, `Opp ${id}`));
  return { state, rng };
}

const use70 = (state, rng) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
const resolveWith = (res, selection, rng) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: res.pendingChoice.player },
    rng
  );
const activeId = (res, playerId) => res.state.players[playerId].zones.active.find((c) => !c.attachedTo)?.instanceId;

// Samurott, White Flare 107.
const TORRENTIAL_WHIRLPOOL =
  "Once during your turn, you may switch your Active Pokémon with 1 of your Benched Pokémon. If you do, switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)";
// Vanilluxe, Next Destinies 33.
const SLIPPERY_SOLES =
  'Once during your turn (before your attack), you may switch your Active Pokémon with 1 of your Benched Pokémon. If you do, your opponent switches his or her Active Pokémon with 1 of his or her Benched Pokémon.';
// Mawile VSTAR, Silver Tempest 200.
const STAR_RONDO =
  "During your turn, if this Pokémon is on your Bench, you may switch it with your Active Pokémon. If you do, switch 1 of your opponent's Benched Pokémon with their Active Pokémon. (You can't use more than 1 VSTAR Power in a game.)";
// Pecharunt ex, Shrouded Fable 095.
const SUBJUGATING_CHAINS =
  "Once during your turn, you may switch 1 of your Benched {D} Pokémon, except any Pecharunt ex, with your Active Pokémon. If you do, the new Active Pokémon is now Poisoned. You can't use more than 1 Subjugating Chains Ability each turn.";

for (const [label, text] of [
  ['Samurott Torrential Whirlpool', TORRENTIAL_WHIRLPOOL],
  ['Vanilluxe Slippery Soles', SLIPPERY_SOLES],
]) {
  test(`ability: ${label} switches own Active, then the opponent picks their new Active`, () => {
    const { state, rng } = board(text);
    let res = use70(state, rng);
    assert.equal(res.pendingChoice?.player, 'p1');
    res = resolveWith(res, [82], rng);
    assert.equal(activeId(res, 'p1'), 82);
    assert.equal(res.pendingChoice?.player, 'p2');
    res = resolveWith(res, [92], rng);
    assert.equal(activeId(res, 'p2'), 92);
    assert.ok(res.state.players.p2.zones.bench.some((c) => c.instanceId === 90));
  });
}

test('ability: Samurott Torrential Whirlpool with one Benched Pokémon still switches the opponent', () => {
  const { state, rng } = board(TORRENTIAL_WHIRLPOOL, { ownBench: [81] });
  let res = use70(state, rng);
  assert.equal(activeId(res, 'p1'), 81);
  assert.equal(res.pendingChoice?.player, 'p2');
  res = resolveWith(res, [91], rng);
  assert.equal(activeId(res, 'p2'), 91);
});

test('ability: Mawile VSTAR Star Rondo moves itself up, then the player picks the opponent Active', () => {
  const { state, rng } = board(STAR_RONDO, { zone: 'bench', name: 'Mawile VSTAR' });
  let res = use70(state, rng);
  assert.equal(activeId(res, 'p1'), 70);
  assert.equal(res.pendingChoice?.player, 'p1');
  res = resolveWith(res, [91], rng);
  assert.equal(activeId(res, 'p2'), 91);
});

test('ability: Pecharunt ex Subjugating Chains brings up only a non-Pecharunt {D} Pokémon and Poisons it', () => {
  const { state, rng } = board(SUBJUGATING_CHAINS, { name: 'Pecharunt ex', ownBench: [] });
  const bench = state.players.p1.zones.bench;
  bench.push(mon(81, 'Pecharunt ex', { types: ['Darkness'] }));
  bench.push(mon(82, 'Dark Mon', { types: ['Darkness'] }));
  bench.push(mon(83, 'Grass Mon', { types: ['Grass'] }));
  const res = use70(state, rng);
  assert.equal(res.pendingChoice ?? null, null);
  assert.equal(activeId(res, 'p1'), 82);
  const active = res.state.players.p1.zones.active.find((c) => c.instanceId === 82);
  assert.ok(hasCondition(active, 'Poisoned'));
});
