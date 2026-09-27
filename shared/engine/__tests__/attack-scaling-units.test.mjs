// "for each <unit>" counts (rules/scaling-count.mjs), dynamic coin counts, tiered coins, and
// damage that reads what a before-damage step found. Texts are corpus rows named in each test
// (out/pkmn-pokemon-cards.json / out/pkmn-gx-cards.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

// ── parser: counts against a server-shaped ctx ───────────────────────────────

const serverCtx = (extra = {}) => ({
  benchNames: [],
  defenderPresent: true,
  ownPokemon: [],
  opponentPokemon: [],
  ownDiscardCards: [],
  opponentDiscardCards: [],
  attackerAttachedCards: [],
  ...extra,
});
const dealt = (name, damage, text, ctx) =>
  parseAttackDamage({ damage, text }, { name }, {}, serverCtx(ctx)).total;
const supporters = (n) => Array.from({ length: n }, () => ({ name: 'Marnie', category: 'trainer', trainerKind: 'supporter' }));
const items = (n) => Array.from({ length: n }, () => ({ name: 'Potion', category: 'trainer', trainerKind: 'item' }));

test('Banette-GX Shadow Chant (Celestial Storm SV61): Supporters in the discard, added part capped at 100', () => {
  const text =
    "This attack does 10 more damage for each Supporter card in your discard pile. You can't add more than 100 damage in this way.";
  assert.equal(dealt('Banette-GX', '30+', text, { ownDiscardCards: [...supporters(3), ...items(4)] }), 60);
  assert.equal(dealt('Banette-GX', '30+', text, { ownDiscardCards: supporters(14) }), 130);
});

test('Aegislash Trash Slash (Unified Minds 95): Items in the discard, total capped at 130', () => {
  const text =
    "This attack does 10 damage for each Item card in your discard pile. You can't do more than 130 damage in this way.";
  assert.equal(dealt('Aegislash', '10×', text, { ownDiscardCards: items(5) }), 50);
  assert.equal(dealt('Aegislash', '10×', text, { ownDiscardCards: items(20) }), 130);
});

test("Dudunsparce ex Tenacious Tail (Journey Together 178): the opponent's Pokémon ex in play", () => {
  const text = "This attack does 60 damage for each of your opponent's Pokémon ex in play.";
  const opponentPokemon = [
    { name: 'Charizard ex', kinds: ['ex', 'evolved'] },
    { name: 'Pidgey', kinds: ['basic'] },
    { name: 'Iron Hands ex', kinds: ['ex', 'basic'] },
  ];
  assert.equal(dealt('Dudunsparce ex', '60×', text, { opponentPokemon }), 120);
});

test('Incineroar-GX Hustling Strike (SM38): your Benched {R} Pokémon only', () => {
  const text = 'This attack does 20 more damage for each of your Benched {R} Pokémon.';
  const ownPokemon = [
    { name: 'Incineroar-GX', bench: false, kinds: ['type:fire'] },
    { name: 'Litten', bench: true, kinds: ['type:fire'] },
    { name: 'Torracat', bench: true, kinds: ['type:fire'] },
    { name: 'Pikachu', bench: true, kinds: ['type:lightning'] },
  ];
  assert.equal(dealt('Incineroar-GX', '10+', text, { ownPokemon }), 50);
});

test('Typhlosion Rage (Nintendo Black Star Promos 034): counters on the attacker named by its own name', () => {
  const text = 'Does 50 damage plus 10 more damage for each damage counter on Typhlosion.';
  assert.equal(dealt('Typhlosion', '50+', text, { attackerDamage: 40 }), 90);
});

test('Azumarill Dwindling Wave (Primal Clash 104): "minus 10 damage for each damage counter"', () => {
  const text = 'This attack does 100 damage minus 10 damage for each damage counter on this Pokémon.';
  assert.equal(dealt('Azumarill', '100-', text, { attackerDamage: 30 }), 70);
});

test('Shiftry Light Touch Throw (Sandstorm 12): minus 10 per Energy on the Defending Pokémon', () => {
  const text = 'Does 80 damage minus 10 damage for each Energy attached to the Defending Pokémon.';
  assert.equal(dealt('Shiftry', '80-', text, { opponentEnergyCount: 3 }), 50);
});

test('Sceptile Leaf Blast (Arceus 30): "times the amount of {G} Energy attached to Sceptile"', () => {
  const text = 'Does 20 damage times the amount of {G} Energy attached to Sceptile.';
  assert.equal(dealt('Sceptile', '20×', text, { attackerEnergyUnits: ['Grass', 'Grass', 'Water'] }), 40);
});

test('Spiritomb Chain of Spirits (Lost Origin TG09): its own name counts discard cards, not itself', () => {
  const text = 'This attack does 60 more damage for each Spiritomb in your discard pile.';
  const ownDiscardCards = [
    { name: 'Spiritomb', category: 'pokemon' },
    { name: 'Spiritomb', category: 'pokemon' },
    { name: 'Gengar', category: 'pokemon' },
  ];
  assert.equal(dealt('Spiritomb', '10+', text, { ownDiscardCards }), 130);
});

test('Wishiwashi-GX School Storm (Cosmic Eclipse 63): both names count', () => {
  const text = 'This attack does 20 damage for each of your Wishiwashi and Wishiwashi-GX in play.';
  const ownPokemon = [
    { name: 'Wishiwashi-GX', kinds: ['gx'] },
    { name: 'Wishiwashi', kinds: ['basic'] },
    { name: 'Wishiwashi', kinds: ['basic'] },
    { name: 'Pyukumuku', kinds: ['basic'] },
  ];
  assert.equal(dealt('Wishiwashi-GX', '20×', text, { ownPokemon }), 60);
});

test('Heracross Get Even (Team Rocket Returns 43): Prize cards more than the opponent', () => {
  const text =
    'If you have more Prize cards left than your opponent, this attack does 20 damage plus 10 more damage for each Prize card more than your opponent.';
  assert.equal(dealt('Heracross', '20+', text, { ownPrizes: 5, opponentPrizes: 2 }), 50);
  assert.equal(dealt('Heracross', '20+', text, { ownPrizes: 2, opponentPrizes: 5 }), 20);
});

test('Kabuto Work Together (Neo Discovery 56): heads-gated scaling, and the Bench is counted, not hit', () => {
  const text =
    'Flip a coin. If heads, this attack does 10 damage plus 10 more damage for each Omanyte, Omastar, Kabuto, and Kabutops on your Bench.';
  const ownPokemon = [
    { name: 'Omanyte', bench: true, kinds: [] },
    { name: 'Kabuto', bench: true, kinds: [] },
  ];
  assert.equal(dealt('Kabuto', '10+', text, { ownPokemon, coin: 'heads', headsCount: 1 }), 30);
  assert.equal(dealt('Kabuto', '10+', text, { ownPokemon, coin: 'tails', headsCount: 0 }), 10);
  assert.equal(parseAttackDamage({ damage: '10+', text }, {}, {}, serverCtx()).bench, 0);
});

test('Scyther Fury Cutter (FireRed & LeafGreen 29): tiered coin bonuses', () => {
  const text =
    'Flip 3 coins. If 1 of them is heads, this attack does 10 damage plus 10 more damage. If 2 of them are heads, this attack does 10 damage plus 20 more damage. If all of them are heads, this attack does 10 damage plus 50 more damage.';
  assert.equal(dealt('Scyther', '10+', text, { headsCount: 0 }), 10);
  assert.equal(dealt('Scyther', '10+', text, { headsCount: 1 }), 20);
  assert.equal(dealt('Scyther', '10+', text, { headsCount: 2 }), 30);
  assert.equal(dealt('Scyther', '10+', text, { headsCount: 3 }), 60);
});

test('Palkia-EX Dimension Heal (Plasma Blast 100): the "for each" scales the heal, not the damage', () => {
  const text = 'Heal from this Pokémon 20 damage for each Plasma Energy attached to this Pokémon.';
  assert.equal(dealt('Palkia-EX', '80', text, { energyCount: 3, attackerEnergyUnits: ['Water', 'Water', 'Water'] }), 80);
});

test('Armaldo Crush Claw (Legends Awakened 18): a next-turn marker on the defender, not a bonus now', () => {
  const text =
    'During your next turn, if an attack does damage to the Defending Pokémon (after applying Weakness and Resistance), that attack does 40 more damage.';
  assert.equal(dealt('Armaldo', '60', text, {}), 60);
  assert.deepEqual(parseAttackSteps(text).after, [
    {
      type: 'atkAddMarker',
      target: 'opponentActive',
      window: 'yourNextTurn',
      marker: { kind: 'incomingBonus', amount: 40, afterWR: true },
    },
  ]);
});

// ── reducer ───────────────────────────────────────────────────────────────────

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item', ...extra });
const energy = (type) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type] });

function board(name, attack, { attached = [], deckTop = null, oppHand = [], oppDeckTop = null, defenderTools = [], seed = 3 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'scaling', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  if (deckTop) state.players.p1.zones.deck.unshift(deckTop);
  if (oppDeckTop) state.players.p2.zones.deck.unshift(oppDeckTop);
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ cost: [], ...attack }] });
  state.players.p1.zones.active.push(attacker);
  const energyIds = attached.map((type) => {
    const card = energy(type);
    card.attachedTo = attacker.instanceId;
    state.players.p1.zones.active.push(card);
    return card.instanceId;
  });
  const defender = mon('Defender', { hp: 500 });
  state.players.p2.zones.active.push(defender);
  for (const tool of defenderTools) {
    tool.attachedTo = defender.instanceId;
    state.players.p2.zones.active.push(tool);
  }
  state.players.p2.zones.hand.push(...oppHand);
  return { state, attacker, defender, energyIds, seed };
}

const attack = ({ state, seed }) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(3)
  );
const damageOf = (res) => res.events.find((e) => e.type === 'attackExecuted')?.damage;

test('Heliolisk Powerful Bolt (Ascended Heroes 229): one coin per attached Energy', () => {
  const text = 'Flip a coin for each Energy attached to this Pokémon. This attack does 70 damage for each heads.';
  const res = attack(board('Heliolisk', { name: 'Powerful Bolt', damage: '70×', text }, { attached: ['Lightning', 'Lightning', 'Lightning'] }));
  assert.equal(res.error, null);
  const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
  assert.equal(flip.flips.length, 3);
  assert.equal(damageOf(res), 70 * flip.headsCount);
});

test('Torkoal V Combustion Pillar (Sword & Shield 188): the deck top decides the +90', () => {
  const text = 'Discard the top card of your deck. If that card is a {R} Energy card, this attack does 90 more damage.';
  const fire = board('Torkoal V', { name: 'Combustion Pillar', damage: '90+', text }, { deckTop: energy('Fire') });
  assert.equal(damageOf(attack(fire)), 180);
  const other = board('Torkoal V', { name: 'Combustion Pillar', damage: '90+', text }, { deckTop: energy('Water') });
  assert.equal(damageOf(attack(other)), 90);
});

test('Coalossal VMAX Eruption Shot (Vivid Voltage 189): an Energy on top adds 90 and is attached', () => {
  const text =
    'Discard the top card of your deck. If that card is an Energy card, this attack does 90 more damage, and attach that card to this Pokémon.';
  const b = board('Coalossal VMAX', { name: 'Eruption Shot', damage: '40+', text }, { deckTop: energy('Fire') });
  const res = attack(b);
  assert.equal(damageOf(res), 130);
  const attachedNow = res.state.players.p1.zones.active.filter((c) => c.attachedTo === b.attacker.instanceId);
  assert.equal(attachedNow.length, 1);
});

test('M Absol-EX Disaster Wing (XY Promos XY63): a Trainer on top of the opponent’s deck adds 80', () => {
  const text = "Discard the top card of your opponent's deck. If that card is a Trainer card, this attack does 80 more damage.";
  assert.equal(damageOf(attack(board('M Absol-EX', { name: 'Disaster Wing', damage: '80+', text }))), 160);
  const withMon = board('M Absol-EX', { name: 'Disaster Wing', damage: '80+', text }, { oppDeckTop: mon('Pidgey') });
  assert.equal(damageOf(attack(withMon)), 80);
});

test("Dracovish V Slosh 'n' Crash (Brilliant Stars 114): +120 only when a Tool was discarded", () => {
  const text =
    "Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon. If you discarded a Pokémon Tool in this way, this attack does 120 more damage.";
  const tooled = board('Dracovish V', { name: "Slosh 'n' Crash", damage: '60+', text }, {
    defenderTools: [trainer('Big Charm', { type: 'Trainer', subtypes: ['Pokémon Tool'] })],
  });
  assert.equal(damageOf(attack(tooled)), 180);
  assert.equal(damageOf(attack(board('Dracovish V', { name: "Slosh 'n' Crash", damage: '60+', text }))), 60);
});

test('Golduck Mind Play (Holon Phantoms 43): a Trainer picked from the hand adds 30 and is discarded', () => {
  const text =
    "Choose 1 card from your opponent's hand without looking. Look at the card you chose. If that card is a Trainer card, this attack does 30 damage plus 30 more damage, and discard that card. If that card is not a Trainer card, return it to your opponent's hand.";
  const potion = trainer('Potion');
  const res = attack(board('Golduck', { name: 'Mind Play', damage: '30+', text }, { oppHand: [potion] }));
  assert.equal(damageOf(res), 60);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Potion'));
  const pidgey = mon('Pidgey');
  const kept = attack(board('Golduck', { name: 'Mind Play', damage: '30+', text }, { oppHand: [pidgey] }));
  assert.equal(damageOf(kept), 30);
  assert.ok(kept.state.players.p2.zones.hand.some((c) => c.name === 'Pidgey'), 'a non-Trainer goes back');
});

test('Flareon Burn Booster (Skyridge 8): the chosen discard decides the +10', () => {
  const text =
    'Discard an Energy card attached to Flareon in order to use this attack. If the discarded card is a {R} Energy card, this attack does 40 damage plus 10 more damage.';
  const b = board('Flareon', { name: 'Burn Booster', damage: '40+', text }, { attached: ['Fire', 'Water'] });
  const offered = attack(b);
  assert.equal(offered.state.pendingChoice.min, 1, 'the cost is not optional');
  assert.equal(damageOf(choose(offered, [b.energyIds[0]])), 50);
  const b2 = board('Flareon', { name: 'Burn Booster', damage: '40+', text }, { attached: ['Fire', 'Water'] });
  const paidWater = choose(attack(b2), [b2.energyIds[1]]);
  assert.equal(damageOf(paidWater), 40);
  assert.equal(paidWater.state.players.p1.zones.active.filter((c) => c.attachedTo === b2.attacker.instanceId).length, 1);
});

test('Magcargo Crushing Lava (Skyridge 18): {F} adds 20, {R} Burns', () => {
  const text =
    'You may discard a {R} or {F} basic Energy card attached to Magcargo. If you discard a {R} Energy card in this way, the Defending Pokémon is now Burned. If you discard a {F} Energy card in this way, this attack does 40 damage plus 20 more damage.';
  const f = board('Magcargo', { name: 'Crushing Lava', damage: '40+', text }, { attached: ['Fire', 'Fighting'] });
  const fighting = choose(attack(f), [f.energyIds[1]]);
  assert.equal(damageOf(fighting), 60);
  const r = board('Magcargo', { name: 'Crushing Lava', damage: '40+', text }, { attached: ['Fire', 'Fighting'] });
  const fire = choose(attack(r), [r.energyIds[0]]);
  assert.equal(damageOf(fire), 40);
  // The Pokémon Checkup that follows may flip the Burn away; the attack applied it.
  assert.ok(
    fire.events.some((e) => e.type === 'specialConditionUpdated' && JSON.stringify(e).includes('Burned'))
  );
  assert.ok(
    !fighting.events.some((e) => e.type === 'specialConditionUpdated' && JSON.stringify(e).includes('Burned'))
  );
});

test('Arcanine Fire Blow (Aquapolis 2): one coin per {R} Energy discarded, then 30 per heads', () => {
  const text =
    'You may discard any number of {R} Energy cards attached to Arcanine when you use this attack. If you do, flip a number of coins equal to the number of {R} Energy cards you discarded. This attack does 30 damage plus 30 more damage for each heads.';
  const b = board('Arcanine', { name: 'Fire Blow', damage: '30+', text }, { attached: ['Fire', 'Fire', 'Water'] });
  const res = choose(attack(b), b.energyIds.slice(0, 2));
  assert.equal(res.error, null);
  const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
  assert.equal(flip.flips.length, 2);
  assert.equal(damageOf(res), 30 + 30 * flip.headsCount);
});

test('Charizard Continuous Blaze Ball (SM226): discards every {R} Energy and scales by them', () => {
  const text =
    'Discard all {R} Energy from this Pokémon. This attack does 50 more damage for each card you discarded in this way.';
  const b = board('Charizard', { name: 'Continuous Blaze Ball', damage: '30+', text }, { attached: ['Fire', 'Fire', 'Water'] });
  const res = attack(b);
  assert.equal(damageOf(res), 130);
  assert.equal(res.state.players.p1.zones.active.filter((c) => c.attachedTo === b.attacker.instanceId).length, 1);
});

test('Conkeldurr V Counter (Pokémon GO 074): repeats the damage taken during the last turn', () => {
  const text =
    "If this Pokémon was damaged by an attack during your opponent's last turn, this attack does that much more damage.";
  const b = board('Conkeldurr V', { name: 'Counter', damage: '20+', text });
  b.attacker.attackDamageTaken = { turn: 4, amount: 120 };
  assert.equal(damageOf(attack(b)), 140);
  const old = board('Conkeldurr V', { name: 'Counter', damage: '20+', text });
  old.attacker.attackDamageTaken = { turn: 2, amount: 120 };
  assert.equal(damageOf(attack(old)), 20);
});

test('reducer: an attack records the damage it did on the defender for a later Counter', () => {
  const b = board('Machamp', { name: 'Punch', damage: '70', text: '' });
  const res = attack(b);
  const defender = res.state.players.p2.zones.active.find((c) => !c.attachedTo);
  assert.deepEqual(defender.attackDamageTaken, { turn: 5, amount: 70 });
});
