import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';

function createBasicState() {
  const state = createGameState({
    id: 'test-room',
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
            createCard({ instanceId: 101, id: 'card-deck', name: 'Deck Card' }),
          ],
          discard: [],
          prizes: [
            createCard({ instanceId: 102, id: 'card-p1', name: 'Prize 1' }),
          ],
        },
        flags: {
          energyAttached: false,
          attackerAttacked: false,
          retreatedThisTurn: false,
        },
      },
      p2: {
        id: 'p2',
        name: 'Player 2',
        zones: {
          active: [],
          bench: [],
          hand: [],
          deck: [
            createCard({
              instanceId: 103,
              id: 'card-deck-p2',
              name: 'Deck Card P2',
            }),
          ],
          discard: [],
          prizes: [
            createCard({ instanceId: 104, id: 'card-p2', name: 'Prize 2' }),
          ],
        },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

describe('Phase 2 & Phase 4: Retreat, Tool Cap, Energy Acceleration', () => {
  describe('Phase 2: Retreat Cost Modifiers & Engine', () => {
    it('Beach Court reduces retreat cost by 1 for Basic Pokemon, allowing free retreat with 0 energy', () => {
      const state = createBasicState();
      const active = createCard({
        instanceId: 1,
        id: 'basic-active',
        name: 'Pikachu',
        stage: 'Basic',
        retreatCost: 1,
      });
      const benched = createCard({
        instanceId: 2,
        id: 'benched-1',
        name: 'Charmander',
        stage: 'Basic',
      });
      state.players.p1.zones.active = [active];
      state.players.p1.zones.bench = [benched];

      state.stadium = createCard({
        instanceId: 50,
        id: 'stadium-beach-court',
        name: 'Beach Court',
        supertype: 'Trainer',
        subtypes: ['Stadium'],
        text: "The Retreat Cost of each Basic Pokémon in play (both yours and your opponent's) is {C} less.",
      });

      const res = applyCommand(state, {
        type: 'retreat',
        playerId: 'p1',
        payload: { benchInstanceId: benched.instanceId },
      });

      assert.equal(res.error, null);
      assert.equal(
        res.state.players.p1.zones.active[0].instanceId,
        benched.instanceId
      );
      assert.equal(
        res.state.players.p1.zones.bench[0].instanceId,
        active.instanceId
      );
      assert.equal(res.state.players.p1.flags.retreatedThisTurn, true);
    });

    it('Float Stone grants free retreat (no retreat cost) to any Pokemon', () => {
      const state = createBasicState();
      const active = createCard({
        instanceId: 1,
        id: 'snorlax',
        name: 'Snorlax',
        stage: 'Basic',
        retreatCost: 4,
      });
      const floatStone = createCard({
        instanceId: 10,
        id: 'tool-float-stone',
        name: 'Float Stone',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
        attachedTo: active.instanceId,
        text: 'The Pokémon this card is attached to has no Retreat Cost.',
      });
      const benched = createCard({
        instanceId: 2,
        id: 'benched-1',
        name: 'Eevee',
        stage: 'Basic',
      });

      state.players.p1.zones.active = [active, floatStone];
      state.players.p1.zones.bench = [benched];

      const res = applyCommand(state, {
        type: 'retreat',
        playerId: 'p1',
        payload: { benchInstanceId: benched.instanceId },
      });

      assert.equal(res.error, null);
      assert.equal(
        res.state.players.p1.zones.active[0].instanceId,
        benched.instanceId
      );
      assert.equal(
        res.state.players.p1.zones.bench.some(
          (c) => c.instanceId === active.instanceId
        ),
        true
      );
    });

    it('Jamming Tower negates Float Stone free retreat', () => {
      const state = createBasicState();
      const active = createCard({
        instanceId: 1,
        id: 'snorlax',
        name: 'Snorlax',
        stage: 'Basic',
        retreatCost: 4,
      });
      const floatStone = createCard({
        instanceId: 10,
        id: 'tool-float-stone',
        name: 'Float Stone',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
        attachedTo: active.instanceId,
        text: 'The Pokémon this card is attached to has no Retreat Cost.',
      });
      const benched = createCard({
        instanceId: 2,
        id: 'benched-1',
        name: 'Eevee',
        stage: 'Basic',
      });

      state.players.p1.zones.active = [active, floatStone];
      state.players.p1.zones.bench = [benched];
      state.stadium = createCard({
        instanceId: 50,
        id: 'jamming-tower',
        name: 'Jamming Tower',
        supertype: 'Trainer',
        subtypes: ['Stadium'],
        text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
      });

      const res = applyCommand(state, {
        type: 'retreat',
        playerId: 'p1',
        payload: { benchInstanceId: benched.instanceId },
      });

      assert.ok(res.error);
      assert.match(res.error, /Not enough energy to retreat/);
    });
  });

  describe('Phase 2: 1-Tool-per-Pokemon Cap', () => {
    it('Rejects attaching a second Tool to a Pokemon that already has one attached', () => {
      const state = createBasicState();
      const active = createCard({
        instanceId: 1,
        id: 'active-pkmn',
        name: 'Mew',
        stage: 'Basic',
      });
      const firstTool = createCard({
        instanceId: 10,
        id: 'tool-1',
        name: 'Choice Belt',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
        attachedTo: active.instanceId,
      });
      const secondTool = createCard({
        instanceId: 11,
        id: 'tool-2',
        name: 'Bravery Charm',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
      });

      state.players.p1.zones.active = [active, firstTool];
      state.players.p1.zones.hand = [secondTool];

      const res = applyCommand(state, {
        type: 'attachCard',
        playerId: 'p1',
        payload: {
          instanceId: secondTool.instanceId,
          targetInstanceId: active.instanceId,
        },
      });

      assert.ok(res.error);
      assert.match(res.error, /already has a Pokémon Tool attached/);
    });

    it('Allows attaching a second Tool if an ability grants extra tool slots', () => {
      const state = createBasicState();
      const active = createCard({
        instanceId: 1,
        id: 'active-pkmn',
        name: 'Genesect',
        stage: 'Basic',
        ability: {
          name: 'Tool Master',
          text: 'This Pokémon can have an extra Pokémon Tool attached to it.',
        },
      });
      const firstTool = createCard({
        instanceId: 10,
        id: 'tool-1',
        name: 'Choice Belt',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
        attachedTo: active.instanceId,
      });
      const secondTool = createCard({
        instanceId: 11,
        id: 'tool-2',
        name: 'Bravery Charm',
        supertype: 'Trainer',
        subtypes: ['Pokémon Tool'],
        isTool: true,
      });

      state.players.p1.zones.active = [active, firstTool];
      state.players.p1.zones.hand = [secondTool];

      const res = applyCommand(state, {
        type: 'attachCard',
        playerId: 'p1',
        payload: {
          instanceId: secondTool.instanceId,
          targetInstanceId: active.instanceId,
        },
      });

      assert.equal(res.error, null);
      assert.equal(res.state.players.p1.zones.active.length, 3);
    });
  });

  describe('Phase 4: Unlimited Energy Acceleration', () => {
    it('Baxcalibur Supercold allows attaching multiple Water energies from hand', () => {
      const state = createBasicState();
      const baxcalibur = createCard({
        instanceId: 10,
        id: 'bax-1',
        name: 'Baxcalibur',
        stage: 'Stage 2',
        types: ['Water'],
        ability: {
          name: 'Supercold',
          text: 'As often as you like during your turn, you may attach a Basic {W} Energy card from your hand to 1 of your Pokémon.',
        },
      });
      const targetPkmn = createCard({
        instanceId: 1,
        id: 'target-pkmn',
        name: 'Chien-Pao ex',
        stage: 'Basic',
        types: ['Water'],
      });
      const waterEnergy1 = createCard({
        instanceId: 21,
        id: 'we-1',
        name: 'Basic Water Energy',
        supertype: 'Energy',
        energyType: 'Water',
      });
      const waterEnergy2 = createCard({
        instanceId: 22,
        id: 'we-2',
        name: 'Basic Water Energy',
        supertype: 'Energy',
        energyType: 'Water',
      });

      state.players.p1.zones.active = [targetPkmn];
      state.players.p1.zones.bench = [baxcalibur];
      state.players.p1.zones.hand = [waterEnergy1, waterEnergy2];

      state.players.p1.flags.energyAttached = true;

      const res1 = applyCommand(state, {
        type: 'attachCard',
        playerId: 'p1',
        payload: {
          instanceId: waterEnergy1.instanceId,
          targetInstanceId: targetPkmn.instanceId,
        },
      });
      assert.equal(res1.error, null);

      const res2 = applyCommand(res1.state, {
        type: 'attachCard',
        playerId: 'p1',
        payload: {
          instanceId: waterEnergy2.instanceId,
          targetInstanceId: targetPkmn.instanceId,
        },
      });
      assert.equal(res2.error, null);
      assert.equal(res2.state.players.p1.zones.active.length, 3);
    });

    it('Rejects attaching a non-Water energy if already attached this turn despite Baxcalibur', () => {
      const state = createBasicState();
      const baxcalibur = createCard({
        instanceId: 10,
        id: 'bax-1',
        name: 'Baxcalibur',
        stage: 'Stage 2',
        types: ['Water'],
        ability: {
          name: 'Supercold',
          text: 'As often as you like during your turn, you may attach a Basic {W} Energy card from your hand to 1 of your Pokémon.',
        },
      });
      const targetPkmn = createCard({
        instanceId: 1,
        id: 'target-pkmn',
        name: 'Chien-Pao ex',
        stage: 'Basic',
        types: ['Water'],
      });
      const fireEnergy = createCard({
        instanceId: 30,
        id: 'fe-1',
        name: 'Basic Fire Energy',
        supertype: 'Energy',
        energyType: 'Fire',
      });

      state.players.p1.zones.active = [targetPkmn];
      state.players.p1.zones.bench = [baxcalibur];
      state.players.p1.zones.hand = [fireEnergy];
      state.players.p1.flags.energyAttached = true;

      const res = applyCommand(state, {
        type: 'attachCard',
        playerId: 'p1',
        payload: {
          instanceId: fireEnergy.instanceId,
          targetInstanceId: targetPkmn.instanceId,
        },
      });

      assert.ok(res.error);
      assert.match(res.error, /Energy already attached this turn/);
    });
  });
});
