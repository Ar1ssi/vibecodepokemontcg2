// A supported effect keeps working when its wording, count, type or target is edited.
//
// Printed texts are the pkmncards corpus rows (out/pkmn-trainer-cards.json,
// out/pkmn-special-energy-cards.json, out/pkmn-pokemon-cards.json) named in each test. The
// "reworded" texts are edits of those rows, as a custom set would make them: they are not
// printed cards, and they hold the grammar to wordings no parser branch names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalEffectWording } from '../effect-wording.mjs';
import { parseTrainerEffect } from '../trainer-effects.mjs';
import { parseSpecialEnergyEffects, getSpecialEnergyHpBonus, hasSpecialEnergyFreeRetreat } from '../special-energy-parse.mjs';
import { pokemonMatchesEnergyType } from '../special-energy-effects.mjs';
import { matchesSearch } from '../search-match.mjs';
import { parseAttackSteps } from '../attack-steps.mjs';
import { parseAbility } from '../abilities.mjs';
import { rootMatchesTarget } from '../../effects/trainer-steps.mjs';

const steps = (text) => parseTrainerEffect(text).steps;
const energySteps = (text) =>
  parseSpecialEnergyEffects({ name: 'Homebrew Energy', supertype: 'Energy', subtypes: ['Special'], text }).steps;
const energyStep = (text, type) => energySteps(text).find((s) => s.type === type);

test('canonicalEffectWording: synonyms become the printed spelling, numbers and kinds stay', () => {
  assert.equal(canonicalEffectWording('Switch it with one of your Benched Pokémon.'), 'Switch it with 1 of your Benched Pokémon.');
  assert.equal(canonicalEffectWording('Search your deck for up to two Grookey cards and place them on your Bench.'), 'Search your deck for up to 2 Grookey cards and put them onto your Bench.');
  assert.equal(canonicalEffectWording("your opponents Active Pokémon can no longer retreat"), "your opponent's Active Pokémon can't retreat");
  assert.equal(canonicalEffectWording('this Pokémon has 10HP remaining'), 'this Pokémon has 10 HP remaining');
  // Reminder text states no effect (Shedinja Shell Survival, pkmn-pokemon-cards.json).
  assert.equal(canonicalEffectWording('(you cannot put it face down)'), '(you cannot put it face down)');
  const once = canonicalEffectWording('Place it onto your Bench. Then draw three cards with one of your Pokémon.');
  assert.equal(canonicalEffectWording(once), once, 'idempotent');
});

test('a synonym parses like the printed wording (Jacinthe, Rust Syndicate Grunt)', () => {
  assert.deepEqual(steps('Heal 150 damage from one of your {P} Pokémon.'), steps('Heal 150 damage from 1 of your {P} Pokémon.'));
  assert.deepEqual(
    steps("Discard an Energy from one of your opponent's Pokémon."),
    steps("Discard an Energy from 1 of your opponent's Pokémon.")
  );
  assert.equal(steps("Discard an Energy from one of your opponent's Pokémon.")[0].type, 'discardEnergyFromOpponent');
});

test('deck search reads the printed kind at any count (Clavell, Holon Mentor)', () => {
  const clavell = steps('Search your deck for up to 3 Basic Pokémon with 120 HP or less, reveal them, and put them into your hand. Then, shuffle your deck.')[0];
  assert.equal(clavell.what, 'Basic Pokémon ≤120 HP');
  assert.equal(clavell.count, 3);
  const reworded = steps('Search your deck for up to 4 Basic Pokémon with 90 HP or less, reveal them, and put them into your hand. Then, shuffle your deck.')[0];
  assert.equal(reworded.what, 'Basic Pokémon ≤90 HP');
  assert.equal(reworded.count, 4);
  const mentor = steps("Discard a card from your hand. If you can't discard a card from your hand, you can't play this card. Search your deck for up to 3 Basic Pokémon that each has 100 HP or less, show them to your opponent, and put them into your hand. Shuffle your deck afterward.");
  assert.equal(mentor.find((s) => s.type === 'searchDeck').what, 'Basic Pokémon ≤100 HP');
});

test('"in any combination of A and B" is one pool of both kinds (Ethan\'s Adventure, Roseanne\'s Research)', () => {
  const ethan = steps("Search your deck for up to 3 in any combination of Ethan's Pokémon and Basic {R} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.")[0];
  assert.equal(ethan.what, "Ethan's Pokémon or Basic {R} Energy");
  assert.equal(ethan.count, 3);
  const roseanne = steps('Search your deck for up to 2 in any combination of Basic Pokémon and basic Energy cards, show them to your opponent, and put them into your hand. Shuffle your deck afterward.')[0];
  assert.equal(roseanne.what, 'Basic Pokémon or Basic Energy');
});

test('a search reworded to one card keeps its filter (Buddy-Buddy Poffin, Traveling Salesman, Lady Outing)', () => {
  const poffin = steps('Search your deck for a Basic Pokémon with 70 HP or less and put it onto your Bench. Then, shuffle your deck.')[0];
  assert.equal(poffin.what, 'Basic Pokémon ≤70 HP');
  assert.equal(poffin.count, 1);
  assert.equal(poffin.destination, 'bench');
  const salesman = steps('Search your deck for a Technical Machine and/or Pokémon Tool card, show it to your opponent, and then put it into your hand. Shuffle your deck afterward.')[0];
  assert.equal(salesman.what, 'Technical Machine or Pokémon Tool');
  assert.equal(salesman.count, 1);
  const outing = steps('Search your deck for up to 3 different types of basic Energy cards, show them to your opponent, and put them into your hand. Shuffle your deck afterward.')[0];
  assert.equal(outing.what, 'Basic Energy');
  assert.equal(outing.distinctTypes, true);
});

test('coin clauses read their coin count (Team Rocket\'s Handiwork, Energy Restore, Energy Coin)', () => {
  assert.deepEqual(steps("Flip 3 coins. For each heads, discard 2 cards from the top of your opponent's deck."), [
    { type: 'millPerHeads', coins: 3, per: 2 },
  ]);
  assert.deepEqual(steps("Flip 2 coins. For each heads, discard a card from the top of your opponent's deck."), [
    { type: 'millPerHeads', coins: 2, per: 1 },
  ]);
  const restore = steps("Flip 2 coins. For each heads, put a basic Energy card from your discard pile into your hand. If you don't have that many basic Energy cards in your discard pile, put all of them into your hand.")[0];
  assert.equal(restore.coins, 2);
  const coin = steps('Flip 3 coins. If all of them are heads, search your deck for a Basic Energy card and attach it to 1 of your Pokémon. Then, shuffle your deck.')[0];
  assert.equal(coin.count, 3);
  assert.equal(coin.headsAtLeast, 3);
  assert.equal(coin.heads[0].what, 'Basic Energy');
});

test('one Energy from the discard pile goes to the printed target, not the Bench (Mela, Melony)', () => {
  const mela = steps('You can use this card only if any of your Pokémon were Knocked Out during your opponent\'s last turn. Attach a Basic {R} Energy card from your discard pile to 1 of your Pokémon. If you do, draw cards until you have 6 cards in your hand.')[0];
  assert.equal(mela.type, 'attachFromDiscard');
  assert.equal(mela.target, '1 of your Pokémon');
  const melony = steps('Attach a {W} Energy card from your discard pile to 1 of your Pokémon V. If you do, draw 3 cards.')[0];
  assert.equal(melony.target, '1 of your Pokémon V');
  // Wondrous Patch still names the Bench.
  const patch = steps('Attach a Basic {P} Energy card from your discard pile to 1 of your Benched {P} Pokémon.')[0];
  assert.match(patch.target, /Benched/);

  const player = { zones: { active: [{ instanceId: 1, name: 'Lapras V' }], bench: [{ instanceId: 2, name: 'Lapras' }] } };
  assert.equal(rootMatchesTarget(player, player.zones.active[0], melony.target), true);
  assert.equal(rootMatchesTarget(player, player.zones.bench[0], melony.target), false, 'a non-V Pokémon is not a Pokémon V');
});

const PROVIDES = 'As long as this card is attached to a Pokémon, it provides {C} Energy. ';

test('special Energy: a host printed without a type has no host gate', () => {
  // Growing {G} Energy prints "The {G} Pokémon this card is attached to gets +20 HP."
  const typed = energyStep(`${PROVIDES}The {G} Pokémon this card is attached to gets +20 HP.`, 'hpBonus');
  assert.deepEqual(typed, { type: 'hpBonus', amount: 20, hostType: 'Grass' });
  const untyped = energyStep(`${PROVIDES}The Pokémon this card is attached to gets +30 HP.`, 'hpBonus');
  assert.equal(untyped.amount, 30);
  assert.equal(untyped.hostType, undefined);

  const host = { instanceId: 1, name: 'Pikachu', types: ['Lightning'] };
  const attached = (text) => [host, { type: 'Energy', name: 'Homebrew Energy', subtypes: ['Special'], attachedTo: 1, text }];
  assert.equal(getSpecialEnergyHpBonus(host, attached(`${PROVIDES}The Pokémon this card is attached to gets +30 HP.`)), 30);
  assert.equal(getSpecialEnergyHpBonus(host, attached(`${PROVIDES}The {G} Pokémon this card is attached to gets +20 HP.`)), 0);
  assert.equal(hasSpecialEnergyFreeRetreat(host, attached(`${PROVIDES}The Pokémon this card is attached to has no Retreat Cost.`)), true);
  assert.equal(hasSpecialEnergyFreeRetreat(host, attached(`${PROVIDES}The {M} Pokémon this card is attached to has no Retreat Cost.`)), false);
});

test('special Energy: amounts are read, singular or plural', () => {
  // Rainbow Energy prints "put 1 damage counter on that Pokémon"; Lucky Energy "draw a card".
  const attach = 'When you attach this card from your hand to 1 of your Pokémon, ';
  assert.equal(energyStep(`${PROVIDES}${attach}put 2 damage counters on that Pokémon.`, 'onAttachDamageCounter').count, 2);
  assert.equal(energyStep(`${PROVIDES}${attach}put 1 damage counter on that Pokémon.`, 'onAttachDamageCounter').count, 1);
  assert.deepEqual(energyStep(`${PROVIDES}${attach}remove 3 damage counters and all Special Conditions from that Pokémon.`, 'onAttachRemoveDamage'), {
    type: 'onAttachRemoveDamage',
    count: 3,
    alsoCure: true,
  });
  const lucky = "If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if it is Knocked Out), draw 2 cards.";
  assert.equal(energyStep(`${PROVIDES}${lucky}`, 'onDamagedDraw').count, 2);
  assert.equal(energyStep(`${PROVIDES}The Retreat Cost of the Pokémon this card is attached to is {C} less.`, 'retreatReduction').amount, 1);
  assert.equal(energyStep(`${PROVIDES}When you attach this card from your hand to a {W} Pokémon, heal 40 damage from it.`, 'onAttachHeal').amount, 40);
  assert.deepEqual(energyStep(`${PROVIDES}The Pokémon this card is attached to can't be Burned.`, 'statusImmunity').conditions, ['Burned']);
});

test('attacks: a counted discard still gates its "If you do" (Golisopod ex Swing and Skedaddle)', () => {
  const printed = parseAttackSteps('Discard an Energy from this Pokémon. If you do, switch it with 1 of your Benched Pokémon.');
  const reworded = parseAttackSteps('Discard 2 Energy cards from this Pokémon. If you do, switch it with one of your Benched Pokémon.');
  assert.deepEqual(printed.after, [{ type: 'atkSwitchSelf', requiresEnergyDiscard: true }]);
  assert.deepEqual(reworded.after, printed.after);
  // customhb-706 Noivern Night Swoop and customhb-581 Deoxys Protect (set.json), as typed there.
  const swoop = parseAttackSteps("Switch out your opponent's Active Pokémon with one of their Benched Pokémon. Then switch this Pokémon with one of your Benched Pokémon");
  assert.deepEqual(swoop.after.map((s) => s.type), ['atkGust', 'atkSwitchSelf']);
  const protect = parseAttackSteps("During your opponent's next turn, prevent all damage done to this Pokémon.");
  assert.equal(protect.after[0]?.marker?.kind, 'incomingPrevent');
  // Light Togetic Sweet Kiss prints "Your opponent may draw a card."
  assert.deepEqual(parseAttackSteps('Your opponent may draw 2 cards.').after, [
    { type: 'atkDraw', side: 'opponent', count: 2, opponentMay: true },
  ]);
});

test('abilities: a searched Pokémon keeps its printed owner, type and HP cap', () => {
  const search = (text) => parseAbility(text).find((s) => s.type === 'searchAbility');
  // Cynthia's Gabite Champion's Call, Gabite Dragon Call.
  assert.equal(search("Once during your turn, you may search your deck for a Cynthia's Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.").what, "Cynthia's Pokémon");
  assert.equal(search('Once during your turn (before your attack), you may search your deck for a {N} Pokémon, reveal it, and put it into your hand. Shuffle your deck afterward.').what, 'Dragon Pokémon');
  // Fan Rotom Fan Call, reworded from "up to 3" to one card.
  const fanCall = search("Once during your first turn, you may search your deck for a {C} Pokémon with 100 HP or less, reveal it, and put it into your hand. Then, shuffle your deck. You can't use more than 1 Fan Call Ability during your turn.");
  assert.match(fanCall.what, /Colorless Pokémon ≤100 HP/);
});

test('a typed rule-box kind filters on both (Electromagnetic Radar)', () => {
  const radar = steps('You can play this card only if you discard 2 other cards from your hand. Search your deck for up to 2 in any combination of {L} Pokémon-GX and {L} Pokémon-EX, reveal them, and put them into your hand. Then, shuffle your deck.');
  const { what } = radar.find((s) => s.type === 'searchDeck');
  assert.equal(what, 'Lightning Pokémon-GX or Lightning Pokémon-EX');
  const pokemon = (name, types, subtypes = []) => ({ name, supertype: 'Pokémon', type: 'Pokémon', hp: 180, types, subtypes });
  assert.equal(matchesSearch(pokemon('Raichu-GX', ['Lightning'], ['GX']), what), true);
  assert.equal(matchesSearch(pokemon('Manectric-EX', ['Lightning'], ['EX']), what), true);
  assert.equal(matchesSearch(pokemon('Charizard-GX', ['Fire'], ['GX']), what), false, 'a {R} Pokémon-GX is not a {L} one');
  assert.equal(matchesSearch(pokemon('Pikachu', ['Lightning']), what), false, 'a plain {L} Pokémon has no rule box');
});

test('a dual-type Pokémon is found by either printed type', () => {
  const dual = { name: 'Volcanion', types: ['Fire', 'Water'] };
  assert.equal(pokemonMatchesEnergyType(dual, 'Fire'), true);
  assert.equal(pokemonMatchesEnergyType(dual, 'Water'), true);
  assert.equal(pokemonMatchesEnergyType(dual, 'Grass'), false);
});
