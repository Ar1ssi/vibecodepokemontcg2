import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { returnEnergyBonusClause } from '../rules/damage-parser.mjs';

function createTestGame() {
  const state = createGameState({
    id: 'test-game',
    seed: 42,
    players: {
      p1: {
        id: 'p1',
        name: 'Player 1',
        zones: {
          active: [],
          bench: [],
          hand: [],
          deck: [
            createCard({
              instanceId: 101,
              id: 'deck-1',
              name: 'Charmander',
              stage: 'Basic',
              supertype: 'Pokémon',
            }),
            createCard({
              instanceId: 102,
              id: 'deck-2',
              name: 'Squirtle',
              stage: 'Basic',
              supertype: 'Pokémon',
            }),
            createCard({
              instanceId: 103,
              id: 'deck-3',
              name: 'Bulbasaur',
              stage: 'Basic',
              supertype: 'Pokémon',
            }),
          ],
          discard: [],
          prizes: [
            createCard({ instanceId: 201, id: 'prize-1', name: 'Prize Card' }),
          ],
        },
        flags: {},
      },
      p2: {
        id: 'p2',
        name: 'Player 2',
        zones: {
          active: [],
          bench: [],
          hand: [],
          deck: [
            createCard({ instanceId: 301, id: 'deck-p2', name: 'P2 Deck' }),
          ],
          discard: [],
          prizes: [
            createCard({ instanceId: 401, id: 'prize-p2', name: 'Prize P2' }),
          ],
        },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

describe('Phase 3: Secondary Attack Effects & Costs', () => {
  describe('Attack Energy Discard', () => {
    it('Discards specific typed energy (e.g. 2 Fire Energy) on attack', () => {
      const state = createTestGame();
      const charizard = createCard({
        instanceId: 1,
        id: 'charizard',
        name: 'Charizard',
        supertype: 'Pokémon',
        hp: 170,
        attacks: [
          {
            name: 'Fire Blast',
            cost: ['Fire', 'Fire', 'Colorless'],
            damage: 120,
            text: 'Discard 2 Fire Energy from this Pokémon.',
          },
        ],
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 200,
      });

      const fire1 = createCard({
        instanceId: 11,
        id: 'fe-1',
        name: 'Fire Energy',
        supertype: 'Energy',
        energyType: 'Fire',
        attachedTo: 1,
      });
      const fire2 = createCard({
        instanceId: 12,
        id: 'fe-2',
        name: 'Fire Energy',
        supertype: 'Energy',
        energyType: 'Fire',
        attachedTo: 1,
      });
      const water1 = createCard({
        instanceId: 13,
        id: 'we-1',
        name: 'Water Energy',
        supertype: 'Energy',
        energyType: 'Water',
        attachedTo: 1,
      });

      state.players.p1.zones.active = [charizard, fire1, fire2, water1];
      state.players.p2.zones.active = [defender];

      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res.error, null);
      // Both fire energies should be discarded to discard pile
      assert.equal(res.state.players.p1.zones.discard.length, 2);
      assert.equal(
        res.state.players.p1.zones.discard.every(
          (c) => c.energyType === 'Fire'
        ),
        true
      );
      // Water energy should remain attached in active zone
      const remainingActive = res.state.players.p1.zones.active;
      assert.equal(remainingActive.length, 2);
      assert.equal(
        remainingActive.some((c) => c.instanceId === water1.instanceId),
        true
      );
    });

    it('Discards all energy when text specifies Discard all Energy', () => {
      const state = createTestGame();
      const zapdos = createCard({
        instanceId: 1,
        id: 'zapdos',
        name: 'Zapdos',
        supertype: 'Pokémon',
        hp: 120,
        attacks: [
          {
            name: 'Thunder',
            cost: ['Lightning', 'Lightning', 'Colorless'],
            damage: 100,
            text: 'Discard all Energy attached to this Pokémon.',
          },
        ],
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 200,
      });

      const l1 = createCard({
        instanceId: 11,
        id: 'le-1',
        name: 'Lightning Energy',
        supertype: 'Energy',
        energyType: 'Lightning',
        attachedTo: 1,
      });
      const l2 = createCard({
        instanceId: 12,
        id: 'le-2',
        name: 'Lightning Energy',
        supertype: 'Energy',
        energyType: 'Lightning',
        attachedTo: 1,
      });
      const l3 = createCard({
        instanceId: 13,
        id: 'le-3',
        name: 'Lightning Energy',
        supertype: 'Energy',
        energyType: 'Lightning',
        attachedTo: 1,
      });

      state.players.p1.zones.active = [zapdos, l1, l2, l3];
      state.players.p2.zones.active = [defender];

      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res.error, null);
      assert.equal(res.state.players.p1.zones.discard.length, 3);
      assert.equal(res.state.players.p1.zones.active.length, 1);
    });
  });

  describe('Next-Turn Locks', () => {
    it('Locks attacker from attacking during its next turn', () => {
      const state = createTestGame();
      const dialga = createCard({
        instanceId: 1,
        id: 'dialga',
        name: 'Dialga',
        supertype: 'Pokémon',
        hp: 130,
        attacks: [
          {
            name: 'Roar of Time',
            cost: ['Metal', 'Colorless'],
            damage: 160,
            text: "During your next turn, this Pokémon can't attack.",
          },
        ],
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 300,
      });
      const energy1 = createCard({
        instanceId: 11,
        id: 'm-1',
        name: 'Metal Energy',
        supertype: 'Energy',
        energyType: 'Metal',
        attachedTo: 1,
      });
      const energy2 = createCard({
        instanceId: 12,
        id: 'c-1',
        name: 'Colorless Energy',
        supertype: 'Energy',
        energyType: 'Colorless',
        attachedTo: 1,
      });

      state.players.p1.zones.active = [dialga, energy1, energy2];
      state.players.p2.zones.active = [defender];

      // Turn 2: Dialga attacks
      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });
      assert.equal(res1.error, null);
      assert.equal(res1.state.turn.number, 3);
      assert.equal(res1.state.turn.player, 'p2');

      // Turn 3: P2 passes
      const res2 = applyCommand(res1.state, {
        type: 'pass',
        playerId: 'p2',
      });
      assert.equal(res2.error, null);
      assert.equal(res2.state.turn.number, 4);
      assert.equal(res2.state.turn.player, 'p1');

      // Turn 4: P1 tries to attack with Dialga again -> blocked!
      const res3 = applyCommand(res2.state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });
      assert.ok(res3.error);
      assert.match(res3.error, /can't attack during this turn/);
    });

    it('Locks attacker from using a specific attack (e.g. Brave Blade) during its next turn', () => {
      const state = createTestGame();
      const zacian = createCard({
        instanceId: 1,
        id: 'zacian',
        name: 'Zacian V',
        supertype: 'Pokémon',
        hp: 220,
        attacks: [
          {
            name: 'Slash',
            cost: ['Colorless'],
            damage: 30,
            text: '',
          },
          {
            name: 'Brave Blade',
            cost: ['Metal', 'Metal', 'Metal'],
            damage: 230,
            text: "During your next turn, this Pokémon can't use Brave Blade.",
          },
        ],
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 300,
      });
      const m1 = createCard({
        instanceId: 11,
        id: 'm-1',
        name: 'Metal Energy',
        supertype: 'Energy',
        energyType: 'Metal',
        attachedTo: 1,
      });
      const m2 = createCard({
        instanceId: 12,
        id: 'm-2',
        name: 'Metal Energy',
        supertype: 'Energy',
        energyType: 'Metal',
        attachedTo: 1,
      });
      const m3 = createCard({
        instanceId: 13,
        id: 'm-3',
        name: 'Metal Energy',
        supertype: 'Energy',
        energyType: 'Metal',
        attachedTo: 1,
      });

      state.players.p1.zones.active = [zacian, m1, m2, m3];
      state.players.p2.zones.active = [defender];

      // Turn 2: Zacian uses Brave Blade
      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 1 },
      });
      assert.equal(res1.error, null);

      // Turn 3: P2 passes
      const res2 = applyCommand(res1.state, {
        type: 'pass',
        playerId: 'p2',
      });
      assert.equal(res2.error, null);
      assert.equal(res2.state.turn.number, 4);
      assert.equal(res2.state.turn.player, 'p1');

      // Turn 4: Brave Blade is blocked
      const resBrave = applyCommand(res2.state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 1 },
      });
      assert.ok(resBrave.error);
      assert.match(resBrave.error, /can't use Brave Blade during this turn/i);

      // Turn 4: Slash is allowed!
      const resSlash = applyCommand(res2.state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });
      assert.equal(resSlash.error, null);
    });

    it('Locks opponent active from retreating during opponent next turn', () => {
      const state = createTestGame();
      const ariados = createCard({
        instanceId: 1,
        id: 'ariados',
        name: 'Ariados',
        supertype: 'Pokémon',
        hp: 90,
        attacks: [
          {
            name: 'Spider Web',
            cost: ['Grass'],
            damage: 20,
            text: "During your opponent's next turn, the Defending Pokémon can't retreat.",
          },
        ],
      });
      const energy1 = createCard({
        instanceId: 11,
        id: 'ge-1',
        name: 'Grass Energy',
        supertype: 'Energy',
        energyType: 'Grass',
        attachedTo: 1,
      });

      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 100,
        retreatCost: 0,
      });
      const defenderBench = createCard({
        instanceId: 3,
        id: 'def-bench',
        name: 'Defender Bench',
        supertype: 'Pokémon',
        hp: 80,
      });

      state.players.p1.zones.active = [ariados, energy1];
      state.players.p2.zones.active = [defender];
      state.players.p2.zones.bench = [defenderBench];

      // Turn 2: Ariados attacks
      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });
      assert.equal(res1.error, null);
      assert.equal(res1.state.turn.number, 3);
      assert.equal(res1.state.turn.player, 'p2');

      // Turn 3: P2 tries to retreat -> blocked!
      const res2 = applyCommand(res1.state, {
        type: 'retreat',
        playerId: 'p2',
        payload: { benchInstanceId: defenderBench.instanceId },
      });
      assert.ok(res2.error);
      assert.match(res2.error, /Defending Pokémon can't retreat/);
    });
  });

  describe('Attack Deck Search', () => {
    it('Triggers pendingChoice on Call for Family and resolves to bench before advancing turn', () => {
      const state = createTestGame();
      const basicSearcher = createCard({
        instanceId: 1,
        id: 'eevee',
        name: 'Eevee',
        supertype: 'Pokémon',
        hp: 60,
        attacks: [
          {
            name: 'Call for Family',
            cost: ['Colorless'],
            damage: 0,
            text: 'Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck.',
          },
        ],
      });
      const cEnergy = createCard({
        instanceId: 11,
        id: 'ce-1',
        name: 'Colorless Energy',
        supertype: 'Energy',
        energyType: 'Colorless',
        attachedTo: 1,
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 100,
      });

      state.players.p1.zones.active = [basicSearcher, cEnergy];
      state.players.p2.zones.active = [defender];

      // Turn 2: Eevee uses Call for Family
      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res1.error, null);
      // Pending choice should be created for searchDeck
      assert.ok(res1.state.pendingChoice, 'pendingChoice must be created');
      assert.equal(res1.state.pendingChoice.source, 'attack');
      assert.equal(res1.state.pendingChoice.player, 'p1');
      // Turn must NOT have advanced yet!
      assert.equal(res1.state.turn.player, 'p1');
      assert.equal(res1.state.turn.number, 2);

      // Now resolveChoice with Charmander (101) and Squirtle (102)
      const res2 = applyCommand(res1.state, {
        type: 'resolveChoice',
        playerId: 'p1',
        payload: {
          choiceId: res1.state.pendingChoice.choiceId,
          selection: [101, 102],
        },
      });

      assert.equal(res2.error, null);
      // Pending choice should now be cleared
      assert.equal(res2.state.pendingChoice, null);
      // The 2 cards should be on P1 bench
      assert.equal(res2.state.players.p1.zones.bench.length, 2);
      assert.equal(
        res2.state.players.p1.zones.bench.some((c) => c.instanceId === 101),
        true
      );
      assert.equal(
        res2.state.players.p1.zones.bench.some((c) => c.instanceId === 102),
        true
      );
      // Turn should now have advanced to P2, turn 3!
      assert.equal(res2.state.turn.player, 'p2');
      assert.equal(res2.state.turn.number, 3);
    });

    it("Thundurus' Charge: offers only the typed Energy (with art) and attaches it to the attacker", () => {
      const state = createTestGame();
      const thundurus = createCard({
        instanceId: 1,
        id: 'thundurus',
        name: 'Thundurus',
        supertype: 'Pokémon',
        hp: 110,
        attacks: [
          {
            name: 'Charge',
            cost: ['Lightning'],
            damage: 0,
            text: 'Search your deck for a Lightning Energy card and attach it to this Pokémon. Shuffle your deck afterward.',
          },
        ],
      });
      const costEnergy = createCard({
        instanceId: 11,
        id: 'le-cost',
        name: 'Lightning Energy',
        supertype: 'Energy',
        energyType: 'Lightning',
        attachedTo: 1,
      });
      const deckLightning = createCard({
        instanceId: 101,
        id: 'le-deck',
        name: 'Lightning Energy',
        supertype: 'Energy',
        type: 'Energy',
        src: 'lightning.png',
      });
      const deckWater = createCard({
        instanceId: 102,
        id: 'we-deck',
        name: 'Water Energy',
        supertype: 'Energy',
        type: 'Energy',
        src: 'water.png',
      });
      const deckTrainer = createCard({
        instanceId: 103,
        id: 'trainer-deck',
        name: 'Ultra Ball',
        supertype: 'Trainer',
        type: 'Trainer',
        src: 'ball.png',
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 100,
      });

      state.players.p1.zones.active = [thundurus, costEnergy];
      state.players.p1.zones.deck = [deckLightning, deckWater, deckTrainer];
      state.players.p2.zones.active = [defender];

      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res1.error, null);
      assert.ok(res1.state.pendingChoice, 'pendingChoice must be created');
      // Only the matching Lightning Energy is offered, and it carries art so the
      // client's carousel (not the face-down fallback grid) opens.
      const options = res1.state.pendingChoice.options;
      assert.equal(options.length, 1);
      assert.equal(options[0].instanceId, 101);
      assert.equal(options[0].src, 'lightning.png');

      const res2 = applyCommand(res1.state, {
        type: 'resolveChoice',
        playerId: 'p1',
        payload: {
          choiceId: res1.state.pendingChoice.choiceId,
          selection: [101],
        },
      });

      assert.equal(res2.error, null);
      assert.equal(res2.state.pendingChoice, null);
      assert.equal(
        res2.state.players.p1.zones.hand.some((c) => c.instanceId === 101),
        false,
        'searched Energy must not go to hand'
      );
      const attached = res2.state.players.p1.zones.active.find(
        (c) => c.instanceId === 101
      );
      assert.ok(attached, 'searched Energy is attached on the active Pokémon');
      assert.equal(attached.attachedTo, 1);
    });

    it('Staged attack search (Basic → Stage 1 → Stage 2) walks one stage per choice', () => {
      const state = createTestGame();
      const searcher = createCard({
        instanceId: 1,
        id: 'searcher',
        name: 'Searcher',
        supertype: 'Pokémon',
        hp: 60,
        attacks: [
          {
            name: 'Evolution Search',
            cost: ['Colorless'],
            damage: 0,
            text: 'Search your deck for a Basic Pokémon, a Stage 1 Pokémon, and a Stage 2 Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.',
          },
        ],
      });
      const cEnergy = createCard({
        instanceId: 11,
        id: 'ce-1',
        name: 'Colorless Energy',
        supertype: 'Energy',
        energyType: 'Colorless',
        attachedTo: 1,
      });
      const basic = createCard({
        instanceId: 101,
        id: 'basic',
        name: 'Charmander',
        supertype: 'Pokémon',
        stage: 'Basic',
        hp: 70,
      });
      const stage1 = createCard({
        instanceId: 102,
        id: 'stage1',
        name: 'Charmeleon',
        supertype: 'Pokémon',
        stage: 'Stage 1',
        hp: 90,
      });
      const stage2 = createCard({
        instanceId: 103,
        id: 'stage2',
        name: 'Charizard',
        supertype: 'Pokémon',
        stage: 'Stage 2',
        hp: 170,
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 100,
      });

      state.players.p1.zones.active = [searcher, cEnergy];
      state.players.p1.zones.deck = [basic, stage1, stage2];
      state.players.p2.zones.active = [defender];

      const res1 = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });
      assert.equal(res1.error, null);
      assert.deepEqual(
        res1.state.pendingChoice.options.map((o) => o.instanceId),
        [101],
        'stage 1 offers only Basic Pokémon'
      );

      const res2 = applyCommand(res1.state, {
        type: 'resolveChoice',
        playerId: 'p1',
        payload: {
          choiceId: res1.state.pendingChoice.choiceId,
          selection: [101],
        },
      });
      assert.equal(res2.error, null);
      assert.deepEqual(
        res2.state.pendingChoice.options.map((o) => o.instanceId),
        [102],
        'stage 2 offers only Stage 1 Pokémon'
      );

      const res3 = applyCommand(res2.state, {
        type: 'resolveChoice',
        playerId: 'p1',
        payload: {
          choiceId: res2.state.pendingChoice.choiceId,
          selection: [102],
        },
      });
      assert.equal(res3.error, null);
      assert.deepEqual(
        res3.state.pendingChoice.options.map((o) => o.instanceId),
        [103],
        'stage 3 offers only Stage 2 Pokémon'
      );

      const res4 = applyCommand(res3.state, {
        type: 'resolveChoice',
        playerId: 'p1',
        payload: {
          choiceId: res3.state.pendingChoice.choiceId,
          selection: [103],
        },
      });
      assert.equal(res4.error, null);
      assert.equal(res4.state.pendingChoice, null, 'sequence finished');
      const handIds = res4.state.players.p1.zones.hand.map((c) => c.instanceId);
      assert.deepEqual(
        [101, 102, 103].every((id) => handIds.includes(id)),
        true,
        'all three picked cards are in hand'
      );
      assert.equal(res4.state.turn.player, 'p2');
      assert.equal(res4.state.turn.number, 3);
    });

    it('Attack deck search raises no choice when no deck card matches the clause', () => {
      const state = createTestGame();
      const thundurus = createCard({
        instanceId: 1,
        id: 'thundurus',
        name: 'Thundurus',
        supertype: 'Pokémon',
        hp: 110,
        attacks: [
          {
            name: 'Charge',
            cost: ['Lightning'],
            damage: 0,
            text: 'Search your deck for a Lightning Energy card and attach it to this Pokémon. Shuffle your deck afterward.',
          },
        ],
      });
      const costEnergy = createCard({
        instanceId: 11,
        id: 'le-cost',
        name: 'Lightning Energy',
        supertype: 'Energy',
        energyType: 'Lightning',
        attachedTo: 1,
      });
      const deckWater = createCard({
        instanceId: 102,
        id: 'we-deck',
        name: 'Water Energy',
        supertype: 'Energy',
        type: 'Energy',
        src: 'water.png',
      });
      const defender = createCard({
        instanceId: 2,
        id: 'def',
        name: 'Defender',
        supertype: 'Pokémon',
        hp: 100,
      });

      state.players.p1.zones.active = [thundurus, costEnergy];
      state.players.p1.zones.deck = [deckWater];
      state.players.p2.zones.active = [defender];

      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res.error, null);
      assert.equal(res.state.pendingChoice, null, 'no matching card → no choice');
      // Attack still resolved and the turn advanced.
      assert.equal(res.state.turn.player, 'p2');
    });
  });

  describe('Mega Greninja ex — Ninja Spinner (optional return Energy)', () => {
    const NINJA_SPINNER = {
      name: 'Ninja Spinner',
      cost: ['Water', 'Water'],
      damage: 120,
      text: 'You may put a {W} Energy attached to this Pokémon into your hand and have this attack do 80 more damage.',
    };

    function ninjaGame({ withWater = true } = {}) {
      const state = createTestGame();
      const greninja = createCard({
        instanceId: 1,
        id: 'mega-greninja',
        name: 'Mega Greninja ex',
        supertype: 'Pokémon',
        hp: 300,
        attacks: [NINJA_SPINNER],
      });
      const water1 = createCard({
        instanceId: 11,
        id: 'we-1',
        name: 'Water Energy',
        supertype: 'Energy',
        energyType: 'Water',
        attachedTo: 1,
      });
      const water2 = createCard({
        instanceId: 12,
        id: 'we-2',
        name: 'Water Energy',
        supertype: 'Energy',
        energyType: 'Water',
        attachedTo: 1,
      });
      const fire = createCard({
        instanceId: 13,
        id: 'fe-1',
        name: 'Fire Energy',
        supertype: 'Energy',
        energyType: 'Fire',
        attachedTo: 1,
      });
      state.players.p1.zones.active = withWater
        ? [greninja, water1, water2, fire]
        : [greninja, fire];
      state.players.p2.zones.active = [
        createCard({
          instanceId: 2,
          id: 'def',
          name: 'Defender',
          supertype: 'Pokémon',
          hp: 400,
        }),
      ];
      return state;
    }

    it('parser extracts the type, count and bonus', () => {
      const clause = returnEnergyBonusClause(NINJA_SPINNER.text);
      assert.deepEqual(clause, { count: 1, energyType: 'Water', bonus: 80 });
      assert.equal(returnEnergyBonusClause('Do 30 damage.'), null);
    });

    it('offers the choice and returns the Water Energy for +80 when accepted', () => {
      const state = ninjaGame();
      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res.error, null);
      const choice = res.pendingChoice;
      assert.ok(choice, 'accepting the optional Energy return must be a choice');
      assert.equal(choice.player, 'p1');
      assert.equal(choice.min, 1);
      assert.equal(choice.max, 1);
      assert.equal(choice.resumeToken.effectType, 'attackReturnEnergyBonus');
      // No damage dealt yet — the choice suspends the attack.
      assert.equal(res.state.players.p2.zones.active[0].damage || 0, 0);

      const resolved = applyCommand(res.state, {
        type: 'resolveChoice',
        payload: { choiceId: choice.choiceId, selection: [1] },
        playerId: 'p1',
      });

      assert.equal(resolved.error, null);
      assert.equal(resolved.pendingChoice, null);
      // 120 + 80, and the returned Energy is in hand (one Water remains attached).
      assert.equal(resolved.state.players.p2.zones.active[0].damage, 200);
      assert.equal(
        resolved.state.players.p1.zones.hand.filter(
          (c) => c.energyType === 'Water'
        ).length,
        1
      );
      assert.equal(
        resolved.state.players.p1.zones.active.filter(
          (c) => c.energyType === 'Water'
        ).length,
        1
      );
      // The turn ended after the suspended attack resolved.
      assert.equal(resolved.state.turn.player, 'p2');
    });

    it('keeps the Energy and deals the printed base when declined', () => {
      const state = ninjaGame();
      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      const resolved = applyCommand(res.state, {
        type: 'resolveChoice',
        payload: { choiceId: res.pendingChoice.choiceId, selection: [2] },
        playerId: 'p1',
      });

      assert.equal(resolved.error, null);
      assert.equal(resolved.state.players.p2.zones.active[0].damage, 120);
      assert.equal(resolved.state.players.p1.zones.hand.length, 0);
      assert.equal(
        resolved.state.players.p1.zones.active.filter(
          (c) => c.energyType === 'Water'
        ).length,
        2
      );
    });

    it('skips the choice and deals base damage with no compatible Energy attached', () => {
      const state = ninjaGame({ withWater: false });
      // Colorless cost so the Fire Energy pays it without offering a Water return.
      state.players.p1.zones.active[0].attacks[0] = {
        ...NINJA_SPINNER,
        cost: ['Colorless'],
      };
      const res = applyCommand(state, {
        type: 'attack',
        playerId: 'p1',
        payload: { attackIndex: 0 },
      });

      assert.equal(res.error, null);
      assert.equal(res.pendingChoice, null);
      assert.equal(res.state.players.p2.zones.active[0].damage, 120);
    });
  });
});
