// Design 048 (I184-I189): GX backlog engine features, board-level and parser tests.
// Every card's text is the corpus row in out/pkmn-gx-cards.json (cited by set/number below).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const supporter = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Supporter'] });
const item = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Item'] });
const energyCard = (type, attachedTo = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
  });
const atk = (name, damage, text, cost = []) => ({ name, cost, damage, text });

function game(setup, { rulesEnabled = false } = {}) {
  const state = createGameState({ gameId: 'gx-backlog-ii', seed: 7, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 15; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  setup(state, state.players.p1, state.players.p2);
  return state;
}

function runAttack(state, { attackIndex = 0, selectionFor } = {}) {
  const pick = selectionFor || ((pc) => pc.options.slice(0, Math.max(pc.min || 0, 1)).map((o) => o.instanceId));
  let res = applyCommand(
    state,
    { type: 'attack', playerId: 'p1', payload: { attackIndex } },
    createRng(7)
  );
  assert.equal(res.error, null, res.reason);
  const events = [...(res.events || [])];
  let guard = 0;
  while (res.state.pendingChoice && guard++ < 12) {
    const pc = res.state.pendingChoice;
    res = applyCommand(
      res.state,
      {
        type: 'resolveChoice',
        playerId: pc.player,
        payload: { choiceId: pc.choiceId, selection: pick(pc) },
      },
      createRng(7 + guard)
    );
    assert.equal(res.error, null, res.reason);
    events.push(...(res.events || []));
  }
  return { ...res, events };
}

const eventTypes = (res) => new Set((res.events || []).map((e) => e.type));
const activeRoot = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);
const benchRoots = (state, pid) => state.players[pid].zones.bench.filter((c) => !c.attachedTo);

// ── I187: scaling residuals + Kaleidostorm anomaly ──────────────────────────

const KALEIDOSTORM =
  'Move any number of Energy from your Pokémon to your other Pokémon in any way you like.';
const BREAKDOWN =
  "For each card in your opponent's hand, put 1 damage counter on their Active Pokémon.";
const DITCH_AND_SPLASH =
  'Discard any number of Supporter cards from your hand. This attack does 40 damage for each card you discarded in this way.';
const CHUCK_AWAY =
  'Discard up to 2 cards from your hand. This attack does 40 damage for each card you discarded in this way.';
const JUMPING_BALLOON =
  "This attack does 60 more damage for each of your opponent's Pokémon-GX and Pokémon-EX in play.";

test('I187 parse: Kaleidostorm does not fabricate ×Energy damage from its move clause', () => {
  const parsed = parseAttackDamage({ damage: 150, text: KALEIDOSTORM }, {}, {}, { energyCount: 2 });
  assert.equal(parsed.total, 150);
  assert.deepEqual(parsed.components, []);
});

test('I187 parse: hand-discard scaling reads the discarded count', () => {
  const ditch = parseAttackDamage({ damage: 40, text: DITCH_AND_SPLASH }, {}, {}, { handDiscarded: 2 });
  assert.equal(ditch.total, 80);
  assert.ok(ditch.components.includes('per-hand-discarded'));
  const chuck = parseAttackDamage({ damage: 40, text: CHUCK_AWAY }, {}, {}, { handDiscarded: 1 });
  assert.equal(chuck.total, 40);
});

test('I187 parse: Breakdown is a per-opponent-hand counter step', () => {
  const parsed = parseAttackSteps(BREAKDOWN);
  assert.deepEqual(parsed.after, [
    { type: 'atkCountersEach', count: 1, scope: 'active', perOpponentHand: true },
  ]);
});

test('I187 parse: Jumping Balloon scales with the opponent GX/EX count', () => {
  const withTwo = parseAttackDamage({ damage: 60, text: JUMPING_BALLOON }, {}, {}, { opponentGxExCount: 2 });
  assert.equal(withTwo.total, 180);
  const none = parseAttackDamage({ damage: 60, text: JUMPING_BALLOON }, {}, {}, { opponentGxExCount: 0 });
  assert.equal(none.total, 60);
});

test('I187 board: Kaleidostorm deals its printed 150 and still moves Energy', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Gardevoir & Sylveon-GX', {
      hp: 200,
      attacks: [atk('Kaleidostorm', 150, KALEIDOSTORM, ['Fairy', 'Fairy', 'Colorless'])],
    });
    const bench = mon('Bench A');
    p1.zones.active.push(attacker);
    p1.zones.bench.push(bench, energyCard('Water', attacker.instanceId), energyCard('Psychic', attacker.instanceId));
    const defender = mon('Defender', { hp: 300, types: ['Water'] });
    defender.damage = 30;
    p2.zones.active.push(defender);
  });
  const res = runAttack(state);
  const defender = activeRoot(res.state, 'p2');
  assert.equal(defender.damage, 180, '150 + pre-existing 30, not 300');
  assert.ok(!eventTypes(res).has('pokemonKnockedOut'));
});

test('I187 board: Breakdown places one counter per card in the opponent hand', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Mr. Mime-GX', { hp: 200, attacks: [atk('Breakdown', 0, BREAKDOWN)] });
    p1.zones.active.push(attacker);
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.hand.push(supporter('a'), supporter('b'), item('c'), mon('d'));
  });
  const res = runAttack(state);
  assert.equal(activeRoot(res.state, 'p2').damage, 40);
});

test('I187 board: Ditch and Splash scales with the discarded Supporters', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Slowpoke & Psyduck-GX', {
      hp: 200,
      attacks: [atk('Ditch and Splash', 40, DITCH_AND_SPLASH)],
    });
    p1.zones.active.push(attacker);
    p1.zones.hand.push(supporter('Sup A'), supporter('Sup B'), mon('HandMon'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, {
    selectionFor: (pc) =>
      pc.options
        .filter((o) => /Sup/.test(o.name || ''))
        .map((o) => o.instanceId)
        .slice(0, 2),
  });
  assert.equal(p1HandSize(res), 1, 'both Supporters were discarded');
  assert.equal(activeRoot(res.state, 'p2').damage, 80);
});

test('I187 board: Chuck Away scales with up to two discarded cards', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Alolan Raticate-GX', {
      hp: 200,
      attacks: [atk('Chuck Away', 40, CHUCK_AWAY)],
    });
    p1.zones.active.push(attacker);
    p1.zones.hand.push(supporter('one'), item('two'), mon('three'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, {
    selectionFor: (pc) => pc.options.slice(0, 2).map((o) => o.instanceId),
  });
  assert.equal(p1HandSize(res), 1);
  assert.equal(activeRoot(res.state, 'p2').damage, 80);
});

function p1HandSize(res) {
  return res.state.players.p1.zones.hand.length;
}

// ── I186: bounce / bench setup ──────────────────────────────────────────────

const PLEA = "Put 2 of your opponent's Benched Pokémon and all cards attached to them into your opponent's hand.";
const DARK_MIST = "Put 1 of your opponent's Benched Pokémon and all cards attached to it into your opponent's hand.";
const DEN_OF_INIQUITY =
  "Choose 1 of your opponent's Pokémon. Your opponent shuffles that Pokémon and all cards attached to it into their deck.";
const DREAM_FEAR =
  "Choose 1 of your opponent's Benched Pokémon. Your opponent shuffles that Pokémon and all cards attached to it into their deck.";
const BREEZE_AWAY = 'Put any number of your Pokémon in play and all cards attached to them into your hand.';
const ETERNAL_FLAME =
  'Put 3 in any combination of {R} Pokémon-GX or {R} Pokémon-EX from your discard pile onto your Bench.';
const STONE_AGE = 'Put any number of Pokémon that evolve from Unidentified Fossil from your discard pile onto your Bench.';
const MASSIVE_CATCH =
  'Look at the top 12 cards of your deck and put any number of Basic Pokémon you find there onto your Bench. Shuffle the other cards back into your deck.';

test('I186 board: Plea-GX returns 2 Benched Pokémon and their attachments to hand', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Sylveon-GX', { hp: 200, attacks: [atk('Plea-GX', 0, PLEA)] }));
    for (let i = 0; i < 3; i++) {
      const b = mon(`Bench ${i}`);
      p2.zones.bench.push(b, energyCard('Water', b.instanceId));
    }
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, { selectionFor: (pc) => pc.options.slice(0, 2).map((o) => o.instanceId) });
  assert.equal(benchRoots(res.state, 'p2').length, 1);
  const moved = res.events.filter((e) => e.type === 'cardMoved' && e.to === 'hand');
  assert.equal(moved.length, 4, '2 Pokémon + 2 Energy');
});

test('I186 board: Dark Mist-GX returns 1 Benched Pokémon', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Greninja-GX', { hp: 200, attacks: [atk('Dark Mist-GX', 0, DARK_MIST)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.bench.push(mon('Only bench'));
  });
  const res = runAttack(state);
  assert.equal(benchRoots(res.state, 'p2').length, 0);
  const bounced = res.events.filter((e) => e.type === 'cardMoved' && e.to === 'hand' && e.playerId === 'p2');
  assert.equal(bounced.length, 1);
});

test('I186 board: Den of Iniquity-GX shuffles any chosen opponent Pokémon into their deck', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Shiftry-GX', { hp: 200, attacks: [atk('Den of Iniquity-GX', 0, DEN_OF_INIQUITY)] }));
    const active = mon('Defender', { hp: 300 });
    const bench = mon('Bench', { hp: 120 });
    p2.zones.active.push(active);
    p2.zones.bench.push(bench, energyCard('Water', bench.instanceId));
  });
  const res = runAttack(state, {
    selectionFor: (pc) => [pc.options.find((o) => /Bench/.test(o.name)).instanceId],
  });
  assert.equal(benchRoots(res.state, 'p2').length, 0, 'the chosen Benched Pokémon left the Bench');
  const deckNames = res.state.players.p2.zones.deck.map((c) => c.name);
  assert.ok(deckNames.includes('Bench'));
  assert.equal(activeRoot(res.state, 'p2').name, 'Defender', 'the Active was not touched');
});

test('I186 board: Dream Fear-GX shuffles a chosen Benched Pokémon into the deck', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Mimikyu-GX', { hp: 200, attacks: [atk('Dream Fear-GX', 0, DREAM_FEAR)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.bench.push(mon('Bench A'), mon('Bench B'));
  });
  const res = runAttack(state, { selectionFor: (pc) => [pc.options[0].instanceId] });
  assert.equal(benchRoots(res.state, 'p2').length, 1);
});

test('I186 board: Breeze Away-GX returns chosen own Pokémon to hand', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Virizion-GX', { hp: 200, attacks: [atk('Breeze Away-GX', 0, BREEZE_AWAY)] });
    const bench = mon('Bench A');
    p1.zones.active.push(attacker);
    p1.zones.bench.push(bench, energyCard('Grass', bench.instanceId));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, {
    selectionFor: (pc) => [pc.options.find((o) => /Bench/.test(o.name)).instanceId],
  });
  assert.equal(benchRoots(res.state, 'p1').length, 0);
  assert.equal(activeRoot(res.state, 'p1').name, 'Virizion-GX');
  assert.ok(res.state.players.p1.zones.hand.some((c) => c.name === 'Bench A'));
});

test('I186 board: Eternal Flame-GX benches only {R} Pokémon-GX/-EX from the discard', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Ho-Oh-GX', { hp: 200, attacks: [atk('Eternal Flame-GX', 0, ETERNAL_FLAME)] }));
    p1.zones.discard.push(
      mon('Fire GX', { types: ['Fire'], subtypes: ['GX'] }),
      mon('Fire EX', { types: ['Fire'], subtypes: ['EX', 'Basic'] }),
      mon('Water GX', { types: ['Water'], subtypes: ['GX'] }),
      mon('Fire Basic', { types: ['Fire'] })
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  const names = benchRoots(res.state, 'p1').map((c) => c.name).sort();
  assert.deepEqual(names, ['Fire EX', 'Fire GX']);
});

test('I186 board: Stone Age-GX benches Pokémon that evolve from Unidentified Fossil', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Carracosta-GX', { hp: 200, attacks: [atk('Stone Age-GX', 0, STONE_AGE)] }));
    p1.zones.discard.push(
      mon('Carracosta', { stage: 'Stage 1', evolvesFrom: 'Unidentified Fossil' }),
      mon('Kabutops', { stage: 'Stage 1', evolvesFrom: 'Unidentified Fossil' }),
      mon('Other Stage 1', { stage: 'Stage 1', evolvesFrom: 'Something Else' })
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state, { selectionFor: (pc) => pc.options.map((o) => o.instanceId) });
  const names = benchRoots(res.state, 'p1').map((c) => c.name).sort();
  assert.deepEqual(names, ['Carracosta', 'Kabutops']);
});

test('I186 board: Massive Catch-GX benches Basic Pokémon from the top 12', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Wishiwashi-GX', { hp: 200, attacks: [atk('Massive Catch-GX', 0, MASSIVE_CATCH)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p1.zones.deck.length = 0;
    for (let i = 0; i < 14; i++) p1.zones.deck.push(supporter(`deck ${i}`));
    p1.zones.deck.unshift(mon('Top Basic A'), supporter('Top Trainer'), mon('Top Basic B'));
  });
  const deckBefore = 17;
  const res = runAttack(state, {
    selectionFor: (pc) => pc.options.slice(0, pc.max).map((o) => o.instanceId),
  });
  const names = benchRoots(res.state, 'p1').map((c) => c.name).sort();
  assert.deepEqual(names, ['Top Basic A', 'Top Basic B']);
  assert.equal(res.state.players.p1.zones.deck.length, deckBefore - 2);
});

// ── I185: KO / prize gaps ───────────────────────────────────────────────────

const SILVER_KNIGHT = "If your opponent's Active Pokémon is an Ultra Beast, it is Knocked Out.";
const LUNAR_FALL = "Knock Out 1 of your opponent's Basic Pokémon that isn't a Pokémon-GX.";
const GG_END =
  "Discard 1 of your opponent's Pokémon and all cards attached to it. If this Pokémon has at least 3 extra {F} Energy attached to it (in addition to this attack's cost), discard 2 of your opponent's Pokémon instead.";
const BIG_THROW = "Discard your opponent's Active Pokémon and all cards attached to it.";
const SYMBIONT = "Add the top 2 cards of your opponent's deck to their Prize cards.";
const INJECTION = "Add a card from your opponent's discard pile to their Prize cards face down.";
const STINGER =
  'Both players shuffle their Prize cards into their decks. Then, each player puts the top 3 cards of their deck face down as their Prize cards.';
const BLASTER = 'Turn all of your Prize cards face up. (Those Prize cards remain face up for the rest of the game.)';
const DISCOVERY =
  "Count your Prize cards and put them into your hand. Then, take that many cards from the top of your deck and put them face down as your Prize cards. If you don't have that many cards in your deck, this attack does nothing.";
const CHAOTIC_ORDER =
  'Turn all of your Prize cards face up. (Those Prize cards remain face up for the rest of the game.) If this Pokémon has at least 1 extra {P} Energy and 1 extra {D} Energy attached to it (in addition to this attack\'s cost), take 2 Prize cards.';
const PALE_MOON =
  "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out. If this Pokémon has at least 1 extra {P} Energy attached to it (in addition to this attack's cost), discard all Energy from your opponent's Active Pokémon.";

test('I185 board: Silver Knight-GX Knocks Out an Ultra Beast Active', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Silvally-GX', { hp: 200, attacks: [atk('Silver Knight-GX', 0, SILVER_KNIGHT)] }));
    p2.zones.active.push(mon('Nihilego-GX', { hp: 300 }));
    p2.zones.bench.push(mon('Backup'));
  });
  const res = runAttack(state);
  assert.ok(eventTypes(res).has('pokemonKnockedOut'));
  assert.equal(activeRoot(res.state, 'p2').name, 'Backup', 'promoted after the KO');
});

test('I185 board: Silver Knight-GX leaves a non-Ultra-Beast Active alone', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Silvally-GX', { hp: 200, attacks: [atk('Silver Knight-GX', 0, SILVER_KNIGHT)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  assert.ok(!eventTypes(res).has('pokemonKnockedOut'));
});

test('I185 board: Lunar Fall-GX Knocks Out a Basic non-GX', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Lunala-GX', { hp: 200, attacks: [atk('Lunar Fall-GX', 0, LUNAR_FALL)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  assert.ok(eventTypes(res).has('pokemonKnockedOut'));
});

test('I185 board: GG End-GX discards instead of Knocking Out, and 3 extra Energy discard 2', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Garchomp & Giratina-GX', {
      hp: 200,
      attacks: [atk('GG End-GX', 0, GG_END, ['Fighting'])],
    });
    p1.zones.active.push(
      attacker,
      energyCard('Fighting', attacker.instanceId),
      energyCard('Fighting', attacker.instanceId),
      energyCard('Fighting', attacker.instanceId),
      energyCard('Fighting', attacker.instanceId)
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.bench.push(mon('Bench A'), mon('Bench B'));
  });
  const res = runAttack(state, {
    selectionFor: (pc) =>
      pc.prompt.includes('discard')
        ? pc.options.slice(0, pc.min || 1).map((o) => o.instanceId)
        : pc.options.slice(0, Math.max(pc.min || 0, 1)).map((o) => o.instanceId),
  });
  assert.ok(!eventTypes(res).has('pokemonKnockedOut'), 'discard is not a Knock Out');
  const discardedEvents = res.events.filter(
    (e) => e.type === 'cardsDiscarded' && e.reason === 'attack-discard'
  );
  assert.equal(discardedEvents.length, 2, '4 Fighting Energy vs a 1-Energy cost = 3 extra');
  assert.equal(res.state.players.p1.flags.prizesOwed || 0, 0, 'no Prizes from a discard');
});

test('I185 board: Big Throw-GX discards the opponent Active and its attachments', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Bewear-GX', { hp: 200, attacks: [atk('Big Throw-GX', 0, BIG_THROW)] }));
    const active = mon('Defender', { hp: 300 });
    p2.zones.active.push(active, energyCard('Water', active.instanceId));
    p2.zones.bench.push(mon('Backup'));
  });
  const res = runAttack(state);
  assert.ok(!eventTypes(res).has('pokemonKnockedOut'));
  assert.equal(activeRoot(res.state, 'p2').name, 'Backup');
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Defender'));
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.name === 'Basic Water Energy'));
});

test('I185 board: Symbiont-GX adds the top 2 opponent deck cards to their Prizes', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Nihilego-GX', { hp: 200, attacks: [atk('Symbiont-GX', 0, SYMBIONT)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const before = state.players.p2.zones.deck.length;
  const res = runAttack(state);
  assert.equal(res.state.players.p2.zones.prizes.length, 8);
  const moved = res.events.filter((e) => e.type === 'cardMoved' && e.to === 'prizes');
  assert.equal(moved.length, 2);
  assert.equal(res.state.players.p2.zones.deck.length, before - 3, '2 to Prizes + the turn-start draw');
});

test('I185 board: Injection-GX adds a discard card to the opponent Prizes', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Naganadel-GX', { hp: 200, attacks: [atk('Injection-GX', 0, INJECTION)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.discard.push(supporter('Lost card'));
  });
  const res = runAttack(state);
  assert.equal(res.state.players.p2.zones.prizes.length, 7);
  assert.ok(res.state.players.p2.zones.prizes.some((c) => c.name === 'Lost card'));
});

test('I185 board: Stinger-GX resets both sides to 3 fresh Prizes', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Naganadel-GX', { hp: 200, attacks: [atk('Stinger-GX', 0, STINGER)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  assert.equal(res.state.players.p1.zones.prizes.length, 3);
  assert.equal(res.state.players.p2.zones.prizes.length, 3);
  assert.ok(res.state.players.p1.zones.prizes.every((c) => !c.revealed));
});

test('I185 board: Blaster-GX turns all Prizes face up for the rest of the game', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Celesteela-GX', { hp: 200, attacks: [atk('Blaster-GX', 0, BLASTER)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  assert.equal(res.state.players.p1.zones.prizes.filter((c) => c.revealed).length, 6);
});

test('I185 board: Discovery-GX swaps the Prizes for the same count from the deck', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Celesteela-GX', { hp: 200, attacks: [atk('Discovery-GX', 0, DISCOVERY)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const deckBefore = state.players.p1.zones.deck.length;
  const res = runAttack(state);
  assert.equal(res.state.players.p1.zones.hand.length, 6, 'the 6 Prizes went to hand');
  assert.equal(res.state.players.p1.zones.prizes.length, 6);
  assert.equal(res.state.players.p1.zones.deck.length, deckBefore - 6);
});

test('I185 board: Discovery-GX does nothing when the deck is shorter than the Prizes', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Celesteela-GX', { hp: 200, attacks: [atk('Discovery-GX', 0, DISCOVERY)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p1.zones.deck.length = 3;
  });
  const res = runAttack(state);
  assert.equal(res.state.players.p1.zones.prizes.length, 6);
  assert.equal(res.state.players.p1.zones.hand.length, 0, 'the effect does nothing');
});

test('I185 board: Chaotic Order-GX reveals Prizes and takes 2 only with the extra Energy', () => {
  const withEnergy = game((s, p1, p2) => {
    const attacker = mon('Naganadel & Guzzlord-GX', {
      hp: 200,
      attacks: [atk('Chaotic Order-GX', 0, CHAOTIC_ORDER, ['Colorless'])],
    });
    p1.zones.active.push(
      attacker,
      energyCard('Psychic', attacker.instanceId),
      energyCard('Darkness', attacker.instanceId)
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(withEnergy, {
    selectionFor: (pc) => pc.options.slice(0, pc.min || 1).map((o) => o.instanceId),
  });
  assert.equal(res.state.players.p1.zones.prizes.length, 4, '2 of the 6 Prizes were taken');
  assert.ok(res.state.players.p1.zones.prizes.every((c) => c.revealed));
  assert.ok(res.state.players.p1.zones.hand.length >= 2, '2 Prize cards taken');

  const without = game((s, p1, p2) => {
    const attacker = mon('Naganadel & Guzzlord-GX', {
      hp: 200,
      attacks: [atk('Chaotic Order-GX', 0, CHAOTIC_ORDER, ['Colorless'])],
    });
    p1.zones.active.push(attacker, energyCard('Water', attacker.instanceId));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res2 = runAttack(without);
  assert.equal(res2.state.players.p1.zones.hand.length, 0, 'no Prizes taken without the extra Energy');
});

test('I185 board: discarding the opponent last Pokémon wins the game', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Bewear-GX', { hp: 200, attacks: [atk('Big Throw-GX', 0, BIG_THROW)] }));
    p2.zones.active.push(mon('Only Pokémon', { hp: 300 }));
  });
  const res = runAttack(state);
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.winner, 'p1');
  assert.equal(res.state.winReason, 'no Pokémon in play');
});

test('I185 board: Pale Moon-GX Knocks Out the Defending Pokémon at the end of the next turn', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Trevenant & Dusknoir-GX', { hp: 200, attacks: [atk('Pale Moon-GX', 0, PALE_MOON)] }));
    const defender = mon('Defender', { hp: 300 });
    p2.zones.active.push(defender);
    p2.zones.bench.push(mon('Backup'));
  });
  const afterAttack = runAttack(state);
  const res = applyCommand(afterAttack.state, { type: 'pass', playerId: 'p2' }, createRng(11));
  assert.ok(!res.error, res.reason);
  assert.ok(
    (res.events || []).some((e) => e.type === 'deferredKnockOut' || e.type === 'pokemonKnockedOut'),
    'the deferred KO fires at the end of the opponent next turn'
  );
});

// ── I184: locks / extra turns ───────────────────────────────────────────────

const TIMELESS = 'Take another turn after this one. (Skip the between-turns step.)';
const DISTORT = "Your opponent can't play any Item cards from their hand during their next turn.";
const SONIC_VOLUME = "Your opponent can't play any Special Energy cards from their hand during their next turn.";
const HEAVY_ROCK = "Your opponent can't play any cards from their hand during their next turn.";
const IRON_RULE = "During your opponent's next turn, their Pokémon can't attack.";
const HORROR_HOUSE =
  "Your opponent can't play any cards from their hand during their next turn. If this Pokémon has at least 1 extra {P} Energy attached to it (in addition to this attack's cost), each player draws cards until they have 7 cards in their hand.";

test('I184 parse: lock/extra-turn wordings map to their steps', () => {
  const cases = [
    [DISTORT, { type: 'atkOppPlayLock', kinds: ['item'] }],
    [SONIC_VOLUME, { type: 'atkOppPlayLock', kinds: ['specialEnergy'] }],
    [HEAVY_ROCK, { type: 'atkOppPlayLock', kinds: ['any'] }],
    [IRON_RULE, { type: 'atkOppAttackLock' }],
    [TIMELESS, { type: 'atkTakeAnotherTurn' }],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(parseAttackSteps(text).after, [expected], text);
  }
});

test('I184 board: Timeless-GX takes another turn and skips the Checkup', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Dialga-GX', { hp: 200, attacks: [atk('Timeless-GX', 150, TIMELESS)] }));
    const defender = mon('Defender', { hp: 300 });
    defender.specialCondition = 'Poisoned';
    p2.zones.active.push(defender);
  });
  const res = runAttack(state);
  assert.equal(res.state.turn.player, 'p1', 'the same player takes the extra turn');
  assert.equal(res.state.turn.number, 6);
  assert.equal(res.state.players.p1.zones.hand.length, 1, 'the extra turn draws');
  assert.equal(activeRoot(res.state, 'p2').damage, 150, 'only the attack damage — no poison tick');
  assert.ok(eventTypes(res).has('extraTurnGranted'));
});

test('I184 board: Distort locks Items (not Supporters) for the opponent next turn', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Noivern-GX', { hp: 200, attacks: [atk('Distort', 50, DISTORT)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  }, { rulesEnabled: true });
  const itemCard = item('Locked Item');
  const supCard = supporter('Free Supporter');
  state.players.p2.zones.hand.push(itemCard, supCard);
  const res = runAttack(state);
  assert.equal(res.state.turn.player, 'p2');
  const itemCheck = validateLegality(res.state, {
    type: 'playTrainer',
    playerId: 'p2',
    payload: { instanceId: itemCard.instanceId },
  });
  assert.equal(itemCheck.allowed, false);
  assert.match(itemCheck.reason, /stops you playing/);
  const supCheck = validateLegality(res.state, {
    type: 'playTrainer',
    playerId: 'p2',
    payload: { instanceId: supCard.instanceId },
  });
  assert.equal(supCheck.allowed, true, 'an Item-only lock leaves Supporters playable');
  // Expiry: two turns later the lock no longer counts.
  res.state.turn.number = 8;
  const later = validateLegality(res.state, {
    type: 'playTrainer',
    playerId: 'p2',
    payload: { instanceId: itemCard.instanceId },
  });
  assert.equal(later.allowed, true);
});

test('I184 board: Heavy Rock-GX locks every card from hand (Trainer, Energy, Basic)', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Alolan Golem-GX', { hp: 200, attacks: [atk('Heavy Rock-GX', 100, HEAVY_ROCK)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  }, { rulesEnabled: true });
  const energy = energyCard('Water');
  const basic = mon('Hand Basic');
  const anyItem = item('Any Item');
  state.players.p2.zones.hand.push(anyItem, energy, basic);
  const res = runAttack(state);
  const declined = (command) => validateLegality(res.state, { ...command, playerId: 'p2' }).allowed;
  assert.equal(declined({ type: 'playTrainer', payload: { instanceId: anyItem.instanceId } }), false);
  assert.equal(
    declined({ type: 'attachCard', payload: { instanceId: energy.instanceId, targetInstanceId: activeRoot(res.state, 'p2').instanceId } }),
    false
  );
  assert.equal(
    declined({ type: 'moveCard', payload: { instanceId: basic.instanceId, from: 'hand', to: 'bench' } }),
    false
  );
});

test('I184 board: Iron Rule-GX stops the opponent attacking on their next turn only', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Cobalion-GX', { hp: 200, attacks: [atk('Iron Rule-GX', 0, IRON_RULE)] }));
    p2.zones.active.push(
      mon('Defender', { hp: 300, attacks: [{ name: 'Hit', cost: [], damage: 10, text: '' }] })
    );
  }, { rulesEnabled: true });
  const res = runAttack(state);
  const p2Active = activeRoot(res.state, 'p2');
  const attackCheck = validateLegality(res.state, {
    type: 'attack',
    playerId: 'p2',
    payload: { attackIndex: 0, instanceId: p2Active.instanceId },
  });
  assert.equal(attackCheck.allowed, false);
  assert.match(attackCheck.reason, /stops your Pok/);
  res.state.turn.number = 8;
  const later = validateLegality(res.state, {
    type: 'attack',
    playerId: 'p2',
    payload: { attackIndex: 0, instanceId: p2Active.instanceId },
  });
  assert.equal(later.allowed, true);
});

test('I184 board: Horror House-GX draws both players to 7 only with the extra Energy', () => {
  const withEnergy = game((s, p1, p2) => {
    const attacker = mon('Gengar & Mimikyu-GX', {
      hp: 200,
      attacks: [atk('Horror House-GX', 0, HORROR_HOUSE, ['Psychic'])],
    });
    p1.zones.active.push(attacker, energyCard('Psychic', attacker.instanceId), energyCard('Psychic', attacker.instanceId));
    p1.zones.hand.push(mon('a'), mon('b'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(withEnergy);
  assert.equal(res.state.players.p1.zones.hand.length, 7);
  assert.equal(res.state.players.p2.zones.hand.length, 8, '7 from the effect + the turn-start draw');

  const without = game((s, p1, p2) => {
    p1.zones.active.push(mon('Gengar & Mimikyu-GX', { hp: 200, attacks: [atk('Horror House-GX', 0, HORROR_HOUSE)] }));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res2 = runAttack(without);
  assert.equal(res2.state.players.p1.zones.hand.length, 0, 'no draw without the extra Energy');
});

test('I184 board: Supreme Puff-GX takes another turn and the 14 extra Energy shuffle the Bench', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Togepi & Cleffa & Igglybuff-GX', {
      hp: 200,
      attacks: [
        atk('Supreme Puff-GX', 0, 'Take another turn after this one. (Skip the between-turns step.) If this Pokémon has at least 14 extra {Y} Energy attached to it (in addition to this attack\'s cost), your opponent shuffles all of their Benched Pokémon and all cards attached to them into their deck.', ['Colorless']),
      ],
    });
    p1.zones.active.push(attacker);
    for (let i = 0; i < 15; i++) p1.zones.active.push(energyCard('Fairy', attacker.instanceId));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.bench.push(mon('Bench A'), mon('Bench B'));
  });
  const res = runAttack(state);
  assert.equal(res.state.turn.player, 'p1');
  assert.equal(benchRoots(res.state, 'p2').length, 0, 'the whole Bench was shuffled away');

  const without = game((s, p1, p2) => {
    p1.zones.active.push(
      mon('Togepi & Cleffa & Igglybuff-GX', {
        hp: 200,
        attacks: [
          atk('Supreme Puff-GX', 0, 'Take another turn after this one. (Skip the between-turns step.) If this Pokémon has at least 14 extra {Y} Energy attached to it (in addition to this attack\'s cost), your opponent shuffles all of their Benched Pokémon and all cards attached to them into their deck.', ['Colorless']),
        ],
      })
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
    p2.zones.bench.push(mon('Bench A'), mon('Bench B'));
  });
  const res2 = runAttack(without);
  assert.equal(res2.state.turn.player, 'p1', 'the extra turn is unconditional');
  assert.equal(benchRoots(res2.state, 'p2').length, 2, 'no Energy, no Bench shuffle');
});

// ── I188: recovery / copy ───────────────────────────────────────────────────

const BACKFIRE = 'Put 2 {R} Energy attached to this Pokémon into your hand.';
const TRICKSTER = "Choose 1 of your opponent's Pokémon's attacks and use it as this attack.";

test('I188 board: Backfire returns 2 {R} Energy to hand and leaves other Energy attached', () => {
  const state = game((s, p1, p2) => {
    const attacker = mon('Volcarona-GX', { hp: 200, attacks: [atk('Backfire', 160, BACKFIRE)] });
    p1.zones.active.push(
      attacker,
      energyCard('Fire', attacker.instanceId),
      energyCard('Fire', attacker.instanceId),
      energyCard('Water', attacker.instanceId)
    );
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  });
  const res = runAttack(state);
  const hand = res.state.players.p1.zones.hand;
  assert.equal(hand.filter((c) => c.name === 'Basic Fire Energy').length, 2);
  assert.equal(hand.filter((c) => c.name === 'Basic Water Energy').length, 0);
  assert.equal(
    res.state.players.p1.zones.active.filter((c) => c.attachedTo != null).length,
    1,
    'the Water Energy stays attached'
  );
});

test('I188 board: Trickster-GX copies a chosen opponent attack', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(mon('Zoroark-GX', { hp: 200, attacks: [atk('Trickster-GX', 0, TRICKSTER)] }));
    p2.zones.active.push(
      mon('Defender', {
        hp: 300,
        attacks: [
          { name: 'Heavy Slam', cost: [], damage: '60', text: 'This attack does 60 damage.' },
          { name: 'Nibble', cost: [], damage: '20', text: '' },
        ],
      })
    );
  });
  const res = runAttack(state, {
    selectionFor: (pc) =>
      pc.options.filter((o) => /Heavy Slam/.test(o.name || '')).map((o) => o.instanceId),
  });
  assert.ok(res.events.some((e) => e.type === 'attackCopied' && e.copiedName === 'Heavy Slam'));
  assert.equal(activeRoot(res.state, 'p2').damage, 60);
});

// ── I189: ability gaps ──────────────────────────────────────────────────────

test('I189 board: Disk Reload draws until the hand has 5 cards', () => {
  const state = game((s, p1, p2) => {
    p1.zones.active.push(
      mon('Silvally-GX', {
        hp: 200,
        abilities: [
          { name: 'Disk Reload', text: 'Once during your turn (before your attack), you may draw cards until you have 5 cards in your hand.' },
        ],
      })
    );
    p1.zones.hand.push(supporter('a'), supporter('b'));
    p2.zones.active.push(mon('Defender', { hp: 300 }));
  }, { rulesEnabled: true });
  const holder = activeRoot(state, 'p1');
  const res = applyCommand(
    state,
    { type: 'useAbility', playerId: 'p1', payload: { instanceId: holder.instanceId, abilityIndex: 0 } },
    createRng(9)
  );
  assert.equal(res.error, null, res.reason);
  assert.equal(res.state.players.p1.zones.hand.length, 5);
});
