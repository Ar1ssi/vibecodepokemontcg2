// I224: WotC Trainers that attach to a Pokémon without being Pokémon Tools.
// Trainer text: TCGdex `effect` strings (out/tcgdex-wotc-trainers.json), id cited per constant.
// Attack text: out/pkmn-pokemon-cards.json / out/pkmn-wotc-cards.json rows, cited per constant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { legacyAttachedTrainer } from '../rules/legacy-attached-trainer.mjs';

// TCGdex base1-80
const DEFENDER =
  "Attach Defender to 1 of your Pokémon. At the end of your opponent's next turn, discard Defender. Damage done to that Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).";
// TCGdex base1-84
const PLUSPOWER =
  "Attach PlusPower to your Active Pokémon. At the end of your turn, discard PlusPower. If this Pokémon's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage to the Defending Pokémon.";
// TCGdex gym1-99
const CHARITY =
  'Attach Charity to your Active Pokémon. Unless that Pokémon gets Knocked Out, return Charity to your hand at the end of your turn. If that Pokémon attacks and does damage to the Defending Pokémon, you may reduce that damage by any amount (rounded to the nearest 10).';
// TCGdex gym1-117 ("uses and attack" is printed)
const SABRINAS_ESP =
  "Attach Sabrina's ESP to 1 of your Pokémon with Sabrina in its name. At the end of your turn, discard Sabrina's ESP. If that Pokémon uses and attack that involves flipping coins, Sabrina's ESP lets you re-flip those coins once. If you do, re-flip all the coins.";
// TCGdex gym2-101
const BROCKS_PROTECTION =
  "Attach Brock's Protection to 1 of your Pokémon with Brock in its name. Energy cards attached to that Pokémon can't be removed by your opponent's attacks or Trainer cards. (This doesn't stop the rest of the attack or Trainer card from working normally.)";
// TCGdex gym2-115
const KOGAS_NINJA_TRICK =
  "Attach Koga's Ninja Trick to your Active Pokémon with Koga in its name. If this Pokémon goes to your Bench, discard this card. When your opponent attacks, you may switch this Pokémon with 1 of your Benched Pokémon (before damage or other effects of attacks).";
// TCGdex neo4-101
const MAGNIFIER =
  "Attach Magnifier to 1 of your Pokémon. At the end of your turn, discard Magnifier. If the Pokémon Magnifier is attached to attacks, don't apply Resistance for that attack.";
// TCGdex neo1-86 (a Pokémon Tool by its own wording)
const FOCUS_BAND =
  "Attach Focus Band to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it. If the Pokémon Focus Band is attached to would be Knocked Out by your opponent's attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.";
// TCGdex base1-92
const ENERGY_REMOVAL = "Choose 1 Energy card attached to 1 of your opponent's Pokémon and discard it.";

// pkmn-pokemon-cards: Kyurem ex [Black Bolt 165] "{C}{C} → Slash : 50" (no text)
const SLASH = { name: 'Slash', cost: [], damage: '50', text: '' };
// pkmn-pokemon-cards: Sandaconda VMAX [Chilling Reign 090] "Sand Pulse : 60"
const SAND_PULSE = {
  name: 'Sand Pulse',
  cost: [],
  damage: '60',
  text: "This attack also does 20 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};
// pkmn-wotc-cards: Dragonair [Base Set 18] "Slam : 30×"
const SLAM = { name: 'Slam', cost: [], damage: '30×', text: 'Flip 2 coins. This attack does 30 damage times the number of heads.' };
// pkmn-pokemon-cards: Team Rocket's Tyranitar [Destined Rivals 096] "Demolition Tackle : 180"
const DEMOLITION_TACKLE = {
  name: 'Demolition Tackle',
  cost: [],
  damage: '180',
  text: "Discard an Energy from your opponent's Active Pokémon.",
};

let nextId = 900;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) =>
  card({ name, supertype: 'Pokémon', hp: 300, stage: 'Basic', types: ['Water'], attacks: [SLASH], ...props });
const trainer = (name, text) => card({ name, type: 'Trainer', text });
const energy = () => card({ name: 'Water Energy', type: 'Energy', subtypes: ['Basic'], types: ['Water'] });

function setup({ turnPlayer = 'p1', turnNumber = 3 } = {}) {
  const state = createGameState({ gameId: 'wotc-attach', seed: 11, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = {
      playerId: id,
      username: id,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {}, supporterPlayed: false },
    };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `${id} Prize ${i}` }));
    for (let i = 0; i < 20; i++) state.players[id].zones.deck.push(card({ name: `${id} Deck ${i}`, type: 'Trainer', trainerType: 'Item' }));
  }
  state.turn = { player: turnPlayer, number: turnNumber, phase: 'main' };
  return { state, rng: createRng(11), p1: state.players.p1, p2: state.players.p2 };
}

function run(game, command) {
  const res = applyCommand(game.state, command, game.rng);
  assert.equal(res.error, null, `${command.type}: ${res.error}`);
  game.state = res.state;
  return res;
}

function play(game, playerId, trainerCard) {
  game.state.players[playerId].zones.hand.push(trainerCard);
  return run(game, {
    type: 'moveCard',
    payload: { instanceId: trainerCard.instanceId, from: 'hand', to: 'board' },
    playerId,
  });
}

function choose(game, res, selection) {
  assert.ok(res.pendingChoice, 'expected a pending choice');
  return run(game, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection },
    playerId: res.pendingChoice.player,
  });
}

const attack = (game, playerId) => run(game, { type: 'attack', payload: { attackIndex: 0 }, playerId });
const pass = (game, playerId) => run(game, { type: 'pass', payload: {}, playerId });
const zone = (game, playerId, zoneId) => game.state.players[playerId].zones[zoneId];
const has = (game, playerId, zoneId, c) => zone(game, playerId, zoneId).some((x) => x.instanceId === c.instanceId);
const found = (game, playerId, c) => zone(game, playerId, 'active').concat(zone(game, playerId, 'bench')).find((x) => x.instanceId === c.instanceId);

test('spec: the seven WotC attach-Trainers parse; Tools and other Trainers do not', () => {
  const spec = (text) => legacyAttachedTrainer({ type: 'Trainer', text });
  assert.deepEqual(spec(PLUSPOWER), {
    activeOnly: true,
    nameIncludes: null,
    discard: 'endOfYourTurn',
    effect: { kind: 'damageBonusAfterWR', amount: 10 },
  });
  assert.deepEqual(spec(DEFENDER), {
    activeOnly: false,
    nameIncludes: null,
    discard: 'endOfOpponentsNextTurn',
    effect: { kind: 'damageReductionAfterWR', amount: 20 },
  });
  assert.equal(spec(CHARITY).discard, 'returnAtEndOfYourTurn');
  assert.deepEqual([spec(SABRINAS_ESP).nameIncludes, spec(SABRINAS_ESP).effect.kind], ['Sabrina', 'reflipAttackCoins']);
  assert.deepEqual([spec(BROCKS_PROTECTION).discard, spec(BROCKS_PROTECTION).effect.kind], [null, 'energyRemovalGuard']);
  assert.deepEqual(
    [spec(KOGAS_NINJA_TRICK).activeOnly, spec(KOGAS_NINJA_TRICK).discard, spec(KOGAS_NINJA_TRICK).nameIncludes],
    [true, 'whenBenched', 'Koga']
  );
  assert.equal(spec(MAGNIFIER).effect.kind, 'ignoreResistance');
  assert.equal(spec(FOCUS_BAND), null);
  assert.equal(spec(ENERGY_REMOVAL), null);
  assert.equal(legacyAttachedTrainer({ type: 'Trainer', trainerType: 'Tool', text: PLUSPOWER }), null);
  assert.equal(legacyAttachedTrainer({ supertype: 'Pokémon', text: PLUSPOWER }), null);
  assert.equal(legacyAttachedTrainer(null), null);
});

test('PlusPower (base1-84): attaches beside a Tool, +10 after Weakness, discarded at end of turn', () => {
  const game = setup();
  const kyurem = pokemon('Kyurem ex');
  const tool = card({ name: 'Some Tool', type: 'Trainer', trainerType: 'Tool', text: FOCUS_BAND, attachedTo: kyurem.instanceId });
  game.p1.zones.active.push(kyurem, tool);
  game.p2.zones.active.push(pokemon('Charmander', { types: ['Fire'], weakness: { type: 'Water', value: 2 } }));
  const plusPower = trainer('PlusPower', PLUSPOWER);
  const res = play(game, 'p1', plusPower);
  assert.equal(res.pendingChoice, null);
  const attached = found(game, 'p1', plusPower);
  assert.equal(attached?.attachedTo, kyurem.instanceId, 'attached next to the Tool');
  assert.ok(!has(game, 'p1', 'discard', plusPower));

  // A second attach-Trainer and a Tool are not limited by it (it is not a Tool).
  const plusPower2 = trainer('PlusPower', PLUSPOWER);
  play(game, 'p1', plusPower2);
  assert.equal(found(game, 'p1', plusPower2)?.attachedTo, kyurem.instanceId);

  attack(game, 'p1');
  // 50 × 2 Weakness = 100, then +10 per PlusPower after Weakness (before would be 120 / 140).
  assert.equal(zone(game, 'p2', 'active')[0].damage, 120);
  assert.ok(has(game, 'p1', 'discard', plusPower) && has(game, 'p1', 'discard', plusPower2), 'discarded at end of turn');
  assert.ok(found(game, 'p1', tool), 'the Tool stays');
});

test('PlusPower: refused attach target — only the Active Pokémon', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Kyurem ex'));
  game.p1.zones.bench.push(pokemon('Squirtle'));
  game.p2.zones.active.push(pokemon('Charmander'));
  const plusPower = trainer('PlusPower', PLUSPOWER);
  const res = play(game, 'p1', plusPower);
  assert.equal(res.pendingChoice, null, 'one legal target, no prompt');
  assert.equal(found(game, 'p1', plusPower)?.attachedTo, game.p1.zones.active[0].instanceId);
});

test('Defender (base1-80): -20 after Weakness on the Active and on the Bench, discarded after the opponent’s next turn', () => {
  const game = setup();
  const squirtle = pokemon('Squirtle', { types: ['Water'], weakness: { type: 'Water', value: 2 } });
  const benched = pokemon('Staryu');
  game.p1.zones.active.push(squirtle);
  game.p1.zones.bench.push(benched);
  game.p2.zones.active.push(pokemon('Sandaconda VMAX', { attacks: [SAND_PULSE] }));
  const defender = trainer('Defender', DEFENDER);
  const res = play(game, 'p1', defender);
  assert.ok(res.pendingChoice, 'any of your Pokémon: a choice');
  choose(game, res, [squirtle.instanceId]);
  const defender2 = trainer('Defender', DEFENDER);
  choose(game, play(game, 'p1', defender2), [benched.instanceId]);

  pass(game, 'p1');
  assert.ok(found(game, 'p1', defender), 'still attached after its owner’s turn');
  attack(game, 'p2');
  // 60 × 2 Weakness = 120, −20 after Weakness = 100; the Bench takes 20 − 20 = 0.
  assert.equal(found(game, 'p1', squirtle).damage, 100);
  assert.equal(found(game, 'p1', benched).damage || 0, 0);
  assert.ok(has(game, 'p1', 'discard', defender) && has(game, 'p1', 'discard', defender2), 'discarded at end of opponent’s turn');
});

test('Defender: a playTrainer aimed at a Benched Pokémon attaches there without a prompt', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Squirtle'));
  const staryu = pokemon('Staryu');
  game.p1.zones.bench.push(staryu);
  game.p2.zones.active.push(pokemon('Charmander'));
  const defender = trainer('Defender', DEFENDER);
  game.state.players.p1.zones.hand.push(defender);
  const res = run(game, {
    type: 'playTrainer',
    payload: { instanceId: defender.instanceId, targetInstanceId: staryu.instanceId },
    playerId: 'p1',
  });
  assert.equal(res.pendingChoice, null);
  assert.equal(found(game, 'p1', defender)?.attachedTo, staryu.instanceId);
  assert.ok(has(game, 'p1', 'bench', defender));
});

// pkmn-wotc-cards: Chansey [Base Set 3] "Double-edge : 80"
const DOUBLE_EDGE = { name: 'Double-edge', cost: [], damage: '80', text: 'Chansey does 80 damage to itself.' };

test('Defender (base1-80): reduces the attacker’s own recoil ("damage done to that Pokémon by attacks")', () => {
  const game = setup();
  const chansey = pokemon('Chansey', { attacks: [DOUBLE_EDGE] });
  game.p1.zones.active.push(chansey);
  game.p2.zones.active.push(pokemon('Charmander'));
  play(game, 'p1', trainer('Defender', DEFENDER));
  attack(game, 'p1');
  assert.equal(zone(game, 'p2', 'active')[0].damage, 80);
  assert.equal(found(game, 'p1', chansey).damage, 60);
});

test('Charity (gym1-99): the attacker reduces the damage by a chosen amount; Charity returns to hand', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Kyurem ex'));
  game.p2.zones.active.push(pokemon('Charmander'));
  const charity = trainer('Charity', CHARITY);
  play(game, 'p1', charity);
  const res = attack(game, 'p1');
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.player, 'p1');
  const names = res.pendingChoice.options.map((o) => o.name);
  assert.deepEqual(names, ['Do not reduce', 'Reduce by 10', 'Reduce by 20', 'Reduce by 30', 'Reduce by 40', 'Reduce by 50']);
  choose(game, res, [res.pendingChoice.options.find((o) => o.name === 'Reduce by 30').instanceId]);
  assert.equal(zone(game, 'p2', 'active')[0].damage, 20);
  assert.ok(has(game, 'p1', 'hand', charity), 'returned to hand at end of turn');
});

// TCGdex gym1-18
const MISTY =
  "Discard 2 of the other cards in your hand in order to play this card. If this turn's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), and if the attacking Pokémon has Misty in its name, the attack does 20 more damage to the Defending Pokémon.";

test("Charity (gym1-99): reduces up to all of the damage, Misty gym1-18's +20 included", () => {
  const game = setup();
  game.p1.zones.active.push(pokemon("Misty's Seel"));
  game.p2.zones.active.push(pokemon('Charmander'));
  play(game, 'p1', trainer('Charity', CHARITY));
  zone(game, 'p1', 'hand').push(card({ name: 'Cost 1' }), card({ name: 'Cost 2' }));
  const paid = play(game, 'p1', trainer('Misty', MISTY));
  choose(game, paid, paid.pendingChoice.options.slice(0, 2).map((o) => o.instanceId));
  const res = attack(game, 'p1');
  const names = res.pendingChoice.options.map((o) => o.name);
  assert.equal(names.at(-1), 'Reduce by 70', '50 Slash + 20 Misty');
  choose(game, res, [res.pendingChoice.options.at(-1).instanceId]);
  assert.equal(zone(game, 'p2', 'active')[0].damage || 0, 0);
});

test('Magnifier (neo4-101): Resistance is not applied', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Kyurem ex'));
  game.p2.zones.active.push(pokemon('Charmander', { resistance: { type: 'Water', value: -30 } }));
  const magnifier = trainer('Magnifier', MAGNIFIER);
  play(game, 'p1', magnifier);
  attack(game, 'p1');
  assert.equal(zone(game, 'p2', 'active')[0].damage, 50);
  assert.ok(has(game, 'p1', 'discard', magnifier));
});

test('Magnifier: without it Resistance applies (control)', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Kyurem ex'));
  game.p2.zones.active.push(pokemon('Charmander', { resistance: { type: 'Water', value: -30 } }));
  attack(game, 'p1');
  assert.equal(zone(game, 'p2', 'active')[0].damage, 20);
});

test("Sabrina's ESP (gym1-117): only a Sabrina's Pokémon; offers one re-flip of the attack's coins", () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Dragonair', { attacks: [SLAM] }));
  game.p2.zones.active.push(pokemon('Charmander'));
  const esp = trainer("Sabrina's ESP", SABRINAS_ESP);
  game.p1.zones.hand.push(esp);
  const refused = applyCommand(
    game.state,
    { type: 'moveCard', payload: { instanceId: esp.instanceId, from: 'hand', to: 'board' }, playerId: 'p1' },
    game.rng
  );
  assert.match(String(refused.error), /no Pokémon it can be attached to/);


  const ready = setup();
  const abra = pokemon("Sabrina's Abra", { attacks: [SLAM] });
  ready.p1.zones.active.push(abra);
  ready.p1.zones.bench.push(pokemon('Dragonair', { attacks: [SLAM] }));
  ready.p2.zones.active.push(pokemon('Charmander'));
  const esp2 = trainer("Sabrina's ESP", SABRINAS_ESP);
  play(ready, 'p1', esp2);
  assert.equal(found(ready, 'p1', esp2)?.attachedTo, abra.instanceId, 'the only Sabrina Pokémon');
  const res = attack(ready, 'p1');
  assert.ok(res.pendingChoice, 're-flip offered');
  assert.match(res.pendingChoice.prompt, /Sabrina's ESP/);
  const after = choose(ready, res, [2]);
  assert.ok(after.events.some((e) => e.type === 'attackCoinFlipped' && e.reflip === true));
  assert.ok(has(ready, 'p1', 'discard', esp2), 'discarded at end of turn');
});

test("Brock's Protection (gym2-101): the opponent's Trainer and attack can't remove its Energy", () => {
  const game = setup();
  const geodude = pokemon("Brock's Geodude");
  const e = energy();
  e.attachedTo = geodude.instanceId;
  game.p1.zones.active.push(geodude, e);
  game.p2.zones.active.push(pokemon("Team Rocket's Tyranitar", { attacks: [DEMOLITION_TACKLE] }));
  const brock = trainer("Brock's Protection", BROCKS_PROTECTION);
  play(game, 'p1', brock);
  assert.equal(found(game, 'p1', brock)?.attachedTo, geodude.instanceId);
  pass(game, 'p1');

  play(game, 'p2', trainer('Energy Removal', ENERGY_REMOVAL));
  assert.ok(found(game, 'p1', e), 'Energy Removal found nothing to take');
  attack(game, 'p2');
  assert.ok(found(game, 'p1', e), 'Demolition Tackle could not discard it');
  assert.ok(found(game, 'p1', brock), "Brock's Protection has no discard timer");
});

test("Koga's Ninja Trick (gym2-115): the defending player switches before damage; the card is discarded on the Bench", () => {
  const game = setup();
  const ekans = pokemon("Koga's Ekans");
  const bench = pokemon('Zubat');
  game.p1.zones.active.push(ekans);
  game.p1.zones.bench.push(bench);
  game.p2.zones.active.push(pokemon('Kyurem ex'));
  const trick = trainer("Koga's Ninja Trick", KOGAS_NINJA_TRICK);
  play(game, 'p1', trick);
  assert.equal(found(game, 'p1', trick)?.attachedTo, ekans.instanceId);
  pass(game, 'p1');

  const res = attack(game, 'p2');
  assert.ok(res.pendingChoice);
  assert.equal(res.pendingChoice.player, 'p1');
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [bench.instanceId]);
  choose(game, res, [bench.instanceId]);
  assert.equal(found(game, 'p1', bench).damage, 50, 'the switched-in Pokémon takes the attack');
  assert.equal(found(game, 'p1', ekans).damage || 0, 0);
  assert.ok(has(game, 'p1', 'discard', trick), 'went to the Bench, so it is discarded');
});

test("Koga's Ninja Trick: declining keeps the Pokémon Active and the card attached", () => {
  const game = setup();
  const ekans = pokemon("Koga's Ekans");
  game.p1.zones.active.push(ekans);
  game.p1.zones.bench.push(pokemon('Zubat'));
  game.p2.zones.active.push(pokemon('Kyurem ex'));
  const trick = trainer("Koga's Ninja Trick", KOGAS_NINJA_TRICK);
  play(game, 'p1', trick);
  pass(game, 'p1');
  choose(game, attack(game, 'p2'), []);
  assert.equal(found(game, 'p1', ekans).damage, 50);
  assert.ok(found(game, 'p1', trick));
});

test("Koga's Ninja Trick: can't be played without a Koga's Pokémon in the Active Spot", () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Zubat'));
  game.p1.zones.bench.push(pokemon("Koga's Ekans"));
  game.p2.zones.active.push(pokemon('Kyurem ex'));
  const trick = trainer("Koga's Ninja Trick", KOGAS_NINJA_TRICK);
  game.p1.zones.hand.push(trick);
  const res = applyCommand(
    game.state,
    { type: 'moveCard', payload: { instanceId: trick.instanceId, from: 'hand', to: 'board' }, playerId: 'p1' },
    game.rng
  );
  assert.match(String(res.error), /no Pokémon it can be attached to/);
  assert.ok(has({ state: res.state }, 'p1', 'hand', trick));
});
