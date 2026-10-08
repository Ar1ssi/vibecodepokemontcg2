// Parse-hole sweep D4: activated Abilities whose "If you do," half was dropped. Texts are the
// printed corpus rows in out/pkmn-pokemon-cards.json (set and number named per test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';
import { isEvolvePlayedTrigger } from '../rules/ability-executors.mjs';

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

// Mabosstiff, Paldean Fates 063 (also Scarlet & Violet 137).
const INTIMIDATING_HOWL =
  "Once during your turn, you may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)";
// Shinx, Paldea Evolved 068.
const BIG_ROAR =
  "Once during your turn, if this Pokémon is in the Active Spot, you may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)";
// Iron Bundle, Paradox Rift 056.
const HYPER_BLOWER =
  "Once during your turn, if this Pokémon is on your Bench, you may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.) If you do, discard this Pokémon and all attached cards.";

test('ability: Mabosstiff Intimidating Howl switches out the opponent Active and leaves the own Active', () => {
  const { state, rng } = board(INTIMIDATING_HOWL, { zone: 'bench', name: 'Mabosstiff' });
  let res = use70(state, rng);
  assert.equal(res.pendingChoice?.player, 'p2');
  res = resolveWith(res, [92], rng);
  assert.equal(activeId(res, 'p2'), 92);
  assert.equal(activeId(res, 'p1'), 80);
});

test('ability: Shinx Big Roar works from the Active Spot and is refused from the Bench', () => {
  const active = board(BIG_ROAR, { name: 'Shinx', oppBench: [91] });
  const res = use70(active.state, active.rng);
  assert.equal(activeId(res, 'p2'), 91);
  assert.equal(activeId(res, 'p1'), 70);
  const benched = board(BIG_ROAR, { zone: 'bench', name: 'Shinx' });
  assert.ok(use70(benched.state, benched.rng).error);
});

test('ability: Iron Bundle Hyper Blower switches out the opponent Active, then discards itself', () => {
  const { state, rng } = board(HYPER_BLOWER, { zone: 'bench', name: 'Iron Bundle', oppBench: [91] });
  state.players.p1.zones.bench.push(energy(60, 'Water', { attachedTo: 70 }));
  const res = use70(state, rng);
  assert.equal(activeId(res, 'p2'), 91);
  assert.equal(activeId(res, 'p1'), 80);
  assert.equal(zoneOf(res, 'p1', 70), 'discard');
  assert.equal(zoneOf(res, 'p1', 60), 'discard');
});

test('ability: Iron Bundle Hyper Blower with no opponent Bench stays in play', () => {
  const { state, rng } = board(HYPER_BLOWER, { zone: 'bench', name: 'Iron Bundle', oppBench: [] });
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'bench');
  assert.equal(activeId(res, 'p2'), 90);
});

// ── costs and self-leaving halves ────────────────────────────────────────

const energy = (instanceId, type, extra = {}) =>
  createCard({ instanceId, name: `${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type], ...extra });
const specialEnergy = (instanceId, extra = {}) =>
  createCard({ instanceId, name: 'Double Colorless Energy', supertype: 'Energy', subtypes: ['Special'], ...extra });
const zoneOf = (res, playerId, id) =>
  Object.entries(res.state.players[playerId].zones).find(([, cards]) =>
    Array.isArray(cards) && cards.some((c) => c.instanceId === id)
  )?.[0];
const holderCard = (res) => res.state.players.p1.zones.active.find((c) => c.instanceId === 70);
// Resolves p1's choices by picking `pick(options)` (default: the first `min` options).
function resolveAll(res, rng, pick = (choice) => choice.options.slice(0, Math.max(1, choice.min))) {
  let out = res;
  for (let guard = 0; out.pendingChoice && out.pendingChoice.player === 'p1' && guard < 12; guard++) {
    out = resolveWith(out, pick(out.pendingChoice).map((o) => o.instanceId), rng);
  }
  return out;
}

// Goodra, Flashfire 74.
const GOOEY_REGENERATION =
  'As often as you like during your turn (before your attack), you may discard an Energy attached to this Pokémon. If you do, heal 60 damage from this Pokémon.';
// Porygon-Z-GX, Sun & Moon Promos SM216.
const TROUBLESHOOTING =
  'Once during your turn (before your attack), you may discard a Special Energy from this Pokémon. If you do, heal 80 damage from it.';

test('ability: Goodra Gooey Regeneration discards an attached Energy, then heals 60', () => {
  const { state, rng } = board(GOOEY_REGENERATION);
  state.players.p1.zones.active[0].damage = 90;
  state.players.p1.zones.active.push(energy(60, 'Water', { attachedTo: 70 }));
  const res = resolveAll(use70(state, rng), rng);
  assert.equal(zoneOf(res, 'p1', 60), 'discard');
  assert.equal(holderCard(res).damage, 30);
});

test('ability: Goodra Gooey Regeneration with no Energy attached heals nothing', () => {
  const { state, rng } = board(GOOEY_REGENERATION);
  state.players.p1.zones.active[0].damage = 90;
  const res = use70(state, rng);
  assert.equal(holderCard(res).damage, 90);
});

test('ability: Porygon-Z-GX Troubleshooting pays only with a Special Energy', () => {
  const basicOnly = board(TROUBLESHOOTING);
  basicOnly.state.players.p1.zones.active[0].damage = 100;
  basicOnly.state.players.p1.zones.active.push(energy(60, 'Colorless', { attachedTo: 70 }));
  assert.equal(holderCard(use70(basicOnly.state, basicOnly.rng)).damage, 100);

  const { state, rng } = board(TROUBLESHOOTING);
  state.players.p1.zones.active[0].damage = 100;
  state.players.p1.zones.active.push(specialEnergy(61, { attachedTo: 70 }));
  const res = resolveAll(use70(state, rng), rng);
  assert.equal(zoneOf(res, 'p1', 61), 'discard');
  assert.equal(holderCard(res).damage, 20);
});

// Ampharos, Lost Thunder 78.
const UNSEEN_FLASH =
  "Once during your turn (before your attack), you may put 2 {L} Energy cards from your hand in the Lost Zone. If you do, your opponent's Active Pokémon is now Paralyzed.";

test('ability: Ampharos Unseen Flash puts 2 {L} Energy in the Lost Zone, then Paralyzes', () => {
  const { state, rng } = board(UNSEEN_FLASH);
  state.players.p1.zones.hand.push(energy(61, 'Lightning'), energy(62, 'Water'), energy(63, 'Lightning'));
  let res = use70(state, rng);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId).sort(), [61, 63]);
  res = resolveWith(res, [61, 63], rng);
  assert.equal(zoneOf(res, 'p1', 61), 'lostZone');
  assert.ok(hasCondition(res.state.players.p2.zones.active[0], 'Paralyzed'));
});

test('ability: Ampharos Unseen Flash with 1 {L} Energy in hand does not Paralyze', () => {
  const { state, rng } = board(UNSEEN_FLASH);
  state.players.p1.zones.hand.push(energy(61, 'Lightning'), energy(62, 'Water'));
  const res = use70(state, rng);
  assert.equal(hasCondition(res.state.players.p2.zones.active[0], 'Paralyzed'), false);
});

// Cofagrigus, Plasma Freeze 56.
const SIX_FEET_UNDER =
  "Once during your turn (before your attack) you may Knock Out this Pokémon. If you do, put 3 damage counters on your opponent's Pokémon in any way you like.";
// Milotic, Flashfire 23.
const ENERGY_GRACE =
  'Once during your turn (before your attack) you may Knock Out this Pokémon. If you do, attach 3 basic Energy cards from your discard pile to 1 of your Pokémon (excluding Pokémon-EX).';
// Electrode-GX, Celestial Storm SV57.
const EXTRA_ENERGY_BOMB =
  'Once during your turn (before your attack), you may attach 5 Energy cards from your discard pile to your Pokémon, except Pokémon-GX or Pokémon-EX, in any way you like. If you do, this Pokémon is Knocked Out.';

test('ability: Cofagrigus Six Feet Under places 3 counters and Knocks Out itself', () => {
  const { state, rng } = board(SIX_FEET_UNDER, { name: 'Cofagrigus', oppBench: [] });
  const res = resolveAll(use70(state, rng), rng);
  assert.equal(res.state.players.p2.zones.active[0].damage, 30);
  assert.equal(zoneOf(res, 'p1', 70), 'discard');
});

test('ability: Milotic Energy Grace attaches 3 basic Energy to one non-EX Pokémon, then is Knocked Out', () => {
  const { state, rng } = board(ENERGY_GRACE, { name: 'Milotic', ownBench: [] });
  const p1 = state.players.p1.zones;
  p1.bench.push(mon(81, 'Keldeo-EX'), mon(82, 'Keldeo'));
  p1.discard.push(energy(61, 'Water'), energy(62, 'Water'), energy(63, 'Water'), energy(64, 'Water'));
  let res = use70(state, rng);
  const seen = [];
  for (let guard = 0; res.pendingChoice?.player === 'p1' && guard < 12; guard++) {
    const ids = res.pendingChoice.options.map((o) => o.instanceId);
    if (!ids.includes(61) && !ids.includes(62) && !ids.includes(63)) seen.push(ids);
    res = resolveWith(res, [ids.includes(82) ? 82 : ids[0]], rng);
  }
  // Milotic and the EX are no targets, so Keldeo takes every attach without a target prompt.
  assert.deepEqual(seen, []);
  const attached = res.state.players.p1.zones.bench.filter((c) => c.attachedTo === 82);
  assert.equal(attached.length, 3);
  assert.equal(zoneOf(res, 'p1', 70), 'discard');
});

test('ability: Electrode-GX Extra Energy Bomb attaches 5 Energy in any way, then is Knocked Out', () => {
  const { state, rng } = board(EXTRA_ENERGY_BOMB, { name: 'Electrode-GX', ownBench: [81, 82] });
  state.players.p1.zones.bench.push(mon(83, 'Tapu Lele-GX'));
  for (let id = 61; id <= 66; id++) state.players.p1.zones.discard.push(energy(id, 'Lightning'));
  let res = use70(state, rng);
  const offered = new Set();
  let turn = 0;
  for (let guard = 0; res.pendingChoice?.player === 'p1' && guard < 20; guard++) {
    const ids = res.pendingChoice.options.map((o) => o.instanceId);
    if (ids.some((id) => id >= 70 && id !== 70)) ids.forEach((id) => offered.add(id));
    res = resolveWith(res, [ids.includes(81) ? (turn++ % 2 ? 81 : 82) : ids[0]], rng);
  }
  assert.deepEqual([...offered].sort(), [81, 82]);
  const attached = res.state.players.p1.zones.bench.filter((c) => c.attachedTo === 81 || c.attachedTo === 82);
  assert.equal(attached.length, 5);
  assert.equal(zoneOf(res, 'p1', 70), 'discard');
});

test('ability: Electrode-GX Extra Energy Bomb with no Energy in the discard pile is not Knocked Out', () => {
  const { state, rng } = board(EXTRA_ENERGY_BOMB, { name: 'Electrode-GX' });
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'active');
});

// Banette, Lost Origin 073.
const PUPPET_OFFERING =
  'Once during your turn, you may put a Supporter card from your discard pile into your hand. If you do, put this Pokémon in the Lost Zone. (Discard all attached cards.)';
// Unown, Ancient Origins 30.
const FAREWELL_LETTER =
  'Once during your turn (before your attack), if this Pokémon is on your Bench, you may discard this Pokémon and all cards attached to it (this does not count as a Knock Out). If you do, draw a card.';
// Tapu Koko Prism Star, Team Up 51.
const DANCE_OF_THE_ANCIENTS =
  'Once during your turn (before your attack), if this Pokémon is on your Bench, you may choose 2 of your Benched Pokémon and attach a {L} Energy card from your discard pile to each of them. If you do, discard all cards from this Pokémon and put it in the Lost Zone.';
// Misty's Psyduck, Destined Rivals 193.
const FLUSTERED_LEAP =
  'Once during your turn, if this Pokémon is on your Bench, you may discard the bottom card of your deck. If you do, discard all cards from this Pokémon and put this Pokémon on top of your deck.';

test('ability: Banette Puppet Offering takes a Supporter, then goes to the Lost Zone without its attachments', () => {
  const { state, rng } = board(PUPPET_OFFERING, { zone: 'bench', name: 'Banette' });
  state.players.p1.zones.discard.push(createCard({ instanceId: 50, name: 'Boss', supertype: 'Trainer', subtypes: ['Supporter'] }));
  state.players.p1.zones.bench.push(energy(60, 'Psychic', { attachedTo: 70 }));
  const res = resolveAll(use70(state, rng), rng);
  assert.equal(zoneOf(res, 'p1', 50), 'hand');
  assert.equal(zoneOf(res, 'p1', 70), 'lostZone');
  assert.equal(zoneOf(res, 'p1', 60), 'discard');
});

test('ability: Banette Puppet Offering with no Supporter in the discard pile stays in play', () => {
  const { state, rng } = board(PUPPET_OFFERING, { zone: 'bench', name: 'Banette' });
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'bench');
});

test('ability: Unown Farewell Letter discards itself, then draws a card', () => {
  const { state, rng } = board(FAREWELL_LETTER, { zone: 'bench', name: 'Unown' });
  state.players.p1.zones.deck.push(createCard({ instanceId: 40, name: 'Top Card' }));
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'discard');
  assert.equal(zoneOf(res, 'p1', 40), 'hand');
});

test('ability: Tapu Koko Prism Star attaches a {L} Energy to each of 2 Benched Pokémon, then goes to the Lost Zone', () => {
  const { state, rng } = board(DANCE_OF_THE_ANCIENTS, { zone: 'bench', name: 'Tapu Koko Prism Star' });
  state.players.p1.zones.discard.push(energy(61, 'Lightning'), energy(62, 'Water'), energy(63, 'Lightning'));
  let res = use70(state, rng);
  for (let guard = 0; res.pendingChoice?.player === 'p1' && guard < 12; guard++) {
    const ids = res.pendingChoice.options.map((o) => o.instanceId);
    assert.ok(!ids.includes(62), 'a Water Energy is never offered');
    assert.ok(!ids.includes(80), 'the Active Pokémon is never offered');
    res = resolveWith(res, [ids.find((id) => id !== 70)], rng);
  }
  const hosts = [61, 63].map((id) => res.state.players.p1.zones.bench.find((c) => c.instanceId === id)?.attachedTo);
  assert.deepEqual(hosts.sort(), [81, 82]);
  assert.equal(zoneOf(res, 'p1', 70), 'lostZone');
});

test("ability: Misty's Psyduck Flustered Leap mills the bottom card, then goes on top of the deck", () => {
  const { state, rng } = board(FLUSTERED_LEAP, { zone: 'bench', name: "Misty's Psyduck" });
  state.players.p1.zones.deck.push(createCard({ instanceId: 40, name: 'Top' }), createCard({ instanceId: 41, name: 'Bottom' }));
  state.players.p1.zones.bench.push(energy(60, 'Water', { attachedTo: 70 }));
  const res = use70(state, rng);
  const deck = res.state.players.p1.zones.deck.map((c) => c.instanceId);
  assert.deepEqual(deck, [70, 40]);
  assert.equal(zoneOf(res, 'p1', 41), 'discard');
  assert.equal(zoneOf(res, 'p1', 60), 'discard');
});

test("ability: Misty's Psyduck Flustered Leap with an empty deck stays on the Bench", () => {
  const { state, rng } = board(FLUSTERED_LEAP, { zone: 'bench', name: "Misty's Psyduck" });
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'bench');
});

// Malamar, Obsidian Flames 138.
const PSYCHIC_INSIGHT =
  "Once during your turn, you may look at the top card of your opponent's deck. If you do, look at the top card of your deck.";

test('ability: Malamar Psychic Insight shows both top cards and moves nothing', () => {
  const { state, rng } = board(PSYCHIC_INSIGHT, { name: 'Malamar' });
  state.players.p1.zones.deck.push(createCard({ instanceId: 40, name: 'Mine' }), createCard({ instanceId: 41, name: 'Mine 2' }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 45, name: 'Theirs' }));
  const res = use70(state, rng);
  const revealed = res.events.filter((e) => e.type === 'cardsRevealed').map((e) => e.cards.map((c) => c.instanceId));
  assert.deepEqual(revealed, [[45], [40]]);
  assert.deepEqual(res.state.players.p1.zones.deck.map((c) => c.instanceId), [40, 41]);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
});

// ── form changes and hand-activated halves ───────────────────────────────

// Deoxys Speed Forme, Legends Awakened 26.
const FORM_CHANGE =
  'Once during your turn (before your attack), you may search your deck for any Deoxys and switch it with Deoxys Speed Forme. (Any cards attached to Deoxys Speed Forme, damage counters, Special Conditions, and effects on it are now on the new Pokémon.) If you do, put Deoxys Speed Forme on top of your deck. Shuffle your deck afterward. You can\u2019t use more than 1 Form Change Pok\u00e9-Power each turn.';

test('ability: Deoxys Form Change swaps in a deck Deoxys with the stack state; the old form returns to the deck', () => {
  const { state, rng } = board(FORM_CHANGE, { name: 'Deoxys Speed Forme' });
  const p1 = state.players.p1.zones;
  p1.active[0].damage = 40;
  p1.active.push(energy(60, 'Psychic', { attachedTo: 70 }));
  p1.deck.push(mon(40, 'Deoxys Attack Forme'), mon(41, 'Pikachu'));
  let res = use70(state, rng);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [40]);
  res = resolveWith(res, [40], rng);
  const active = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(active.instanceId, 40);
  assert.equal(active.damage, 40);
  assert.equal(res.state.players.p1.zones.active.find((c) => c.instanceId === 60)?.attachedTo, 40);
  assert.equal(zoneOf(res, 'p1', 70), 'deck');
  assert.equal(zoneOf(res, 'p1', 40), 'active');
});

// Pyukumuku, Sword & Shield Promos SWSH169.
const PITCH_A_PYUKUMUKU =
  "Once during your turn, if this Pokémon is in your hand, you may reveal it and put it on the bottom of your deck. If you do, draw a card. You can't use more than 1 Pitch a Pyukumuku Ability each turn.";
// Beedrill, Vivid Voltage 003.
const ELUSIVE_MASTER =
  'Once during your turn, if this Pokémon is the last card in your hand, you may play it onto your Bench. If you do, draw 3 cards.';

function handBoard(text, name) {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(80, 'Own Active'));
  state.players.p2.zones.active.push(mon(90, 'Opp Active'));
  state.players.p1.zones.hand.push(mon(70, name, { abilities: [{ name: 'Test Ability', type: 'Ability', text }] }));
  for (let id = 40; id < 45; id++) state.players.p1.zones.deck.push(createCard({ instanceId: id, name: `Deck ${id}` }));
  return { state, rng };
}

test('ability: Pyukumuku Pitch a Pyukumuku goes from the hand to the deck bottom, then draws a card', () => {
  const { state, rng } = handBoard(PITCH_A_PYUKUMUKU, 'Pyukumuku');
  const res = use70(state, rng);
  const deck = res.state.players.p1.zones.deck.map((c) => c.instanceId);
  assert.equal(deck.at(-1), 70);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId), [40]);
});

test('ability: Beedrill Elusive Master benches the last card in hand, then draws 3', () => {
  const { state, rng } = handBoard(ELUSIVE_MASTER, 'Beedrill');
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'bench');
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId), [40, 41, 42]);
});

test('ability: Beedrill Elusive Master with another card in hand neither benches nor draws', () => {
  const { state, rng } = handBoard(ELUSIVE_MASTER, 'Beedrill');
  state.players.p1.zones.hand.push(createCard({ instanceId: 50, name: 'Other' }));
  const res = use70(state, rng);
  assert.equal(zoneOf(res, 'p1', 70), 'hand');
  assert.equal(res.state.players.p1.zones.hand.length, 2);
});

// Azelf, Legends Awakened 19.
const TIME_WALK =
  'Once during your turn, when you put Azelf from your hand onto your Bench, you may look at all of your face-down Prize cards. If you do, you may choose 1 Pokémon you find there, show it to your opponent, and put it into your hand. Then, choose 1 card in your hand and put it as a Prize card face down.';

function azelfBoard(playedToBenchTurn) {
  const { state, rng } = board(TIME_WALK, { zone: 'bench', name: 'Azelf' });
  state.players.p1.zones.bench.find((c) => c.instanceId === 70).playedToBenchTurn = playedToBenchTurn;
  state.players.p1.zones.prizes.push(createCard({ instanceId: 30, name: 'Potion' }), mon(31, 'Uxie'));
  state.players.p1.zones.hand.push(createCard({ instanceId: 50, name: 'Rare Candy' }));
  return { state, rng };
}

test('ability: Azelf Time Walk swaps a Prize Pokémon for a hand card the turn it is benched', () => {
  const { state, rng } = azelfBoard(2);
  let res = use70(state, rng);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [31]);
  res = resolveWith(res, [31], rng);
  res = resolveWith(res, [50], rng);
  assert.equal(zoneOf(res, 'p1', 31), 'hand');
  assert.equal(zoneOf(res, 'p1', 50), 'prizes');
  assert.equal(res.state.players.p1.zones.prizes.length, 2);
});

test('ability: Azelf Time Walk is refused on a later turn', () => {
  const { state, rng } = azelfBoard(1);
  const res = use70(state, rng);
  assert.ok(res.error);
  assert.equal(zoneOf(res, 'p1', 31) ?? zoneOf({ state }, 'p1', 31), 'prizes');
});

// Walrein ex, Power Keepers 99.
const CHILLING_BREATH =
  "Once during your turn, when you play Walrein ex from your hand to evolve 1 of your Pokémon, you may use this power. Your opponent can't play any Trainer cards from his or her hand during your opponent's next turn.";

test('ability: Walrein ex Chilling Breath locks Trainers on the next turn, only the turn it evolved', () => {
  const fresh = board(CHILLING_BREATH, { name: 'Walrein ex' });
  fresh.state.players.p1.zones.active[0].enteredPlayTurn = 2;
  const res = use70(fresh.state, fresh.rng);
  assert.deepEqual(res.state.players.p2.playLocks?.map((l) => l.kinds), [['trainer']]);

  const stale = board(CHILLING_BREATH, { name: 'Walrein ex' });
  stale.state.players.p1.zones.active[0].enteredPlayTurn = 1;
  assert.ok(use70(stale.state, stale.rng).error);
});

// Crawdaunt, Primal Clash 92 (Lycanroc-GX Twilight Eyes, Team Up 82, prints the same effect).
const UNRULY_CLAW =
  "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard an Energy attached to your opponent's Active Pokémon.";

test("ability: Crawdaunt Unruly Claw discards an Energy from the opponent's Active, not from the hand", () => {
  const { state, rng } = board(UNRULY_CLAW, { name: 'Crawdaunt' });
  state.players.p1.zones.active[0].enteredPlayTurn = 2;
  state.players.p1.zones.hand.push(energy(60, 'Water'));
  state.players.p2.zones.active.push(energy(61, 'Fire', { attachedTo: 90 }));
  state.players.p2.zones.bench.push(energy(62, 'Fire', { attachedTo: 91 }));
  let res = use70(state, rng);
  assert.equal(res.error, null);
  assert.deepEqual(res.pendingChoice?.options.map((o) => o.instanceId), [61]);
  res = resolveWith(res, [61], rng);
  assert.equal(zoneOf(res, 'p2', 61), 'discard');
  assert.equal(zoneOf(res, 'p2', 62), 'bench');
  assert.equal(zoneOf(res, 'p1', 60), 'hand');
});

test('ability: Crawdaunt Unruly Claw is refused when it did not evolve this turn', () => {
  const { state, rng } = board(UNRULY_CLAW, { name: 'Crawdaunt' });
  state.players.p1.zones.active[0].enteredPlayTurn = 1;
  state.players.p2.zones.active.push(energy(61, 'Fire', { attachedTo: 90 }));
  assert.ok(use70(state, rng).error);
});

// Ninetales, Team Up 16 / Volcanion Prism Star, Forbidden Light 31: a hand-discard cost, then the
// opponent's switch — the player's own Active never moves (parse-hole review B1).
const NINE_TEMPTATIONS =
  "Once during your turn (before your attack), you may discard 2 {R} Energy cards from your hand. If you do, switch 1 of your opponent's Benched Pokémon with their Active Pokémon.";
const JET_GEYSER =
  'Once during your turn (before your attack), you may discard a {W} Energy card from your hand. If you do, your opponent switches their Active Pokémon with 1 of their Benched Pokémon.';
const fireEnergy = (instanceId, type = 'Fire') =>
  createCard({ instanceId, name: `${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type] });

test('ability: Ninetales Nine Temptations pays 2 {R} from hand, then gusts; the own Active stays', () => {
  const { state, rng } = board(NINE_TEMPTATIONS, { name: 'Ninetales', ownBench: [], oppBench: [91, 92] });
  state.players.p1.zones.hand.push(fireEnergy(60), fireEnergy(61));
  let res = use70(state, rng);
  for (let guard = 0; res.pendingChoice && guard < 5; guard++) {
    const ids = res.pendingChoice.options.map((o) => o.instanceId);
    res = resolveWith(res, ids.includes(60) ? [60, 61] : [92], rng);
  }
  assert.equal(activeId(res, 'p1'), 70);
  assert.equal(activeId(res, 'p2'), 92);
  assert.equal(res.state.players.p1.zones.discard.length, 2);
});

test('ability: Ninetales Nine Temptations with 1 {R} in hand does not gust', () => {
  const { state, rng } = board(NINE_TEMPTATIONS, { name: 'Ninetales', ownBench: [], oppBench: [91] });
  state.players.p1.zones.hand.push(fireEnergy(60));
  const res = use70(state, rng);
  assert.equal(activeId(res, 'p2'), 90);
});

test('ability: Volcanion Prism Star Jet Geyser pays a {W} from hand; the opponent picks their new Active', () => {
  const { state, rng } = board(JET_GEYSER, { name: 'Volcanion Prism Star', ownBench: [81] });
  state.players.p1.zones.hand.push(fireEnergy(60, 'Water'));
  let res = use70(state, rng);
  if (res.pendingChoice?.player === 'p1') res = resolveWith(res, [60], rng);
  assert.equal(res.pendingChoice?.player, 'p2');
  res = resolveWith(res, [92], rng);
  assert.equal(activeId(res, 'p1'), 70);
  assert.equal(activeId(res, 'p2'), 92);
});

test('evolve-played trigger: a named Pokémon is one, "a Pokémon" and "to evolve this Pokémon" are not (review S2)', () => {
  const card = (text) => mon(1, 'X', { abilities: [{ name: 'A', type: 'Ability', text }] });
  // Walrein ex, Power Keepers 99.
  assert.equal(isEvolvePlayedTrigger(card(CHILLING_BREATH)), true);
  // Eevee Resonant Evolution, Astral Radiance 119.
  assert.equal(
    isEvolvePlayedTrigger(
      card('Once during your turn, when you play a Pokémon from your hand to evolve 1 of your other Eevee, you may search your deck for a card that evolves from this Pokémon and put it onto this Pokémon to evolve it. Then, shuffle your deck.')
    ),
    false
  );
  // Alakazam-EX Kinesis, Fates Collide 125.
  assert.equal(
    isEvolvePlayedTrigger(
      card("When you play M Alakazam-EX from your hand to evolve this Pokémon, before it evolves, you may put 2 damage counters on your opponent's Active Pokémon and 3 damage counters on 1 of your opponent's Benched Pokémon.")
    ),
    false
  );
});
// Dusclops, Shrouded Fable 019 (pkmncards row in out/pkmn-pokemon-cards.json).
const CURSED_BLAST =
  "Once during your turn, you may put 5 damage counters on 1 of your opponent's Pokémon. If you use this Ability, this Pokémon is Knocked Out.";

test('ability: Cursed Blast Knocks Out its user and the opponent chooses a Prize card', () => {
  const { state, rng } = board(CURSED_BLAST, { name: 'Dusclops', ownBench: [81], oppBench: [91] });
  for (const [playerId, base] of [['p1', 200], ['p2', 210]]) {
    for (let i = 0; i < 3; i++) state.players[playerId].zones.prizes.push(mon(base + i, 'Prize'));
  }
  const picked = resolveWith(use70(state, rng), [91], rng);
  const { p1, p2 } = picked.state.players;
  assert.equal(p1.zones.discard.some((c) => c.instanceId === 70), true);
  assert.equal(p2.flags.prizesOwed, 1);
  assert.equal(picked.pendingChoice?.player, 'p2');
  assert.equal(picked.pendingChoice?.source, 'Prize cards');
});

test('ability: Cursed Blast lethal on the target gives both players a Prize choice in turn', () => {
  const { state, rng } = board(CURSED_BLAST, { name: 'Dusclops', ownBench: [81], oppBench: [91] });
  for (const [playerId, base] of [['p1', 200], ['p2', 210]]) {
    for (let i = 0; i < 3; i++) state.players[playerId].zones.prizes.push(mon(base + i, 'Prize'));
  }
  state.players.p2.zones.bench.find((c) => c.instanceId === 91).damage = 60;
  const first = resolveWith(use70(state, rng), [91], rng);
  assert.equal(first.pendingChoice?.player, 'p1');
  const second = resolveWith(first, [first.pendingChoice.options[0].instanceId], rng);
  assert.equal(second.pendingChoice?.player, 'p2');
  assert.equal(second.pendingChoice?.source, 'Prize cards');
});
