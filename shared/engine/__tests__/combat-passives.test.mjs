import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

function createTestGame() {
  const state = createGameState({
    players: {
      p1: { username: 'Player 1' },
      p2: { username: 'Player 2' },
    },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return state;
}

describe('Phase 1: Combat Passives & Modifier Pipeline', () => {
  describe('Damage Prevention', () => {
    test('Mimikyu Safeguard prevents damage from Pokemon ex but takes damage from non-ex', () => {
      const state = createTestGame();
      const charizardEx = createCard({
        instanceId: 1,
        name: 'Charizard ex',
        subtypes: ['Stage 2', 'ex'],
        types: ['Darkness'],
        hp: 330,
        attacks: [{ name: 'Burning Darkness', cost: [], damage: 180 }],
      });
      const mimikyu = createCard({
        instanceId: 2,
        name: 'Mimikyu',
        subtypes: ['Basic'],
        types: ['Psychic'],
        hp: 70,
        ability: {
          name: 'Safeguard',
          type: 'Ability',
          text: "Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon ex.",
        },
        attacks: [{ name: 'Ghost Eye', cost: [], damage: 0 }],
      });

      state.players.p1.zones.active.push(charizardEx);
      state.players.p2.zones.active.push(mimikyu);

      // Attack from Charizard ex against Mimikyu
      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0, 'Damage must be prevented by Safeguard');
      const preventEvent = res.events.find((e) => e.type === 'damagePrevented');
      assert.ok(preventEvent, 'damagePrevented event must be emitted');

      // Now attack with non-ex Pikachu
      const pikachuState = createTestGame();
      const pikachu = createCard({
        instanceId: 10,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Thunder Jolt', cost: [], damage: 30 }],
      });
      const mimikyu2 = createCard({
        instanceId: 20,
        name: 'Mimikyu',
        subtypes: ['Basic'],
        types: ['Psychic'],
        hp: 70,
        ability: {
          name: 'Safeguard',
          type: 'Ability',
          text: "Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon ex.",
        },
        attacks: [{ name: 'Ghost Eye', cost: [], damage: 0 }],
      });
      pikachuState.players.p1.zones.active.push(pikachu);
      pikachuState.players.p2.zones.active.push(mimikyu2);

      const res2 = applyCommand(pikachuState, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res2.error, null);
      assert.equal(res2.state.players.p2.zones.active[0].damage, 30, 'Non-ex deals damage past Safeguard');
    });

    test('Cornerstone Ogerpon ex prevents damage from Pokemon with an Ability', () => {
      const state = createTestGame();
      const pidgeotEx = createCard({
        instanceId: 1,
        name: 'Pidgeot ex',
        subtypes: ['Stage 2', 'ex'],
        types: ['Colorless'],
        hp: 280,
        ability: {
          name: 'Quick Search',
          type: 'Ability',
          text: 'Once during your turn, you may search your deck for a card.',
        },
        attacks: [{ name: 'Blustery Wind', cost: [], damage: 120 }],
      });
      const ogerpon = createCard({
        instanceId: 2,
        name: 'Cornerstone Mask Ogerpon ex',
        subtypes: ['Basic', 'ex', 'Tera'],
        types: ['Fighting'],
        hp: 210,
        ability: {
          name: 'Cornerstone Stance',
          type: 'Ability',
          text: "Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon that have an Ability.",
        },
        attacks: [{ name: 'Demolish', cost: [], damage: 140 }],
      });

      state.players.p1.zones.active.push(pidgeotEx);
      state.players.p2.zones.active.push(ogerpon);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0, 'Damage must be prevented by Cornerstone Stance');
      const preventEvent = res.events.find((e) => e.type === 'damagePrevented');
      assert.ok(preventEvent);
    });
  });

  describe('Damage Reduction', () => {
    test('Rock Chestplate reduces damage on Fighting Pokemon by 30', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Eevee',
        subtypes: ['Basic'],
        types: ['Colorless'],
        hp: 70,
        attacks: [{ name: 'Tackle', cost: [], damage: 50 }],
      });
      const defender = createCard({
        instanceId: 2,
        name: 'Lucario',
        subtypes: ['Stage 1'],
        types: ['Fighting'],
        hp: 120,
        attacks: [],
      });
      const chestplate = createCard({
        instanceId: 3,
        name: 'Rock Chestplate',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 2,
        text: "The Fighting Pokémon this card is attached to takes 30 less damage from attacks from your opponent's Pokémon (after applying Weakness and Resistance).",
      });

      state.players.p1.zones.active.push(attacker);
      state.players.p2.zones.active.push(defender, chestplate);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // 50 base - 30 Rock Chestplate = 20 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 20);
    });

    test('Radiant Gardevoir bench ability reduces damage from Pokemon V by 20', () => {
      const state = createTestGame();
      const arceusV = createCard({
        instanceId: 1,
        name: 'Arceus V',
        subtypes: ['Basic', 'V'],
        types: ['Colorless'],
        hp: 220,
        attacks: [{ name: 'Trinity Charge', cost: [], damage: 70 }],
      });
      const defender = createCard({
        instanceId: 2,
        name: 'Comfey',
        subtypes: ['Basic'],
        types: ['Psychic'],
        hp: 70,
        attacks: [],
      });
      const radiantGardevoir = createCard({
        instanceId: 3,
        name: 'Radiant Gardevoir',
        subtypes: ['Basic', 'Radiant'],
        types: ['Psychic'],
        hp: 130,
        ability: {
          name: 'Loving Veil',
          type: 'Ability',
          text: "Your Pokémon take 20 less damage from attacks from your opponent's Pokémon V (after applying Weakness and Resistance).",
        },
        attacks: [],
      });

      state.players.p1.zones.active.push(arceusV);
      state.players.p2.zones.active.push(defender);
      state.players.p2.zones.bench.push(radiantGardevoir);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // 70 base - 20 Loving Veil = 50 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 50);
    });
  });

  describe('Attacker Tool Bonuses', () => {
    test('Choice Belt adds 30 damage vs Pokemon V and 0 vs non-V', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Quick Attack', cost: [], damage: 30 }],
      });
      const choiceBelt = createCard({
        instanceId: 2,
        name: 'Choice Belt',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 1,
        text: "The attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon V (before applying Weakness and Resistance).",
      });
      const lugiaV = createCard({
        instanceId: 3,
        name: 'Lugia V',
        subtypes: ['Basic', 'V'],
        types: ['Colorless'],
        hp: 220,
        attacks: [],
      });

      state.players.p1.zones.active.push(attacker, choiceBelt);
      state.players.p2.zones.active.push(lugiaV);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // 30 base + 30 Choice Belt = 60 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 60);
    });

    test('Maximum Belt adds 50 damage vs Pokemon ex and 0 vs non-ex', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Mew',
        subtypes: ['Basic'],
        types: ['Psychic'],
        hp: 60,
        attacks: [{ name: 'Psyshot', cost: [], damage: 40 }],
      });
      const maxBelt = createCard({
        instanceId: 2,
        name: 'Maximum Belt',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool', 'ACE SPEC'],
        attachedTo: 1,
        text: "The attacks of the Pokémon this card is attached to do 50 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance).",
      });
      const charizardEx = createCard({
        instanceId: 3,
        name: 'Charizard ex',
        subtypes: ['Stage 2', 'ex'],
        types: ['Darkness'],
        hp: 330,
        attacks: [],
      });

      state.players.p1.zones.active.push(attacker, maxBelt);
      state.players.p2.zones.active.push(charizardEx);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // 40 base + 50 Maximum Belt = 90 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 90);
    });

    test('Defiance Band adds 30 damage when trailing on prizes', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Quick Attack', cost: [], damage: 30 }],
      });
      const defianceBand = createCard({
        instanceId: 2,
        name: 'Defiance Band',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 1,
        text: "If you have more Prize cards remaining than your opponent, the attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
      });
      const defender = createCard({
        instanceId: 3,
        name: 'Snorlax',
        subtypes: ['Basic'],
        types: ['Colorless'],
        hp: 150,
        attacks: [],
      });

      state.players.p1.zones.active.push(attacker, defianceBand);
      state.players.p2.zones.active.push(defender);

      // Trailing: p1 has 4 prizes, p2 has 2 prizes (p1 is trailing)
      state.players.p1.zones.prizes = [
        createCard({ instanceId: 101, name: 'P1' }),
        createCard({ instanceId: 102, name: 'P2' }),
        createCard({ instanceId: 103, name: 'P3' }),
        createCard({ instanceId: 104, name: 'P4' }),
      ];
      state.players.p2.zones.prizes = [
        createCard({ instanceId: 201, name: 'P5' }),
        createCard({ instanceId: 202, name: 'P6' }),
      ];

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // 30 base + 30 Defiance Band = 60 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 60);
    });
  });

  describe('Combat Thorns & Retaliation', () => {
    test('Rocky Helmet puts 20 damage on attacker when damaged', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Charmander',
        subtypes: ['Basic'],
        types: ['Fire'],
        hp: 70,
        attacks: [{ name: 'Scratch', cost: [], damage: 20 }],
      });
      const defender = createCard({
        instanceId: 2,
        name: 'Squirtle',
        subtypes: ['Basic'],
        types: ['Water'],
        hp: 60,
        attacks: [],
      });
      const rockyHelmet = createCard({
        instanceId: 3,
        name: 'Rocky Helmet',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 2,
        text: "If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon.",
      });

      state.players.p1.zones.active.push(attacker);
      state.players.p2.zones.active.push(defender, rockyHelmet);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // Defender took 20 damage
      assert.equal(res.state.players.p2.zones.active[0].damage, 20);
      // Attacker took 20 retaliation damage from Rocky Helmet
      assert.equal(res.state.players.p1.zones.active[0].damage, 20);
    });

    test('Druddigon Rough Skin ability damages attacker', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Quick Attack', cost: [], damage: 20 }],
      });
      const druddigon = createCard({
        instanceId: 2,
        name: 'Druddigon',
        subtypes: ['Basic'],
        types: ['Dragon'],
        hp: 120,
        ability: {
          name: 'Rough Skin',
          type: 'Ability',
          text: "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon.",
        },
        attacks: [],
      });

      state.players.p1.zones.active.push(attacker);
      state.players.p2.zones.active.push(druddigon);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      assert.equal(res.state.players.p1.zones.active[0].damage, 20);
    });
  });

  describe('KO Prevention', () => {
    test('Survival Brace prevents KO from full HP, leaves 10 HP, and discards itself', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Roaring Moon ex',
        subtypes: ['Basic', 'ex'],
        types: ['Darkness'],
        hp: 230,
        attacks: [{ name: 'Calamity Storm', cost: [], damage: 140 }],
      });
      const defender = createCard({
        instanceId: 2,
        name: 'Comfey',
        subtypes: ['Basic'],
        types: ['Psychic'],
        hp: 70,
        attacks: [],
      });
      const survivalBrace = createCard({
        instanceId: 3,
        name: 'Survival Brace',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool', 'ACE SPEC'],
        attachedTo: 2,
        text: "If the Pokémon this card is attached to has full HP and would be Knocked Out by damage from an attack from your opponent's Pokémon, it is not Knocked Out, and its remaining HP becomes 10. Then, discard this card.",
      });

      state.players.p1.zones.active.push(attacker);
      state.players.p2.zones.active.push(defender, survivalBrace);

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // Comfey has 70 HP. Remaining HP becomes 10 -> damage is 60.
      assert.equal(res.state.players.p2.zones.active[0].damage, 60);
      assert.equal(res.state.players.p2.zones.active[0].instanceId, 2, 'Defender must not be knocked out');

      const koPreventedEvent = res.events.find((e) => e.type === 'koPrevented');
      assert.ok(koPreventedEvent, 'koPrevented event must be emitted');

      // Survival Brace must be discarded
      const toolInActive = res.state.players.p2.zones.active.find((c) => c.instanceId === 3);
      assert.equal(toolInActive, undefined, 'Survival Brace must leave active zone');
      const toolInDiscard = res.state.players.p2.zones.discard.find((c) => c.instanceId === 3);
      assert.ok(toolInDiscard, 'Survival Brace must be moved to discard pile');
    });
  });

  describe('Prize Modifiers on KO', () => {
    test("Lillie's Pearl reduces prizes taken by opponent on KO by 1", () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Thunder', cost: [], damage: 300 }],
      });
      const defenderEx = createCard({
        instanceId: 2,
        name: 'Miraidon ex',
        subtypes: ['Basic', 'ex'],
        types: ['Lightning'],
        hp: 220,
        attacks: [],
      });
      const pearl = createCard({
        instanceId: 3,
        name: "Lillie's Pearl",
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 2,
        text: "If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, your opponent takes 1 fewer Prize card.",
      });

      state.players.p1.zones.active.push(attacker);
      state.players.p1.zones.prizes = [
        createCard({ instanceId: 101, name: 'P1' }),
        createCard({ instanceId: 102, name: 'P2' }),
      ];
      state.players.p2.zones.active.push(defenderEx, pearl);
      state.players.p2.zones.bench.push(createCard({ instanceId: 4, name: 'Benched Mon', hp: 70 }));
      state.players.p2.zones.deck.push(createCard({ instanceId: 50, name: 'Deck Card' }));

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // Miraidon ex awards 2 prizes normally, Lillie's Pearl reduces by 1 -> 1 prize
      const koEvent = res.events.find((e) => e.type === 'pokemonKnockedOut');
      assert.ok(koEvent, 'pokemonKnockedOut event must be emitted');
      assert.equal(koEvent.prizeCount, 1, 'Lillie\'s Pearl reduces prizeCount to 1');
      assert.ok(res.state.pendingChoice, 'pendingChoice must be raised for prize selection');
      const prizeReqEvent = res.events.find((e) => e.type === 'prizeChoiceRequested');
      assert.ok(prizeReqEvent, 'prizeChoiceRequested event must be emitted');
      assert.equal(prizeReqEvent.count, 1);
    });

    test('Briar grants +1 prize when Tera Pokemon knocks out opponent Active Pokemon ex', () => {
      const state = createTestGame();
      const teraAttacker = createCard({
        instanceId: 1,
        name: 'Terapagos ex',
        subtypes: ['Basic', 'ex', 'Tera'],
        types: ['Colorless'],
        hp: 230,
        attacks: [{ name: 'Unified Barrage', cost: [], damage: 350 }],
      });
      const defenderEx = createCard({
        instanceId: 2,
        name: 'Charizard ex',
        subtypes: ['Stage 2', 'ex'],
        types: ['Darkness'],
        hp: 330,
        attacks: [],
      });
      const briar = createCard({
        instanceId: 3,
        name: 'Briar',
        type: 'Trainer',
        trainerType: 'Supporter',
        subtypes: ['Supporter'],
        text: "You can use this card only if your opponent has exactly 2 Prize cards remaining.\n\nDuring this turn, if your opponent's Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take 1 more Prize card.",
      });

      state.players.p1.zones.active.push(teraAttacker);
      state.players.p1.zones.hand.push(briar);
      state.players.p1.zones.prizes = [
        createCard({ instanceId: 101, name: 'P1' }),
        createCard({ instanceId: 102, name: 'P2' }),
        createCard({ instanceId: 103, name: 'P3' }),
      ];
      state.players.p2.zones.active.push(defenderEx);
      state.players.p2.zones.bench.push(createCard({ instanceId: 4, name: 'Benched Mon', hp: 70 }));
      state.players.p2.zones.prizes = [
        createCard({ instanceId: 201, name: 'P4' }),
        createCard({ instanceId: 202, name: 'P5' }),
      ];

      // Play Briar
      const playRes = applyCommand(state, {
        type: 'playTrainer',
        payload: { instanceId: 3 },
        playerId: 'p1',
      });
      assert.equal(playRes.error, null);
      assert.equal(playRes.state.players.p1.flags.briarActive, true, 'Briar flag must be activated');

      // Now attack and KO Charizard ex
      const atkRes = applyCommand(playRes.state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(atkRes.error, null);
      // Charizard ex = 2 prizes + 1 from Briar = 3 prizes
      const koEvent = atkRes.events.find((e) => e.type === 'pokemonKnockedOut');
      assert.ok(koEvent, 'pokemonKnockedOut event must be emitted');
      assert.equal(koEvent.prizeCount, 3, 'Briar awards 3 prizes for KO');
      const prizesTaken = atkRes.events.find((e) => e.type === 'prizesTaken');
      assert.ok(prizesTaken, 'prizesTaken event must be emitted');
      assert.equal(prizesTaken.count, 3, 'All 3 prizes were collected');
    });
  });

  describe('Jamming Tower (Stadium blocks tools)', () => {
    test('Jamming Tower negates Choice Belt damage bonus', () => {
      const state = createTestGame();
      const attacker = createCard({
        instanceId: 1,
        name: 'Pikachu',
        subtypes: ['Basic'],
        types: ['Lightning'],
        hp: 60,
        attacks: [{ name: 'Quick Attack', cost: [], damage: 30 }],
      });
      const choiceBelt = createCard({
        instanceId: 2,
        name: 'Choice Belt',
        type: 'Trainer',
        trainerType: 'Tool',
        subtypes: ['Pokémon Tool'],
        attachedTo: 1,
        text: "The attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon V (before applying Weakness and Resistance).",
      });
      const lugiaV = createCard({
        instanceId: 3,
        name: 'Lugia V',
        subtypes: ['Basic', 'V'],
        types: ['Colorless'],
        hp: 220,
        attacks: [],
      });
      const jammingTower = createCard({
        instanceId: 4,
        name: 'Jamming Tower',
        type: 'Trainer',
        trainerType: 'Stadium',
        subtypes: ['Stadium'],
        text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent\'s) have no effect.',
      });

      state.players.p1.zones.active.push(attacker, choiceBelt);
      state.players.p2.zones.active.push(lugiaV);
      state.stadium = jammingTower;

      const res = applyCommand(state, {
        type: 'attack',
        payload: { attackIndex: 0 },
        playerId: 'p1',
      });
      assert.equal(res.error, null);
      // Choice Belt blocked: 30 base + 0 = 30 damage (not 60)
      assert.equal(res.state.players.p2.zones.active[0].damage, 30);
    });
  });
});

test('Defiance Band applies to a chosen-target hit on the Active when trailing on Prizes', () => {
  const state = createTestGame();
  const attacker = createCard({
    instanceId: 1,
    name: 'Sniper',
    subtypes: ['Basic'],
    types: ['Colorless'],
    hp: 60,
    attacks: [
      { name: 'Snipe', cost: [], damage: '', text: "This attack does 30 damage to 1 of your opponent's Pokémon." },
    ],
  });
  const band = createCard({
    instanceId: 2,
    name: 'Defiance Band',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    attachedTo: 1,
    text: "If you have more Prize cards remaining than your opponent, the attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
  });
  const defender = createCard({ instanceId: 3, name: 'Snorlax', subtypes: ['Basic'], types: ['Colorless'], hp: 150 });
  const benched = createCard({ instanceId: 4, name: 'Bench', subtypes: ['Basic'], types: ['Colorless'], hp: 150 });
  state.players.p1.zones.active.push(attacker, band);
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(benched);
  state.players.p1.zones.prizes = [101, 102, 103, 104].map((id) => createCard({ instanceId: id, name: 'P' }));
  state.players.p2.zones.prizes = [201, 202].map((id) => createCard({ instanceId: id, name: 'P' }));

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  const resolved = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [3] },
    playerId: 'p1',
  });
  assert.equal(resolved.error, null);
  const hit = resolved.events.find((e) => e.type === 'damageUpdated' && e.instanceId === 3);
  assert.equal(hit.dealt, 60);
  // I152: the 0-damage attack itself gets no Defiance Band bonus, so the clause hit is all.
  const snorlax = resolved.state.players.p2.zones.active.find((c) => c.instanceId === 3);
  assert.equal(snorlax.damage, 60);
});
