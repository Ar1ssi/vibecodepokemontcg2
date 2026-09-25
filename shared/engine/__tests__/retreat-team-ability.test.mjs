// Team-wide "no Retreat Cost" abilities printed on a Benched Pokémon must zero
// the Active Spot's cost (e.g. Latias ex "Skyliner"). Regression for the gap
// where only the active's own ability text was read.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../reduce.mjs';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { teamNoRetreatCostForActive, parseRetreatCostModifier } from '../rules/ability-executors.mjs';
import { abilityRetreatCost } from '../rules/ability-combat.mjs';
import { rulesState } from '../rules/rules-state.mjs';
import { getEffectiveRetreatCost, canRetreat } from '../rules/retreat.mjs';

function makeState() {
  const state = createGameState({
    id: 'retreat-team-ability',
    seed: 42,
    players: {
      p1: {
        id: 'p1',
        name: 'P1',
        zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] },
        flags: { energyAttached: false, attackerAttacked: false, retreatedThisTurn: false },
      },
      p2: {
        id: 'p2',
        name: 'P2',
        zones: { active: [], bench: [], hand: [], deck: [], discard: [], prizes: [] },
        flags: {},
      },
    },
  });
  state.turn = { number: 2, player: 'p1', phase: 'main' };
  return state;
}

const ability = (name, text) => ({ name, text });

function latiasEx(instanceId) {
  return createCard({
    instanceId,
    id: 'latias-ex-ssp-76',
    name: 'Latias ex',
    stage: 'Basic',
    retreatCost: 2,
    ability: ability('Skyliner', 'Your Basic Pokémon in play have no Retreat Cost.'),
  });
}

describe('team-wide no Retreat Cost abilities', () => {
  it('helper: Basic-only grant applies to a Basic active, not an Evolution', () => {
    const holder = latiasEx(2);
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Charmeleon', stage: 'Stage 1', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: "Your Pokémon in play" grants to any active', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Eelektross',
      stage: 'Stage 2',
      ability: ability('Levitation Field', 'Your Pokémon in play have no Retreat Cost.'),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Charmeleon', stage: 'Stage 1', retreatCost: 2 }),
        [holder]
      ),
      true
    );
  });

  it('helper: name-specific grant matches only the named active', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Latias',
      stage: 'Basic',
      ability: ability('Flight Support', 'Your Latios in play have no Retreat Cost.'),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Latios', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: "except Pokémon-GX and Pokémon-EX" skips rule-box actives', () => {
    const holder = createCard({
      instanceId: 2,
      name: 'Dragonite',
      stage: 'Stage 2',
      ability: ability(
        'Dragon Lift',
        'Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX.'
      ),
    });
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      true
    );
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu ex', stage: 'Basic', retreatCost: 2 }),
        [holder]
      ),
      false
    );
  });

  it('helper: ignores attached cards and non-holders', () => {
    const energy = createCard({ instanceId: 9, name: 'Basic Psychic Energy', attachedTo: 1 });
    const holder = latiasEx(2);
    assert.equal(
      teamNoRetreatCostForActive(
        createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 }),
        [energy, holder]
      ),
      true
    );
  });

  it('server: a Benched Latias ex makes a Basic active retreat free', () => {
    const state = makeState();
    const active = createCard({ instanceId: 1, id: 'pikachu', name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
    const benchedLatias = latiasEx(2);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [benchedLatias, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
    assert.equal(res.state.players.p1.zones.active[0].instanceId, benchedEevee.instanceId);
    assert.equal(res.state.players.p1.flags.retreatedThisTurn, true);
  });

  it('server: Skyliner does not free an Evolution active', () => {
    const state = makeState();
    const root = createCard({ instanceId: 1, id: 'charmander', name: 'Charmander', stage: 'Basic', retreatCost: 1 });
    const evolution = createCard({
      instanceId: 4,
      id: 'charmeleon',
      name: 'Charmeleon',
      stage: 'Stage 1',
      retreatCost: 2,
      attachedTo: root.instanceId,
    });
    const benchedLatias = latiasEx(2);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [root, evolution];
    state.players.p1.zones.bench = [benchedLatias, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.match(res.error, /Not enough energy to retreat/);
  });

  it('server: a Benched Evolution holding the ability still grants it', () => {
    const state = makeState();
    const active = createCard({ instanceId: 1, id: 'pikachu', name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
    const root = createCard({ instanceId: 5, id: 'dratini', name: 'Dratini', stage: 'Basic' });
    const dragonite = createCard({
      instanceId: 6,
      id: 'dragonite',
      name: 'Dragonite',
      stage: 'Stage 2',
      attachedTo: root.instanceId,
      abilities: [
        {
          name: 'Dragon Lift',
          text: 'Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX.',
        },
      ],
    });
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [root, dragonite, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
  });

  it('server: an active Latias ex still retreats free (self ability)', () => {
    const state = makeState();
    const active = latiasEx(1);
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active];
    state.players.p1.zones.bench = [benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });

    assert.equal(res.error, null);
  });

  describe('client path', () => {
    beforeEach(() => {
      rulesState.enabled = true;
      rulesState.turnPlayer = 'self';
      rulesState.flags.self.attackerAttacked = false;
      rulesState.flags.self.retreatedThisTurn = false;
    });

    it('getEffectiveRetreatCost reads the bench; canRetreat allows the free retreat', () => {
      const active = createCard({ instanceId: 1, name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
      const bench = [latiasEx(2), createCard({ instanceId: 3, name: 'Eevee', stage: 'Basic' })];

      assert.equal(getEffectiveRetreatCost(active, 'self', [], bench), 0);
      assert.equal(getEffectiveRetreatCost(active, 'self', []), 2);
      assert.equal(canRetreat('self', active, [], [], bench).allowed, true);
      assert.equal(canRetreat('self', active, [], []).allowed, false);
    });
  });
});

// ── I161: retreat wordings beyond the own/team basics ───────────────────

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, stage: 'Basic', supertype: 'Pokémon', ...extra });
const abilityMon = (instanceId, name, abilityName, text, extra = {}) =>
  mon(instanceId, name, { abilities: [{ name: abilityName, text }], ...extra });
const energyCard = (instanceId, name, attachedTo, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Energy', types: ['Water'], attachedTo, ...extra });

describe('I161 retreat wordings', () => {
  it('energy-conditional team no-retreat (Archaludon Metal Bridge / Zeraora-GX)', () => {
    const archaludon = abilityMon(
      2,
      'Archaludon',
      'Metal Bridge',
      'All of your Pokémon that have {M} Energy attached have no Retreat Cost.'
    );
    const active = mon(1, 'Pikachu', { retreatCost: 2 });
    const metal = createCard({ instanceId: 9, name: 'Basic Metal Energy', supertype: 'Energy', types: ['Metal'], attachedTo: 1 });
    assert.equal(teamNoRetreatCostForActive(active, [archaludon], [active, metal]), true);
    assert.equal(teamNoRetreatCostForActive(active, [archaludon], [active]), false);
  });

  it('evolution-conditional team no-retreat (Umbreon Moonlight Veil)', () => {
    const umbreon = abilityMon(
      2,
      'Umbreon',
      'Moonlight Veil',
      "Each of your Pokémon that evolves from Eevee has no Weakness, and that Pokémon's Retreat Cost is 0."
    );
    const eeveelution = mon(1, 'Espeon', { retreatCost: 1, evolvesFrom: 'Eevee' });
    assert.equal(teamNoRetreatCostForActive(eeveelution, [umbreon], [eeveelution]), true);
    assert.equal(teamNoRetreatCostForActive(mon(3, 'Pikachu', { retreatCost: 1 }), [umbreon], []), false);
  });

  it('typed team reduction (Ninetales Byway of the Nine-Tailed Fox)', () => {
    const ninetales = abilityMon(
      2,
      'Ninetales',
      'Byway of the Nine-Tailed Fox',
      'The Retreat Cost of each of your Pokémon that has any {R} Energy attached is {C}{C} less.'
    );
    const active = mon(1, 'Pikachu', { retreatCost: 3 });
    const fire = createCard({ instanceId: 9, name: 'Basic Fire Energy', supertype: 'Energy', types: ['Fire'], attachedTo: 1 });
    const ctx = {
      sideCards: [active, fire, ninetales],
      opponentSideCards: [],
      sideActive: [active],
      sideBench: [ninetales],
      opponentActive: [],
      opponentBench: [],
      zone: 'active',
      isActive: true,
    };
    assert.equal(abilityRetreatCost(active, ctx), -2);
    assert.equal(abilityRetreatCost(active, { ...ctx, sideCards: [active, ninetales] }), 0);
  });

  it('both-player increases stack once (Ariados Sticky) and Jellicent adds', () => {
    const ariados = abilityMon(
      2,
      'Ariados',
      'Sticky',
      "The Retreat Cost for each player's Pokémon (excluding Ariados) is {C} more."
    );
    const ariados2 = abilityMon(3, 'Ariados', 'Sticky', ariados.abilities[0].text);
    const active = mon(1, 'Pikachu', { retreatCost: 2 });
    const base = {
      sideCards: [active],
      opponentSideCards: [ariados, ariados2],
      sideActive: [active],
      sideBench: [],
      opponentActive: [ariados],
      opponentBench: [ariados2],
      zone: 'active',
      isActive: true,
    };
    assert.equal(abilityRetreatCost(active, base), 1, 'the printed cap makes two Ariados +1');
    assert.equal(
      abilityRetreatCost(ariados, { ...base, sideCards: [ariados], opponentSideCards: [active] }),
      0,
      'excluded holder itself'
    );

    const jellicent = abilityMon(
      4,
      'Jellicent',
      'Stickiness',
      "The Retreat Cost of each of your opponent's Pokémon in play is {C} more."
    );
    assert.equal(
      abilityRetreatCost(active, { ...base, opponentSideCards: [jellicent], opponentActive: [jellicent], opponentBench: [] }),
      1
    );
  });

  it('"for each" self scaling (Magnemite, Suicune, Arcanine)', () => {
    const magnemite = abilityMon(
      1,
      'Magnemite',
      'Sparkling Induction',
      'As long as this Pokémon is your Active Pokémon, its Retreat Cost is {C} less for each Magnemite on your Bench.'
    );
    const bench = [mon(2, 'Magnemite'), mon(3, 'Magnemite'), mon(4, 'Pikachu')];
    assert.deepEqual(
      parseRetreatCostModifier(magnemite, { zoneCards: [magnemite], benchCards: bench }),
      { delta: -2 }
    );
    assert.deepEqual(parseRetreatCostModifier(magnemite, { zoneCards: [magnemite] }), { delta: 0 }, 'no bench context');

    const suicune = abilityMon(
      5,
      'Suicune',
      'Extreme Speed',
      "Suicune's Retreat Cost is {C} less for each {W} Energy attached to Suicune."
    );
    const energies = [
      energyCard(6, 'Basic Water Energy', 5),
      energyCard(7, 'Basic Water Energy', 5),
      createCard({ instanceId: 8, name: 'Basic Fire Energy', supertype: 'Energy', types: ['Fire'], attachedTo: 5 }),
    ];
    assert.deepEqual(
      parseRetreatCostModifier(suicune, { zoneCards: [suicune, ...energies] }),
      { delta: -2 }
    );

    const arcanine = abilityMon(
      9,
      'Arcanine',
      'Extreme Speed',
      'You pay {C} less to retreat Arcanine for each Energy attached to it.'
    );
    const arcanineEnergies = [
      energyCard(10, 'Basic Water Energy', 9),
      energyCard(11, 'Basic Water Energy', 9),
    ];
    assert.deepEqual(
      parseRetreatCostModifier(arcanine, { zoneCards: [arcanine, ...arcanineEnergies] }),
      { delta: -2 }
    );
  });

  it('named partner / opponent conditions (Volbeat, Genesect, Alolan Vulpix)', () => {
    const volbeat = abilityMon(1, 'Volbeat', 'Uplifting Glow', "As long as Illumise is in play, Volbeat's Retreat Cost is 0.");
    assert.deepEqual(
      parseRetreatCostModifier(volbeat, { sideCards: [volbeat], opponentSideCards: [mon(2, 'Illumise')] }),
      { delta: -Infinity }
    );
    assert.deepEqual(parseRetreatCostModifier(volbeat, { sideCards: [volbeat], opponentSideCards: [] }), { delta: 0 });

    const genesect = abilityMon(
      3,
      'Genesect',
      'Fast-Flight Configuration',
      'If your opponent has any Pokémon-GX or Pokémon-EX in play, this Pokémon has no Retreat Cost.'
    );
    assert.deepEqual(
      parseRetreatCostModifier(genesect, { sideCards: [genesect], opponentSideCards: [mon(4, 'Mewtwo ex')] }),
      { delta: -Infinity }
    );
    assert.deepEqual(
      parseRetreatCostModifier(genesect, { sideCards: [genesect], opponentSideCards: [mon(5, 'Pikachu')] }),
      { delta: 0 }
    );

    const vulpix = abilityMon(
      6,
      'Alolan Vulpix',
      'Secret Alleyway',
      'If you have any {Y} Pokémon in play, this Pokémon has no Retreat Cost.'
    );
    const fairy = mon(7, 'Clefairy', { types: ['Fairy'] });
    assert.deepEqual(
      parseRetreatCostModifier(vulpix, { sideCards: [vulpix, fairy], opponentSideCards: [] }),
      { delta: -Infinity }
    );
  });

  it('server: Archaludon makes the Metal-energy Active retreat free', () => {
    const state = makeState();
    const active = createCard({ instanceId: 1, id: 'pikachu', name: 'Pikachu', stage: 'Basic', retreatCost: 2 });
    const metal = createCard({ instanceId: 9, name: 'Basic Metal Energy', supertype: 'Energy', types: ['Metal'], attachedTo: 1 });
    const archaludon = abilityMon(
      2,
      'Archaludon',
      'Metal Bridge',
      'All of your Pokémon that have {M} Energy attached have no Retreat Cost.'
    );
    const benchedEevee = createCard({ instanceId: 3, id: 'eevee', name: 'Eevee', stage: 'Basic' });
    state.players.p1.zones.active = [active, metal];
    state.players.p1.zones.bench = [archaludon, benchedEevee];

    const res = applyCommand(state, {
      type: 'retreat',
      playerId: 'p1',
      payload: { benchInstanceId: benchedEevee.instanceId },
    });
    assert.equal(res.error, null);
    assert.equal(res.state.players.p1.zones.active[0].instanceId, benchedEevee.instanceId);
  });
});
