// Team Plasma-era attacks that ran with no effect (audit:attacks, cluster A). Each attack text is
// the corpus row named in its test (out/pkmn-pokemon-cards.json, set + number). The printings the
// Team Plasma marker reads carry their TCGdex id (bw8-101 Snorlax, bw8-132 Articuno-EX, bw10-99
// Dialga-EX), as they do in a real game; the audit harness board has no printing ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { listConditions } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'], type: 'Item' });
const basicEnergy = (type, attachedTo = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    type: 'Energy',
    energyType: type,
    attachedTo,
  });
// Corpus rows: Plasma Energy and Double Colorless Energy are Special Energy cards.
const specialEnergy = (name, attachedTo = null) =>
  createCard({ instanceId: nextId++, name, supertype: 'Energy', subtypes: ['Special'], type: 'Energy', attachedTo });
const plasmaEnergy = (attachedTo) => specialEnergy('Plasma Energy', attachedTo);

/**
 * p1 attacks with `name` using `text`. `setup(state)` adds the rest of the board. Attacks cost
 * nothing here so each test checks only the effect.
 */
function board(name, text, { id = '', damage = '30', setup = () => {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'plasma-attacks', seed: 3, rulesEnabled: true });
  for (const pid of ['p1', 'p2']) {
    state.players[pid] = { playerId: pid, username: pid, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[pid].zones.prizes.push(mon(`${pid} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[pid].zones.deck.push(trainer(`${pid} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { id, attacks: [{ name: 'Probe', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, types: ['Water'] });
  state.players.p2.zones.active.push(defender);
  setup(state);
  return { state, attacker, defender };
}

// A pending choice (which Energy to discard, which Benched Pokémon to attach to) takes the first
// option the rules offer, the same way a player would pick the top listed card.
function resolveChoices(result) {
  let res = result;
  for (let n = 0; res && !res.error && res.state?.pendingChoice && n < 20; n++) {
    const pc = res.state.pendingChoice;
    const want = Math.max(pc.min || 0, Math.min(pc.max ?? 1, pc.options.length));
    res = applyCommand(
      res.state,
      {
        type: 'resolveChoice',
        playerId: pc.player,
        payload: { choiceId: pc.choiceId, selection: pc.options.slice(0, want).map((o) => o.instanceId) },
      },
      createRng(3)
    );
  }
  return res;
}

const attack = (state) =>
  resolveChoices(applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3)));

const allCards = (player) => Object.values(player.zones).flat();
const attachedTo = (player, instanceId) => allCards(player).filter((c) => c.attachedTo === instanceId);

// Corpus: Thundurus-EX (Black & White Promos) BW81 — Raiden Knuckle.
const RAIDEN_KNUCKLE =
  'Attach an Energy card from your discard pile to 1 of your Benched Team Plasma Pokémon.';
// Corpus: Thundurus-EX (Black & White Promos) BW81 — Thunderous Noise.
const THUNDEROUS_NOISE =
  'If this Pokémon has any Plasma Energy attached to it, discard an Energy attached to the Defending Pokémon.';
// Corpus: Dialga-EX (Plasma Blast) 99 — Fast Forward.
const FAST_FORWARD =
  "For each Plasma Energy attached to this Pokémon, discard the top card of your opponent's deck.";
// Corpus: Articuno-EX (Plasma Storm) 132 — Frost Prison.
const FROST_PRISON = 'If this Pokémon has any Plasma Energy attached to it, the Defending Pokémon is now Paralyzed.';
// Corpus: Drifblim (Plasma Blast) 35 — Derail.
const DERAIL = 'Discard a Special Energy attached to the Defending Pokémon.';
// Corpus: Cobalion-EX (Plasma Storm) 133 — Righteous Edge.
const RIGHTEOUS_EDGE = 'Discard a Special Energy attached to the Defending Pokémon.';
// Corpus: Togekiss (Plasma Storm) 104 — Return.
const RETURN = 'Draw cards until you have 6 cards in your hand.';
// Corpus: Snorlax (Plasma Storm) 101 — Teampact.
const TEAMPACT = 'Does 30 damage times the number of Team Plasma Pokémon you have in play.';

// Printing ids: bw8-101 Snorlax, bw8-132 Articuno-EX (both Team Plasma), bw10-99 Dialga-EX.
const SNORLAX_ID = 'bw8-101';
const ARTICUNO_ID = 'bw8-132';
const DIALGA_ID = 'bw10-99';

test('Thundurus-EX BW81 Raiden Knuckle: the discard Energy goes to a Benched Team Plasma Pokémon, not any bench', () => {
  let plasmaMon;
  let plainMon;
  const { state } = board('Thundurus-EX', RAIDEN_KNUCKLE, {
    setup: (s) => {
      plasmaMon = mon('Articuno-EX', { id: ARTICUNO_ID });
      plainMon = mon('Plain Bench');
      s.players.p1.zones.bench.push(plasmaMon, plainMon);
      s.players.p1.zones.discard.push(basicEnergy('Lightning'));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  const energy = allCards(after.state.players.p1).find((c) => c.name === 'Basic Lightning Energy');
  assert.equal(energy.attachedTo, plasmaMon.instanceId, 'the Team Plasma bench Pokémon takes the Energy');
  assert.equal(attachedTo(after.state.players.p1, plainMon.instanceId).length, 0);
});

test('Thundurus-EX BW81 Thunderous Noise: with a Plasma Energy attached, discard an Energy from the Defending Pokémon', () => {
  const { state } = board('Thundurus-EX', THUNDEROUS_NOISE, {
    damage: '90',
    setup: (s) => {
      const attacker = s.players.p1.zones.active[0];
      s.players.p1.zones.active.push(plasmaEnergy(attacker.instanceId));
      const defender = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(basicEnergy('Water', defender.instanceId), specialEnergy('Double Colorless Energy', defender.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  const defender = after.state.players.p2.zones.active[0];
  assert.equal(attachedTo(after.state.players.p2, defender.instanceId).length, 1, 'one Energy discarded');
});

test('Thundurus-EX BW81 Thunderous Noise: without Plasma Energy the Defending Pokémon keeps its Energy', () => {
  const { state } = board('Thundurus-EX', THUNDEROUS_NOISE, {
    damage: '90',
    setup: (s) => {
      const defender = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(basicEnergy('Water', defender.instanceId), specialEnergy('Double Colorless Energy', defender.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  const defender = after.state.players.p2.zones.active[0];
  assert.equal(attachedTo(after.state.players.p2, defender.instanceId).length, 2);
});

test('Dialga-EX 99 Fast Forward: one card from the opponent deck for each Plasma Energy attached', () => {
  const { state } = board('Dialga-EX', FAST_FORWARD, {
    id: DIALGA_ID,
    damage: '90',
    setup: (s) => {
      const attackerCard = s.players.p1.zones.active[0];
      s.players.p1.zones.active.push(plasmaEnergy(attackerCard.instanceId), plasmaEnergy(attackerCard.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  // Two Plasma Energy: the top two cards of the opponent's deck. (The turn-start draw that follows
  // the attack comes from the top of the same deck, so it is not in this discard.)
  assert.deepEqual(
    after.state.players.p2.zones.discard.map((c) => c.name),
    ['p2 deck 0', 'p2 deck 1']
  );
});

test('Articuno-EX 132 Frost Prison: with a Plasma Energy attached, the Defending Pokémon is Paralyzed', () => {
  const { state } = board('Articuno-EX', FROST_PRISON, {
    id: ARTICUNO_ID,
    damage: '80',
    setup: (s) => {
      const attackerCard = s.players.p1.zones.active[0];
      s.players.p1.zones.active.push(plasmaEnergy(attackerCard.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  assert.ok(listConditions(after.state.players.p2.zones.active[0]).includes('Paralyzed'));
});

test('Articuno-EX 132 Frost Prison: without Plasma Energy the Defending Pokémon is not Paralyzed', () => {
  const { state } = board('Articuno-EX', FROST_PRISON, { id: ARTICUNO_ID, damage: '80' });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  assert.equal(listConditions(after.state.players.p2.zones.active[0]).includes('Paralyzed'), false);
});

test('Drifblim 35 Derail: discards the Special Energy and keeps the Basic Energy on the Defending Pokémon', () => {
  const { state } = board('Drifblim', DERAIL, {
    damage: '70',
    setup: (s) => {
      const defender = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(specialEnergy('Double Colorless Energy', defender.instanceId), basicEnergy('Water', defender.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  const defender = after.state.players.p2.zones.active[0];
  const left = attachedTo(after.state.players.p2, defender.instanceId).map((c) => c.name);
  assert.deepEqual(left, ['Basic Water Energy']);
});

test('Cobalion-EX 133 Righteous Edge: discards the Special Energy attached to the Defending Pokémon', () => {
  const { state } = board('Cobalion-EX', RIGHTEOUS_EDGE, {
    damage: '30',
    setup: (s) => {
      const defender = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(specialEnergy('Double Colorless Energy', defender.instanceId));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  const defender = after.state.players.p2.zones.active[0];
  assert.equal(attachedTo(after.state.players.p2, defender.instanceId).length, 0);
});

test('Togekiss 104 Return: draws until the hand holds 6 cards', () => {
  const { state } = board('Togekiss', RETURN, {
    damage: '30',
    setup: (s) => {
      s.players.p1.zones.hand.push(trainer('Hand A'), trainer('Hand B'));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  assert.equal(after.state.players.p1.zones.hand.length, 6);
});

test('Snorlax 101 Teampact: 30 damage times the Team Plasma Pokémon in play (itself and Articuno-EX here)', () => {
  const { state } = board('Snorlax', TEAMPACT, {
    id: SNORLAX_ID,
    damage: '30×',
    setup: (s) => {
      s.players.p1.zones.bench.push(mon('Articuno-EX', { id: ARTICUNO_ID }), mon('Plain Bench'));
    },
  });
  const after = attack(state);
  assert.ok(!after.error, after.error);
  assert.equal(after.state.players.p2.zones.active[0].damage, 60);
});
