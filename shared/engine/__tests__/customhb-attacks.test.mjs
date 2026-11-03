// Homebrew set customhb (client/src/assets/custom-sets/customhb/set.json): attack texts the
// engine used to run partly or not at all (I272, ENGINE-CHECK.md). Each test names the card by
// its HB number; the text is the set.json effect, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });
const energy = (type, attachedTo = null, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
    ...extra,
  });

/** p1 attacks with `text`; `setup(state, { attacker, defender })` adds anything else to the board. */
function board(name, text, { damage = '', setup = () => {}, attackerExtra = {}, defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }], ...attackerExtra });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400, ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}

const attack = (state, seed = 3) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(4)
  );
const ids = (cards) => cards.map((c) => c.instanceId);
const zone = (state, pid, name) => state.players[pid].zones[name];

// ── HB 001 Weedle / HB 018 Grookey: "put them on your Bench" ─────────────────────────────

test('HB 001 Weedle Call for Swarm benches up to 2 {G} Pokémon', () => {
  const grass = [];
  const { state } = board('Weedle', 'Search your deck for up to 2 {G} Pokémon and put them on your Bench', {
    setup: (s) => {
      for (const n of ['A', 'B', 'C']) {
        const c = mon(`Grass ${n}`, { types: ['Grass'] });
        grass.push(c);
        s.players.p1.zones.deck.push(c);
      }
      s.players.p1.zones.deck.push(mon('Fire Basic', { types: ['Fire'] }));
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'search choice');
  assert.deepEqual(new Set(res.state.pendingChoice.options.map((o) => o.name)), new Set(['Grass A', 'Grass B', 'Grass C']));
  const done = choose(res, ids(grass).slice(0, 2));
  assert.equal(zone(done.state, 'p1', 'bench').length, 2);
});

test('HB 018 Grookey Supporting Act benches up to 2 Grookey', () => {
  const grookey = [];
  const { state } = board(
    'Grookey',
    'Search your deck for up to 2 Grookey cards and place them on your Bench. Then, shuffle your deck',
    {
      setup: (s) => {
        for (let i = 0; i < 2; i++) {
          const c = mon('Grookey', { types: ['Grass'] });
          grookey.push(c);
          s.players.p1.zones.deck.push(c);
        }
        s.players.p1.zones.deck.push(mon('Scorbunny', { types: ['Fire'] }));
      },
    }
  );
  const res = attack(state);
  assert.ok(res.state.pendingChoice, 'search choice');
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.name), ['Grookey', 'Grookey']);
  const done = choose(res, ids(grookey));
  assert.equal(zone(done.state, 'p1', 'bench').length, 2);
});

// ── conditional and per-unit damage ──────────────────────────────────────────────────────

const damageOf = (res) => res.state.players.p2.zones.active.find((c) => !c.attachedTo)?.damage ?? 0;

test('HB 021 Rillaboom ex Drum Solo adds 140 only when it is the only Pokémon in play', () => {
  const text = 'If Rillaboom is your only Pokémon in play, this attack does 140 more damage';
  const alone = board('Rillaboom ex', text, { damage: '160+' });
  assert.equal(damageOf(attack(alone.state)), 300);
  const withBench = board('Rillaboom ex', text, {
    damage: '160+',
    setup: (s) => s.players.p1.zones.bench.push(mon('Friend')),
  });
  assert.equal(damageOf(attack(withBench.state)), 160);
  const oppBench = board('Rillaboom ex', text, {
    damage: '160+',
    setup: (s) => s.players.p2.zones.bench.push(mon('Foe Bench')),
  });
  assert.equal(damageOf(attack(oppBench.state)), 300, 'the opponent’s Bench does not count');
});

test('HB 055 Kommo-o War Cry adds 90 when you have fewer Pokémon in play than your opponent', () => {
  const text = 'If you have fewer Pokémon in play than your opponent, this attack does 90 more damage.';
  const behind = board('Kommo-o', text, {
    damage: '30+',
    setup: (s) => s.players.p2.zones.bench.push(mon('Foe Bench')),
  });
  assert.equal(damageOf(attack(behind.state)), 120);
  const level = board('Kommo-o', text, { damage: '30+' });
  assert.equal(damageOf(attack(level.state)), 30);
});

test('HB 116 Galarian Moltres ex Fiery Wrath adds 80 when it has less than 70 HP remaining', () => {
  const text = 'If this Pokémon has less than 70 HP, this attack does 80 more damage.';
  const hurt = board('Galarian Moltres ex', text, { damage: '110+', attackerExtra: { hp: 150, damage: 90 } });
  assert.equal(damageOf(attack(hurt.state)), 190);
  const healthy = board('Galarian Moltres ex', text, { damage: '110+', attackerExtra: { hp: 150, damage: 70 } });
  assert.equal(damageOf(attack(healthy.state)), 110);
});

test('HB 143 Gardevoir Psyshock adds 50 per Pokémon ex the opponent has in play', () => {
  const text = 'This attack does 50 more damage for each Pokémon ex your opponent has in play.';
  const { state } = board('Gardevoir', text, {
    damage: '80+',
    defenderExtra: { name: 'Foe ex', subtypes: ['Basic', 'ex'], hp: 400 },
    setup: (s) => {
      s.players.p2.zones.bench.push(mon('Bench ex', { subtypes: ['Basic', 'ex'] }), mon('Plain'));
    },
  });
  assert.equal(damageOf(attack(state)), 80 + 50 * 2);
});

test('HB 167 Alakazam ex Spoon Bend adds 30 when the opponent’s Active Pokémon has {M} Energy', () => {
  const text = "If the opponent's Active Pokémon has any {M} Energy attached, this attack does 30 more damage";
  const metal = board('Alakazam ex', text, {
    damage: '50+',
    setup: (s, { defender }) => s.players.p2.zones.active.push(energy('Metal', defender.instanceId)),
  });
  assert.equal(damageOf(attack(metal.state)), 80);
  const fire = board('Alakazam ex', text, {
    damage: '50+',
    setup: (s, { defender }) => s.players.p2.zones.active.push(energy('Fire', defender.instanceId)),
  });
  assert.equal(damageOf(attack(fire.state)), 50);
});

test('HB 208 Tapu Fini Shining Currents adds 60 if one of your Water Pokémon was healed this turn', () => {
  const text = 'If any of your Water Pokémon were healed during this turn, this attack does 60 more damage.';
  const healed = board('Tapu Fini', text, {
    damage: '60+',
    attackerExtra: { types: ['Water'] },
    setup: (s) => s.players.p1.zones.bench.push(mon('Wet Friend', { types: ['Water'], healedTurn: s.turn.number })),
  });
  assert.equal(damageOf(attack(healed.state)), 120);
  const none = board('Tapu Fini', text, {
    damage: '60+',
    attackerExtra: { types: ['Water'] },
    setup: (s) => s.players.p1.zones.bench.push(mon('Fire Friend', { types: ['Fire'], healedTurn: s.turn.number })),
  });
  assert.equal(damageOf(attack(none.state)), 60);
});

// ── cards the oracle harness could not exercise (its board has no Special Energy / Stadium) ──

const attachedTo = (state, pid, host) =>
  [...zone(state, pid, 'active'), ...zone(state, pid, 'bench')].filter((c) => c.attachedTo === host.instanceId);
const specialEnergy = (host) =>
  createCard({
    instanceId: nextId++,
    name: 'Double Turbo Energy',
    supertype: 'Energy',
    subtypes: ['Special'],
    energyType: 'Colorless',
    attachedTo: host.instanceId,
  });

test('HB 041 Garchomp Crunch discards a Special Energy from the Defending Pokémon', () => {
  const { state, defender } = board('Garchomp', 'Discard a Special Energy attached to the Defending Pokémon.', {
    damage: '80',
    setup: (s, { defender: d }) => s.players.p2.zones.active.push(specialEnergy(d), energy('Fire', d.instanceId)),
  });
  const res = attack(state);
  const left = attachedTo(res.state, 'p2', defender);
  assert.deepEqual(left.map((c) => c.name), ['Basic Fire Energy']);
});

test('HB 114 Galarian Zapdos ex Thunderous Kick discards a Special Energy before damage', () => {
  const { state, defender } = board(
    'Galarian Zapdos ex',
    "Before doing damage, discard a Special Energy from your opponent's Active Pokémon.",
    {
      damage: '150',
      setup: (s, { defender: d }) => s.players.p2.zones.active.push(specialEnergy(d)),
    }
  );
  const res = attack(state);
  assert.equal(attachedTo(res.state, 'p2', defender).length, 0);
});

test('HB 073 Charmander Blazing Destruction discards the Stadium in play', () => {
  const { state } = board('Charmander', 'Discard a Stadium in play.', {
    setup: (s) => {
      s.stadium = trainer('Some Stadium', 'Stadium');
      s.stadium.ownerId = 'p2';
    },
  });
  const res = attack(state);
  assert.equal(res.state.stadium ?? null, null);
  assert.ok(zone(res.state, 'p2', 'discard').some((c) => c.name === 'Some Stadium'));
});

test('HB 026 Amoonguss ex Champignon’s Swing discards a Basic Energy on heads only', () => {
  const text = "Flip a coin. If heads, discard a Basic Energy from your opponent's Active Pokémon.";
  const outcomes = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const { state, defender } = board('Amoonguss ex', text, {
      damage: '80',
      setup: (s, { defender: d }) => s.players.p2.zones.active.push(energy('Water', d.instanceId), specialEnergy(d)),
    });
    const res = attack(state, seed);
    const names = attachedTo(res.state, 'p2', defender).map((c) => c.name);
    outcomes.add(names.length);
    assert.ok(names.includes('Double Turbo Energy'), 'the Special Energy is never the discard');
  }
  assert.deepEqual([...outcomes].sort(), [1, 2], 'heads removes the Basic, tails keeps both');
});

test('HB 231 Mamoswine ex Rumbling March adds 40 per Stage 2 Pokémon on your Bench', () => {
  const { state } = board('Mamoswine ex', 'This attack does 40 more damage for each Stage 2 Pokémon on your Bench.', {
    damage: '180+',
    setup: (s) => {
      s.players.p1.zones.bench.push(
        mon('Big A', { stage: 'Stage 2', subtypes: ['Stage 2'] }),
        mon('Big B', { stage: 'Stage 2', subtypes: ['Stage 2'] }),
        mon('Small', { stage: 'Stage 1', subtypes: ['Stage 1'] })
      );
    },
  });
  assert.equal(damageOf(attack(state)), 260);
});

// ── new steps: shuffle both, move counters ───────────────────────────────────────────────

const BYE_BYE =
  "Choose 1 of your opponent's Benched Pokémon. Shuffle that Pokémon and all attached cards into their deck, and then shuffle this Pokémon and all attached cards into your deck. If your opponent has no Benched Pokémon, this attack does nothing.";

test('HB 009 Butterfree Bye-Bye Flight shuffles the chosen Benched Pokémon and itself into their decks', () => {
  let benched;
  const { state, attacker } = board('Butterfree', BYE_BYE, {
    setup: (s, { attacker: a }) => {
      benched = mon('Foe Bench');
      s.players.p2.zones.bench.push(benched, energy('Water', benched.instanceId));
      s.players.p1.zones.bench.push(mon('My Bench'));
      s.players.p1.zones.active.push(energy('Grass', a.instanceId));
    },
  });
  const res = attack(state);
  assert.equal(res.error, null);
  const done = res.state.pendingChoice ? choose(res, [benched.instanceId]) : res;
  assert.ok(zone(done.state, 'p2', 'deck').some((c) => c.name === 'Foe Bench'), 'their Bench Pokémon is in their deck');
  assert.ok(zone(done.state, 'p2', 'deck').some((c) => c.name === 'Basic Water Energy'), 'its Energy goes too');
  assert.equal(zone(done.state, 'p2', 'bench').length, 0);
  assert.ok(zone(done.state, 'p1', 'deck').some((c) => c.instanceId === attacker.instanceId), 'Butterfree is in my deck');
  assert.ok(zone(done.state, 'p1', 'deck').some((c) => c.name === 'Basic Grass Energy'), 'its Energy goes too');
});

test('HB 009 Butterfree Bye-Bye Flight does nothing when the opponent has no Benched Pokémon', () => {
  const { state, attacker } = board('Butterfree', BYE_BYE);
  const res = attack(state);
  assert.equal(zone(res.state, 'p1', 'active').some((c) => c.instanceId === attacker.instanceId) ||
    zone(res.state, 'p1', 'bench').some((c) => c.instanceId === attacker.instanceId), true);
  assert.ok(!zone(res.state, 'p1', 'deck').some((c) => c.instanceId === attacker.instanceId));
});

test('HB 022 Whimsicott Cotton Breeze moves all damage counters from a Benched Pokémon onto the Defending Pokémon', () => {
  const { state } = board('Whimsicott', 'Move all damage counters from one of your Benched Pokémon onto the Defending Pokémon', {
    setup: (s) => s.players.p1.zones.bench.push(mon('Hurt Friend', { damage: 70 })),
  });
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(zone(res.state, 'p1', 'bench').find((c) => c.name === 'Hurt Friend')?.damage ?? 0, 0);
  assert.equal(damageOf(res), 70);
});

// ── bucket copy of customhb (published 2026-11-03): attacks the engine ran partly or not at all ──
// Text is the bucket set.json effect, or the wording the card is being rewritten to
// (.agent/scratch/customhb-bucket-attack-rewrites.md).

const CRUSHING_GRIP = "This attack does 20 less damage for each Retreat Cost your opponent's Active Pokémon has.";

test('HB 537 Galvantula ex Crushing Grip does 20 less for each {C} in the Defending Pokémon’s Retreat Cost', () => {
  const two = board('Galvantula ex', CRUSHING_GRIP, { damage: '200-', defenderExtra: { retreatCost: ['Colorless', 'Colorless'] } });
  assert.equal(damageOf(attack(two.state)), 160);
  const none = board('Galvantula ex', CRUSHING_GRIP, { damage: '200-', defenderExtra: { retreatCost: [] } });
  assert.equal(damageOf(attack(none.state)), 200);
});

test('HB 147 Scyther Harvesting Scythe moves a Basic Energy from the Defending Pokémon to your Benched Pokémon', () => {
  let fire;
  let friend;
  const { state, defender } = board(
    'Scyther',
    "Move 1 Basic Energy from your opponent's Active Pokémon to 1 of your Benched Pokémon.",
    {
      damage: '70',
      setup: (s, { defender: d }) => {
        fire = energy('Fire', d.instanceId);
        s.players.p2.zones.active.push(specialEnergy(d), fire);
        friend = mon('My Bench');
        s.players.p1.zones.bench.push(friend);
      },
    }
  );
  const res = attack(state);
  assert.equal(res.error, null);
  const done = res.state.pendingChoice ? choose(res, [fire.instanceId]) : res;
  assert.deepEqual(ids(attachedTo(done.state, 'p1', friend)), [fire.instanceId], 'the Fire Energy is on my Benched Pokémon');
  assert.equal(attachedTo(done.state, 'p2', defender).length, 1, 'only the Special Energy stays');
  assert.ok(!zone(done.state, 'p2', 'active').some((c) => c.instanceId === fire.instanceId), 'it left their zones');
});

const TERMINAL_CUT =
  "Double the number of damage counters on your opponent's Active Pokémon. This attack can't leave it with less than 10 HP remaining";

test('HB 459 Mega Absol ex Terminal Cut doubles the Defending Pokémon’s damage counters, leaving it at least 10 HP', () => {
  const doubled = board('Mega Absol ex', TERMINAL_CUT, { defenderExtra: { hp: 400, damage: 100 } });
  assert.equal(attack(doubled.state).state.players.p2.zones.active[0].damage, 200);
  const capped = board('Mega Absol ex', TERMINAL_CUT, { defenderExtra: { hp: 400, damage: 250 } });
  assert.equal(attack(capped.state).state.players.p2.zones.active[0].damage, 390);
  const clean = board('Mega Absol ex', TERMINAL_CUT, { defenderExtra: { hp: 400 } });
  assert.equal(attack(clean.state).state.players.p2.zones.active[0].damage, 0);
});

const discardAny = (then) =>
  `You may discard any number of Energy cards attached to this Pokémon when you use this attack. If you do, ${then}`;

function withThreeEnergy(name, text, damage) {
  const picks = [];
  const built = board(name, text, {
    damage,
    setup: (s, { attacker: a }) => {
      for (const t of ['Fire', 'Water', 'Grass']) {
        const e = energy(t, a.instanceId);
        picks.push(e);
        s.players.p1.zones.active.push(e);
      }
    },
  });
  return { ...built, picks };
}

test('HB 477 Raticate Gnaw mills one opponent card per Energy discarded, and nothing when none is', () => {
  const GNAW = discardAny("discard that many cards from the top of your opponent's deck.");
  const two = withThreeEnergy('Raticate', GNAW, '50');
  const done = choose(attack(two.state), ids(two.picks.slice(0, 2)));
  assert.equal(zone(done.state, 'p1', 'discard').length, 2);
  assert.equal(zone(done.state, 'p2', 'discard').length, 2);
  const none = withThreeEnergy('Raticate', GNAW, '50');
  const skipped = choose(attack(none.state), []);
  assert.equal(zone(skipped.state, 'p2', 'discard').length, 0);
});

test('HB 466 Regigigas ex Creation draws 2 cards per Energy discarded, and nothing when none is', () => {
  const CREATION = discardAny('draw 2 cards for each card you discarded in this way.');
  const two = withThreeEnergy('Regigigas ex', CREATION, '150');
  const done = choose(attack(two.state), ids(two.picks.slice(0, 2)));
  assert.equal(zone(done.state, 'p1', 'hand').length, 4);
  assert.equal(damageOf(done), 150);
  const none = withThreeEnergy('Regigigas ex', CREATION, '150');
  assert.equal(zone(choose(attack(none.state), []).state, 'p1', 'hand').length, 0);
});
