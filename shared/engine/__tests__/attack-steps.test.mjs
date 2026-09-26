// Step-driven attack effects (design 030; I102–I111): printed attack clauses beyond the
// fixed attack-phase helpers run through the resumable step executor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { classifyAttackEffect } from '../rules/attack-effects.mjs';
import { addCondition, listConditions } from '../rules/special-conditions.mjs';
import { ATTACK_YES, ATTACK_NO } from '../effects/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    ...extra,
  });
const trainer = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Attacker', damage = '0', setup = () => {}, seed = 5 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-steps', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Test Attack', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

function choose(res, selection, rng, playerId = res.state.pendingChoice.player) {
  const next = applyCommand(
    res.state,
    { type: 'resolveChoice', playerId, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    rng
  );
  assert.equal(next.error, null);
  return next;
}

const ids = (cards) => cards.map((c) => c.instanceId);
const zone = (res, pid, name) => res.state.players[pid].zones[name];
const attachedTo = (res, pid, rootId) =>
  [...zone(res, pid, 'active'), ...zone(res, pid, 'bench')].filter((c) => c.attachedTo === rootId).map((c) => c.instanceId);
const activeRoot = (res, pid) => zone(res, pid, 'active').find((c) => !c.attachedTo);
const turnPassed = (res) => assert.equal(res.state.turn.player, 'p2', 'the attack ends the turn');

// ── parser ──────────────────────────────────────────────────────────────────

test('parseAttackSteps: reads the attacker name as "this Pokémon" and keeps printed order', () => {
  const parsed = parseAttackSteps(
    'Search your deck for an Energy card and attach it to Mew ex. Then, you may switch Mew ex with 1 of your Benched Pokémon.',
    { selfName: 'Mew ex' }
  );
  assert.deepEqual(parsed.after.map((s) => s.type), ['searchAbility', 'atkSwitchSelf']);
  assert.equal(parsed.after[0].attachTarget, 'this pokémon');
  assert.equal(parsed.after[1].optional, true);
  assert.equal(parsed.handlesSearch, true);
});

test('parseAttackSteps: coin, before-damage and optional gates', () => {
  assert.deepEqual(
    parseAttackSteps("Flip a coin. If heads, discard an Energy from your opponent's Active Pokémon.").after,
    [{ type: 'atkDiscardOppEnergy', scope: 'active', count: 1, gate: 'heads' }]
  );
  assert.deepEqual(
    parseAttackSteps("Flip 3 coins. For each heads, discard the top card of your opponent's deck.").after,
    [{ type: 'atkMill', side: 'opponent', count: 1, perHeads: true }]
  );
  const before = parseAttackSteps("Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon.");
  assert.deepEqual(before.before, [{ type: 'atkDiscardOppTools', scope: 'active', all: true }]);
  assert.deepEqual(before.after, []);
});

test('parseAttackSteps: leaves clauses the attack-phase helpers own, and conditions it cannot read', () => {
  const none = (text) => assert.deepEqual(parseAttackSteps(text), { before: [], after: [], handlesSearch: false }, text);
  none('Attach up to 3 Basic {F} Energy cards from your discard pile to your Benched Pokémon in any way you like.');
  none('Discard the top 3 cards of your deck. This attack does 50 damage for each Energy card you discarded in this way.');
  none('If you do, switch it with 1 of your Benched Pokémon.');
  none('Discard 2 Energy from this Pokémon.');
  // A printed draw is a step (it keeps its coin gate); the attack-phase drawCount stands down.
  assert.deepEqual(parseAttackSteps('Draw 2 cards.').after, [{ type: 'atkDraw', count: 2 }]);
});

test('attack: a plain printed draw draws once', () => {
  const res = attack(board('Draw 2 cards.'));
  assert.equal(zone(res, 'p1', 'hand').length, 2);
  turnPassed(res);
});

// ── I102 switch / gust ─────────────────────────────────────────────────────

test('attack: "Switch this Pokémon with 1 of your Benched Pokémon" swaps in the chosen Pokémon (I102)', () => {
  const b = board('Switch this Pokémon with 1 of your Benched Pokémon.', {
    name: 'Mega Zeraora ex',
    damage: '150',
    setup: ({ p1 }) => p1.zones.bench.push(mon('Bench A'), mon('Bench B')),
  });
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.player, 'p1');
  const benchB = zone(res1, 'p1', 'bench').find((c) => c.name === 'Bench B');
  const res2 = choose(res1, [benchB.instanceId], b.rng);
  assert.equal(activeRoot(res2, 'p1').name, 'Bench B');
  assert.ok(zone(res2, 'p1', 'bench').some((c) => c.instanceId === b.attacker.instanceId));
  assert.equal(activeRoot(res2, 'p2').damage, 150, 'damage happened before the switch');
  turnPassed(res2);
});

test('attack: "You may switch" asks first; declining keeps the attacker Active (I102)', () => {
  const b = board('You may switch this Pokémon with 1 of your Benched Pokémon.', {
    setup: ({ p1 }) => p1.zones.bench.push(mon('Bench A')),
  });
  const res1 = attack(b);
  assert.deepEqual(ids(res1.state.pendingChoice.options), [ATTACK_YES, ATTACK_NO]);
  const res2 = choose(res1, [ATTACK_NO], b.rng);
  assert.equal(activeRoot(res2, 'p1').instanceId, b.attacker.instanceId);
  turnPassed(res2);
});

test('attack: "switch out your opponent\'s Active Pokémon" lets the opponent choose (I102)', () => {
  const b = board(
    "You may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)",
    { name: 'Kyogre ex', setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A'), mon('Opp B')) }
  );
  const res1 = attack(b);
  const res2 = choose(res1, [ATTACK_YES], b.rng);
  assert.equal(res2.state.pendingChoice.player, 'p2', 'the opponent picks the new Active');
  const oppB = zone(res2, 'p2', 'bench').find((c) => c.name === 'Opp B');
  const res3 = choose(res2, [oppB.instanceId], b.rng, 'p2');
  assert.equal(activeRoot(res3, 'p2').name, 'Opp B');
  turnPassed(res3);
});

test('attack: a before-damage gust moves the damage to the new Active Pokémon (I102)', () => {
  const b = board(
    "Before doing damage, you may switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
    { damage: '60', setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A'), mon('Opp B')) }
  );
  const res1 = attack(b);
  const res2 = choose(res1, [ATTACK_YES], b.rng);
  const oppA = zone(res2, 'p2', 'bench').find((c) => c.name === 'Opp A');
  const res3 = choose(res2, [oppA.instanceId], b.rng);
  assert.equal(activeRoot(res3, 'p2').name, 'Opp A');
  assert.equal(activeRoot(res3, 'p2').damage, 60);
  assert.equal(zone(res3, 'p2', 'bench').find((c) => c.name === 'Defender').damage || 0, 0);
  turnPassed(res3);
});

// ── I103 move Energy ───────────────────────────────────────────────────────

test('attack: "Move an Energy from this Pokémon to 1 of your Benched Pokémon" (I103)', () => {
  let fire;
  const b = board('Move an Energy from this Pokémon to 1 of your Benched Pokémon.', {
    name: 'Mega Gengar ex',
    setup: ({ p1, attacker }) => {
      fire = energy('Fire', { attachedTo: attacker.instanceId });
      p1.zones.active.push(fire);
      p1.zones.bench.push(mon('Bench A'), mon('Bench B'));
    },
  });
  const res1 = attack(b);
  const benchA = zone(res1, 'p1', 'bench').find((c) => c.name === 'Bench A');
  const res2 = choose(res1, [benchA.instanceId], b.rng);
  assert.deepEqual(attachedTo(res2, 'p1', benchA.instanceId), [fire.instanceId]);
  assert.deepEqual(attachedTo(res2, 'p1', b.attacker.instanceId), []);
  turnPassed(res2);
});

test("attack: move an Energy from the opponent's Active to their Bench (Gengar ex Tricky Steps, I103)", () => {
  let water;
  const b = board("You may move an Energy from your opponent's Active Pokémon to 1 of their Benched Pokémon.", {
    setup: ({ p2, defender }) => {
      water = energy('Water', { attachedTo: defender.instanceId });
      p2.zones.active.push(water);
      p2.zones.bench.push(mon('Opp A'));
    },
  });
  const res2 = choose(attack(b), [ATTACK_YES], b.rng);
  const oppA = zone(res2, 'p2', 'bench').find((c) => c.name === 'Opp A');
  assert.deepEqual(attachedTo(res2, 'p2', oppA.instanceId), [water.instanceId]);
  turnPassed(res2);
});

// ── I104 discard from the opponent ─────────────────────────────────────────

test("attack: \"Discard an Energy from your opponent's Active Pokémon\" asks which (I104)", () => {
  let fire;
  let water;
  const b = board("Discard an Energy from your opponent's Active Pokémon.", {
    name: 'Decidueye ex',
    damage: '240',
    setup: ({ p2, defender }) => {
      fire = energy('Fire', { attachedTo: defender.instanceId });
      water = energy('Water', { attachedTo: defender.instanceId });
      p2.zones.active.push(fire, water);
    },
  });
  const res1 = attack(b);
  assert.deepEqual(ids(res1.state.pendingChoice.options).sort(), [fire.instanceId, water.instanceId].sort());
  const res2 = choose(res1, [water.instanceId], b.rng);
  assert.deepEqual(attachedTo(res2, 'p2', b.defender.instanceId), [fire.instanceId]);
  assert.ok(zone(res2, 'p2', 'discard').some((c) => c.instanceId === water.instanceId));
  turnPassed(res2);
});

test("attack: discarding from a Knocked Out opponent's Active does nothing (I104)", () => {
  const b = board("Discard an Energy from your opponent's Active Pokémon.", {
    damage: '500',
    setup: ({ p2, defender }) => {
      p2.zones.active.push(energy('Fire', { attachedTo: defender.instanceId }));
      p2.zones.bench.push(mon('Opp A'));
    },
  });
  const res = attack(b);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.instanceId === b.defender.instanceId), 'defender KO');
  assert.equal(res.state.players.p1.flags.attackerAttacked, true);
});

test("attack: discard all Pokémon Tools before damage; random hand discard (I104)", () => {
  let tool;
  const b = board("Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon.", {
    name: 'Klefki',
    setup: ({ p2, defender }) => {
      tool = createCard({ instanceId: nextId++, name: 'Tool', supertype: 'Trainer', subtypes: ['Pokémon Tool'], type: 'Pokémon Tool', attachedTo: defender.instanceId });
      p2.zones.active.push(tool);
    },
  });
  const res = attack(b);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.instanceId === tool.instanceId));

  const h = board("Discard a random card from your opponent's hand.", {
    setup: ({ p2 }) => p2.zones.hand.push(trainer('H1'), trainer('H2'), trainer('H3')),
  });
  const handBefore = h.p2.zones.hand.length;
  const resHand = attack(h);
  // The opponent draws for their turn after the discard.
  assert.equal(zone(resHand, 'p2', 'discard').filter((c) => /^H\d$/.test(c.name)).length, 1);
  assert.equal(zone(resHand, 'p2', 'hand').filter((c) => /^H\d$/.test(c.name)).length, handBefore - 1);
});

test("attack: \"Your opponent discards 2 cards from their hand\" lets the opponent choose (I104)", () => {
  const b = board('Your opponent discards 2 cards from their hand.', {
    setup: ({ p2 }) => p2.zones.hand.push(trainer('H1'), trainer('H2'), trainer('H3')),
  });
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.player, 'p2');
  const [h1, h2] = zone(res1, 'p2', 'hand');
  const res2 = choose(res1, [h1.instanceId, h2.instanceId], b.rng, 'p2');
  assert.deepEqual(zone(res2, 'p2', 'discard').map((c) => c.name).sort(), ['H1', 'H2']);
  turnPassed(res2);
});

// ── I105 attach from discard / hand ────────────────────────────────────────

test('attack: "Attach up to 2 Basic {F} Energy cards from your discard pile to this Pokémon" (I105)', () => {
  let f1;
  let f2;
  const b = board('Attach up to 2 Basic {F} Energy cards from your discard pile to this Pokémon.', {
    name: 'Regirock ex',
    setup: ({ p1 }) => {
      f1 = energy('Fighting');
      f2 = energy('Fighting');
      p1.zones.discard.push(f1, f2, energy('Fire'));
    },
  });
  const res1 = attack(b);
  assert.deepEqual(ids(res1.state.pendingChoice.options).sort(), [f1.instanceId, f2.instanceId].sort());
  const res2 = choose(res1, [f1.instanceId, f2.instanceId], b.rng);
  assert.deepEqual(attachedTo(res2, 'p1', b.attacker.instanceId).sort(), [f1.instanceId, f2.instanceId].sort());
  turnPassed(res2);
});

test('attack: attach from hand to your Pokémon in any way you like asks a target per card (I105)', () => {
  let l1;
  let l2;
  const b = board('You may attach any number of Basic Energy cards from your hand to your Pokémon in any way you like.', {
    name: 'Pikachu ex',
    setup: ({ p1 }) => {
      l1 = energy('Lightning');
      l2 = energy('Lightning');
      p1.zones.hand.push(l1, l2);
      p1.zones.bench.push(mon('Bench A'));
    },
  });
  const res1 = choose(attack(b), [ATTACK_YES], b.rng);
  const res2 = choose(res1, [l1.instanceId, l2.instanceId], b.rng);
  const benchA = zone(res2, 'p1', 'bench').find((c) => c.name === 'Bench A');
  const res3 = choose(res2, [b.attacker.instanceId], b.rng);
  const res4 = choose(res3, [benchA.instanceId], b.rng);
  assert.equal(attachedTo(res4, 'p1', b.attacker.instanceId).length, 1);
  assert.equal(attachedTo(res4, 'p1', benchA.instanceId).length, 1);
  turnPassed(res4);
});

// ── I106 draw until ────────────────────────────────────────────────────────

test('attack: "Draw cards until you have 7 cards in your hand" (I106)', () => {
  const b = board('Draw cards until you have 7 cards in your hand.', {
    name: 'Jirachi ex',
    setup: ({ p1 }) => p1.zones.hand.push(trainer('H1'), trainer('H2')),
  });
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'hand').length, 7);
});

// ── I107 deck / discard → Bench ────────────────────────────────────────────

test('attack: Trick Portal puts Basic Pokémon from the top of the deck onto the Bench (I107)', () => {
  let basicA;
  let stage1;
  const b = board(
    'Look at the top 9 cards of your deck, and you may put any number of Pokémon you find there onto your Bench. Shuffle the other cards back into your deck.',
    {
      name: 'Mega Delphox ex',
      setup: ({ p1 }) => {
        basicA = mon('Deck Basic');
        stage1 = mon('Deck Stage 1', { stage: 'Stage 1' });
        p1.zones.deck.unshift(basicA, stage1);
      },
    }
  );
  const res1 = attack(b);
  assert.deepEqual(ids(res1.state.pendingChoice.options), [basicA.instanceId], 'only Basic Pokémon can be benched');
  const res2 = choose(res1, [basicA.instanceId], b.rng);
  assert.ok(zone(res2, 'p1', 'bench').some((c) => c.instanceId === basicA.instanceId));
  turnPassed(res2);
});

test('attack: "Put up to 3 {N} Pokémon from your discard pile onto your Bench" (I107)', () => {
  let dragon;
  const b = board('Put up to 3 {N} Pokémon from your discard pile onto your Bench.', {
    name: 'Salamence ex',
    setup: ({ p1 }) => {
      dragon = mon('Dratini', { types: ['Dragon'] });
      p1.zones.discard.push(dragon, mon('Charmander', { types: ['Fire'] }));
    },
  });
  const res1 = attack(b);
  assert.deepEqual(ids(res1.state.pendingChoice.options), [dragon.instanceId]);
  const res2 = choose(res1, [dragon.instanceId], b.rng);
  assert.ok(zone(res2, 'p1', 'bench').some((c) => c.instanceId === dragon.instanceId));
});

// ── I108 search and attach ─────────────────────────────────────────────────

test('attack: Mew ex Power Move attaches the searched Energy to Mew ex, then may switch (I108)', () => {
  let psychic;
  const b = board(
    'Search your deck for an Energy card and attach it to Mew ex. Then, shuffle your deck. Then, you may switch Mew ex with 1 of your Benched Pokémon.',
    {
      name: 'Mew ex',
      setup: ({ p1 }) => {
        psychic = energy('Psychic');
        p1.zones.deck.push(psychic);
        p1.zones.bench.push(mon('Bench A'));
      },
    }
  );
  const res1 = attack(b);
  const res2 = choose(res1, [psychic.instanceId], b.rng);
  assert.deepEqual(attachedTo(res2, 'p1', b.attacker.instanceId), [psychic.instanceId]);
  assert.ok(!zone(res2, 'p1', 'hand').some((c) => c.instanceId === psychic.instanceId));
  const res3 = choose(res2, [ATTACK_YES], b.rng);
  assert.equal(activeRoot(res3, 'p1').name, 'Bench A');
  turnPassed(res3);
});

// ── I109 plain mill ────────────────────────────────────────────────────────

test('attack: plain mill discards the top cards of the named deck (I109)', () => {
  const opp = attack(board("Discard the top 2 cards of your opponent's deck.", { name: 'Mega Heracross ex' }));
  assert.equal(zone(opp, 'p2', 'discard').length, 2);
  const own = attack(board('Discard the top 2 cards of your deck.', { name: 'Salamence ex' }));
  assert.equal(zone(own, 'p1', 'discard').length, 2);
  assert.equal(zone(own, 'p2', 'discard').length, 0);
});

// ── I110 shuffle self ──────────────────────────────────────────────────────

test('attack: "Shuffle this Pokémon and all attached cards into your deck" (I110)', () => {
  let water;
  const b = board('Shuffle this Pokémon and all attached cards into your deck.', {
    name: 'Primarina',
    damage: '120',
    setup: ({ p1, attacker }) => {
      water = energy('Water', { attachedTo: attacker.instanceId });
      p1.zones.active.push(water);
      p1.zones.bench.push(mon('Bench A'));
    },
  });
  const res = attack(b);
  const deckIds = ids(zone(res, 'p1', 'deck'));
  assert.ok(deckIds.includes(b.attacker.instanceId) && deckIds.includes(water.instanceId));
  assert.equal(activeRoot(res, 'p2').damage, 120);
  assert.equal(activeRoot(res, 'p1').name, 'Bench A', 'the only Benched Pokémon is promoted');
});

test('attack: shuffling the last Pokémon in play away loses the game (I110)', () => {
  const res = attack(board('Shuffle this Pokémon and all attached cards into your deck.'));
  assert.equal(res.state.turn.phase, 'ended');
  assert.equal(res.state.winner, 'p2');
});

// ── I111 misc ──────────────────────────────────────────────────────────────

test('attack: "Put a Trainer card from your discard pile into your hand" (I111)', () => {
  let item;
  const b = board('Put a Trainer card from your discard pile into your hand.', {
    name: 'Sableye V',
    setup: ({ p1 }) => {
      item = trainer('Old Item');
      p1.zones.discard.push(item, energy('Fire'));
    },
  });
  const res = attack(b);
  assert.ok(zone(res, 'p1', 'hand').some((c) => c.instanceId === item.instanceId));
});

test("attack: counters on each opponent's Pokémon knock out and grant Prizes (I111)", () => {
  const b = board("Put 2 damage counters on each of your opponent's Pokémon.", {
    name: 'Mismagius',
    setup: ({ p2 }) => p2.zones.bench.push(mon('Frail', { hp: 20 }), mon('Sturdy')),
  });
  const res = attack(b);
  assert.equal(activeRoot(res, 'p2').damage, 20);
  assert.equal(zone(res, 'p2', 'bench').find((c) => c.name === 'Sturdy').damage, 20);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.name === 'Frail'));
  assert.equal(res.state.pendingChoice?.source, 'Prize cards', 'p1 takes a Prize for the Knock Out');
  assert.equal(res.state.pendingChoice.player, 'p1');
});

test('attack: Dedenne ex Tail Swap moves all counters from a Benched Pokémon (I111)', () => {
  let hurt;
  const b = board("Move all damage counters from 1 of your Benched Pokémon to your opponent's Active Pokémon.", {
    setup: ({ p1 }) => {
      hurt = mon('Hurt');
      hurt.damage = 90;
      p1.zones.bench.push(hurt);
    },
  });
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'bench').find((c) => c.instanceId === hurt.instanceId).damage, 0);
  assert.equal(activeRoot(res, 'p2').damage, 90);
});

test('attack: Espeon ex Amazez devolves every evolved opponent Pokémon into their deck (I111)', () => {
  let evolved;
  const b = board(
    "Devolve each of your opponent's evolved Pokémon by shuffling the highest Stage Evolution card on it into your opponent's deck.",
    {
      setup: ({ p2, defender }) => {
        evolved = mon('Defender Stage 1', { stage: 'Stage 1', hp: 400, attachedTo: defender.instanceId });
        p2.zones.active.push(evolved);
      },
    }
  );
  const res = attack(b);
  assert.ok(zone(res, 'p2', 'deck').some((c) => c.instanceId === evolved.instanceId));
  assert.deepEqual(attachedTo(res, 'p2', b.defender.instanceId), []);
});

test('attack: Umbreon ex Onyx takes a Prize card; Giratina VSTAR Star Requiem knocks out (I111)', () => {
  const onyx = attack(board('Discard all Energy from this Pokémon, and take a Prize card.', { name: 'Umbreon ex' }));
  assert.equal(onyx.state.pendingChoice?.source, 'Prize cards');
  assert.equal(onyx.state.pendingChoice.max, 1);

  const b = board("Your opponent's Active Pokémon is Knocked Out.", {
    setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A')),
  });
  const res = attack(b);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.instanceId === b.defender.instanceId));
  assert.equal(res.state.pendingChoice?.source, 'Prize cards');
});

test('attack: a conditional Knock Out needs its condition (I111)', () => {
  const text = "If your opponent's Active Pokémon is affected by a Special Condition, it is Knocked Out.";
  const healthy = attack(board(text, { setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A')) }));
  assert.ok(activeRoot(healthy, 'p2'), 'no Special Condition: no Knock Out');
});

test('attack: "Heal 30 damage from each of your Pokémon" heals each once (I111)', () => {
  const b = board('Heal 30 damage from each of your Pokémon.', {
    setup: ({ p1, attacker }) => {
      attacker.damage = 50;
      const hurt = mon('Hurt');
      hurt.damage = 20;
      p1.zones.bench.push(hurt);
    },
  });
  const res = attack(b);
  assert.equal(activeRoot(res, 'p1').damage, 20);
  assert.equal(zone(res, 'p1', 'bench')[0].damage, 0);
});

test('attack: Raging Bolt ex Burst Roar discards the hand, then draws 6 (I111)', () => {
  const b = board('Discard your hand and draw 6 cards.', {
    name: 'Raging Bolt ex',
    setup: ({ p1 }) => p1.zones.hand.push(trainer('Old 1'), trainer('Old 2')),
  });
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'hand').length, 6);
  assert.deepEqual(zone(res, 'p1', 'discard').map((c) => c.name).sort(), ['Old 1', 'Old 2']);
});

// ── continuation ───────────────────────────────────────────────────────────

test('attack: a step choice resumes into the deck search, then ends the turn', () => {
  const b = board(
    'Switch this Pokémon with 1 of your Benched Pokémon. Search your deck for a Trainer card, reveal it, and put it into your hand. Then, shuffle your deck.',
    { setup: ({ p1 }) => p1.zones.bench.push(mon('Bench A'), mon('Bench B')) }
  );
  const res1 = attack(b);
  const benchA = zone(res1, 'p1', 'bench').find((c) => c.name === 'Bench A');
  const res2 = choose(res1, [benchA.instanceId], b.rng);
  assert.ok(res2.state.pendingChoice, 'the deck search follows');
  assert.equal(res2.state.turn.player, 'p1');
  const pick = res2.state.pendingChoice.options[0].instanceId;
  const res3 = choose(res2, [pick], b.rng);
  assert.ok(zone(res3, 'p1', 'hand').some((c) => c.instanceId === pick));
  turnPassed(res3);
});

test('attack: a coin-gated clause follows the attack\'s own flip', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let fire;
    const b = board("Flip a coin. If heads, discard an Energy from your opponent's Active Pokémon.", {
      seed,
      setup: ({ p2, defender }) => {
        fire = energy('Fire', { attachedTo: defender.instanceId });
        p2.zones.active.push(fire);
      },
    });
    const res = attack(b);
    const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
    const discarded = zone(res, 'p2', 'discard').some((c) => c.instanceId === fire.instanceId);
    assert.equal(discarded, flip.coin === 'heads', `seed ${seed}: ${flip.coin}`);
  }
});

// ── attach chains ("If you do, …") ─────────────────────────────────────────

test('attack: Lapras V Body Surf attaches from hand, then switches only if it attached', () => {
  let water;
  const withWater = board('Attach a {W} Energy card from your hand to this Pokémon. If you do, switch it with 1 of your Benched Pokémon.', {
    name: 'Lapras V',
    setup: ({ p1 }) => {
      water = energy('Water');
      p1.zones.hand.push(water);
      p1.zones.bench.push(mon('Bench A'));
    },
  });
  const res = attack(withWater);
  assert.deepEqual(attachedTo(res, 'p1', withWater.attacker.instanceId), [water.instanceId]);
  assert.equal(activeRoot(res, 'p1').name, 'Bench A');

  const noWater = board('Attach a {W} Energy card from your hand to this Pokémon. If you do, switch it with 1 of your Benched Pokémon.', {
    name: 'Lapras V',
    setup: ({ p1 }) => p1.zones.bench.push(mon('Bench A')),
  });
  const resNone = attack(noWater);
  assert.equal(activeRoot(resNone, 'p1').instanceId, noWater.attacker.instanceId, 'nothing attached: no switch');
});

test('attack: Stonjourner VMAX Stone Gift heals the Pokémon the Energy went to', () => {
  let fighting;
  let hurt;
  const b = board('Attach a {F} Energy card from your hand to 1 of your Pokémon. If you do, heal 120 damage from that Pokémon.', {
    name: 'Stonjourner VMAX',
    setup: ({ p1 }) => {
      fighting = energy('Fighting');
      hurt = mon('Hurt');
      hurt.damage = 150;
      p1.zones.hand.push(fighting);
      p1.zones.bench.push(hurt);
    },
  });
  const res1 = attack(b);
  const res2 = choose(res1, [hurt.instanceId], b.rng);
  assert.deepEqual(attachedTo(res2, 'p1', hurt.instanceId), [fighting.instanceId]);
  assert.equal(zone(res2, 'p1', 'bench').find((c) => c.instanceId === hurt.instanceId).damage, 30);
});

test('classifyAttackEffect: an attach chain is named by the attach (I115)', () => {
  const cases = [
    ['Attach a {W} Energy card from your hand to this Pokémon. If you do, switch it with 1 of your Benched Pokémon.', 'draw-attach'],
    ['Attach a {F} Energy card from your hand to 1 of your Pokémon. If you do, heal 120 damage from that Pokémon.', 'draw-attach'],
    ['Search your deck for an Energy card and attach it to Mew ex. Then, shuffle your deck. Then, you may switch Mew ex with 1 of your Benched Pokémon.', 'search-deck'],
    ["Discard a Team Rocket's Energy from this Pokémon. If you do, discard your opponent's Active Pokémon and all attached cards.", 'discard-opponent'],
  ];
  for (const [text, family] of cases) assert.equal(classifyAttackEffect({ text, damage: 0 }), family, text);
});

// ── Lost Zone, old wordings ────────────────────────────────────────────────

const tool = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], type: 'Pokémon Tool' });

test('attack: Rotom V Scrap Short counts the Tools it put in the Lost Zone (I111)', () => {
  let t1;
  let t2;
  const b = board(
    'Put any number of Pokémon Tool cards from your discard pile in the Lost Zone. This attack does 40 more damage for each card you put in the Lost Zone in this way.',
    {
      name: 'Rotom V',
      damage: '40+',
      setup: ({ p1 }) => {
        t1 = tool('Tool 1');
        t2 = tool('Tool 2');
        p1.zones.discard.push(t1, t2, tool('Tool 3'));
      },
    }
  );
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.min, 0);
  assert.equal(activeRoot(res1, 'p2').damage || 0, 0, 'no damage before the cost is chosen');
  const res2 = choose(res1, [t1.instanceId, t2.instanceId], b.rng);
  assert.deepEqual(ids(zone(res2, 'p1', 'lostZone')).sort(), [t1.instanceId, t2.instanceId].sort());
  assert.equal(activeRoot(res2, 'p2').damage, 120);
  turnPassed(res2);
});

test('attack: Lost Zone from the deck top and from the opponent\'s Active (I111)', () => {
  const dive = attack(board('Put the top 3 cards of your deck in the Lost Zone.', { name: 'Aerodactyl VSTAR' }));
  assert.equal(zone(dive, 'p1', 'lostZone').length, 3);

  let fire;
  const flame = attack(
    board("Put 2 Energy attached to your opponent's Active Pokémon in the Lost Zone.", {
      name: 'Typhlosion',
      setup: ({ p2, defender }) => {
        fire = energy('Fire', { attachedTo: defender.instanceId });
        p2.zones.active.push(fire);
      },
    })
  );
  assert.deepEqual(ids(zone(flame, 'p2', 'lostZone')), [fire.instanceId]);
});

test('attack: old wordings — discard-pile attach, "you may search", Defending Pokémon gust', () => {
  let lightning;
  const steelix = attack(
    board('Search your discard pile for an Energy card and attach it to Steelix.', {
      name: 'Steelix',
      setup: ({ p1 }) => {
        lightning = energy('Lightning');
        p1.zones.discard.push(lightning);
      },
    })
  );
  assert.ok(steelix.state.players.p1.zones.active.some((c) => c.instanceId === lightning.instanceId));

  let g1;
  const b = board('You may search your deck for 2 {G} Energy cards and attach them to 1 of your Benched Pokémon. Shuffle your deck afterward.', {
    name: 'Virizion-EX',
    setup: ({ p1 }) => {
      g1 = energy('Grass');
      p1.zones.deck.push(g1);
      p1.zones.bench.push(mon('Bench A'));
    },
  });
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.min, 0, '"You may": choosing nothing declines');
  const res2 = choose(res1, [g1.instanceId], b.rng);
  const benchA = zone(res2, 'p1', 'bench').find((c) => c.name === 'Bench A');
  assert.deepEqual(attachedTo(res2, 'p1', benchA.instanceId), [g1.instanceId]);

  const gust = board('Your opponent switches the Defending Pokémon with 1 of his or her Benched Pokémon.', {
    name: 'Shiftry',
    setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A')),
  });
  assert.equal(activeRoot(attack(gust), 'p2').name, 'Opp A');
});

// ── families the S265 audit found unexecuted (I112) ────────────────────────

test('attack: cure self, mirror heal, Energy back to the opponent\'s hand', () => {
  const cured = attack(
    board('This Pokémon recovers from all Special Conditions.', {
      name: 'Arboliva ex',
      setup: ({ attacker }) => addCondition(attacker, 'Poisoned'),
    })
  );
  assert.deepEqual(listConditions(activeRoot(cured, 'p1')), []);

  const swallow = attack(
    board("Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon.", {
      name: 'Snorlax V',
      damage: '60',
      setup: ({ attacker }) => {
        attacker.damage = 100;
      },
    })
  );
  assert.equal(activeRoot(swallow, 'p1').damage, 40);

  let e1;
  const b = board("You may put 2 Energy attached to your opponent's Active Pokémon into their hand.", {
    name: 'Samurott',
    setup: ({ p2, defender }) => {
      e1 = energy('Water', { attachedTo: defender.instanceId });
      p2.zones.active.push(e1);
    },
  });
  const res = choose(attack(b), [ATTACK_YES], b.rng);
  assert.ok(zone(res, 'p2', 'hand').some((c) => c.instanceId === e1.instanceId));
});

test('attack: Knock Out 1 of your opponent\'s Pokémon with exactly 6 counters; look at the top and keep', () => {
  const b = board("Knock Out 1 of your opponent's Pokémon that has exactly 6 damage counters on it.", {
    name: 'Glaceon ex',
    setup: ({ p2 }) => {
      const six = mon('Six');
      six.damage = 60;
      p2.zones.bench.push(six, mon('Fresh'));
    },
  });
  const res = attack(b);
  assert.ok(zone(res, 'p2', 'discard').some((c) => c.name === 'Six'));
  assert.ok(zone(res, 'p2', 'bench').some((c) => c.name === 'Fresh'));

  const g = board('Look at the top 4 cards of your deck and put 2 of them into your hand. Put the other cards in the Lost Zone.', {
    name: 'Giratina V',
  });
  const top = ids(g.p1.zones.deck.slice(0, 4));
  const res1 = attack(g);
  const res2 = choose(res1, top.slice(0, 2), g.rng);
  assert.deepEqual(ids(zone(res2, 'p1', 'lostZone')).sort(), top.slice(2).sort());
  assert.ok(top.slice(0, 2).every((id) => zone(res2, 'p1', 'hand').some((c) => c.instanceId === id)));
});

test("attack: Sylveon ex Angelite shuffles 2 of the opponent's Benched Pokémon into their deck", () => {
  const b = board(
    "Choose 2 of your opponent's Benched Pokémon. Shuffle those Pokémon and all attached cards into your opponent's deck.",
    { name: 'Sylveon ex', setup: ({ p2 }) => p2.zones.bench.push(mon('Opp A'), mon('Opp B'), mon('Opp C')) }
  );
  const res1 = attack(b);
  const [a, c] = zone(res1, 'p2', 'bench').filter((x) => x.name !== 'Opp B');
  const res2 = choose(res1, [a.instanceId, c.instanceId], b.rng);
  assert.deepEqual(zone(res2, 'p2', 'bench').map((x) => x.name), ['Opp B']);
  // Into the deck (the opponent's turn-start draw may already have drawn it).
  assert.ok([...zone(res2, 'p2', 'deck'), ...zone(res2, 'p2', 'hand')].some((x) => x.instanceId === a.instanceId));
});

// Design 047: GX zero-base steps — kindless recovery, both-Active Energy discard, all-opponent
// Energy shuffle.
test('parseAttackSteps: kindless "Put N cards from your discard pile into your hand" recovers any card', () => {
  const parsed = parseAttackSteps('Put 3 cards from your discard pile into your hand.');
  assert.deepEqual(parsed.after, [{ type: 'atkRecover', count: 3, what: null }]);
  const upTo = parseAttackSteps('Put up to 2 cards from your discard pile into your hand.');
  assert.deepEqual(upTo.after, [{ type: 'atkRecover', count: 2, upTo: true, what: null }]);
  const kinded = parseAttackSteps('Put up to 2 Trainer cards from your discard pile into your hand.');
  assert.deepEqual(kinded.after, [{ type: 'atkRecover', count: 2, upTo: true, what: 'Trainer' }]);
});

test('attack: Eevee-GX Joy Maker-GX recovers 3 cards from the discard pile', () => {
  const b = board('Put 3 cards from your discard pile into your hand.', {
    name: 'Eevee-GX',
    setup: ({ p1 }) => p1.zones.discard.push(mon('A'), mon('B'), mon('C')),
  });
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'hand').length, 3);
  assert.equal(zone(res, 'p1', 'discard').length, 0);
});

test('attack: Articuno-GX Cold Crush-GX discards all Energy from both Active Pokémon', () => {
  const b = board('Discard all Energy from both Active Pokémon.', {
    name: 'Articuno-GX',
    setup: ({ p1, p2, attacker, defender }) => {
      p1.zones.active.push(energy('Water', { attachedTo: attacker.instanceId }));
      p2.zones.active.push(energy('Fire', { attachedTo: defender.instanceId }));
    },
  });
  const res = attack(b);
  assert.equal(attachedTo(res, 'p1', activeRoot(res, 'p1').instanceId).length, 0);
  assert.equal(attachedTo(res, 'p2', activeRoot(res, 'p2').instanceId).length, 0);
  assert.equal(zone(res, 'p1', 'discard').filter((c) => c.supertype === 'Energy').length, 1);
  assert.equal(zone(res, 'p2', 'discard').filter((c) => c.supertype === 'Energy').length, 1);
});

test('attack: Palkia-GX Zero Vanish-GX shuffles all opposing Energy into the deck', () => {
  const b = board("Shuffle all Energy from each of your opponent's Pokémon into their deck.", {
    name: 'Palkia-GX',
    setup: ({ p2, defender }) => {
      p2.zones.active.push(energy('Water', { attachedTo: defender.instanceId }));
      const bench = mon('Opp Bench');
      p2.zones.bench.push(bench, energy('Lightning', { attachedTo: bench.instanceId }));
    },
  });
  const deckBefore = zone(b, 'p2', 'deck').length;
  const res = attack(b);
  assert.equal(attachedTo(res, 'p2', activeRoot(res, 'p2').instanceId).length, 0);
  // Both Energies are in the deck or the turn-start draw (the attack ends the turn).
  assert.equal(zone(res, 'p2', 'deck').length + zone(res, 'p2', 'hand').length, deckBefore + 2);
});

test('attack: Cold Crush-GX and Zero Vanish-GX respect effect-shield special Energy', () => {
  const shield = (attachedTo) =>
    energy('Colorless', {
      name: 'Mist Energy',
      subtypes: ['Special'],
      text: "Provides {C} Energy. Prevent all effects of attacks used by your opponent's Pokémon done to the Pokémon this card is attached to.",
      attachedTo,
    });
  const cold = board('Discard all Energy from both Active Pokémon.', {
    name: 'Articuno-GX',
    setup: ({ p1, p2, attacker, defender }) => {
      p1.zones.active.push(energy('Water', { attachedTo: attacker.instanceId }));
      p2.zones.active.push(
        shield(defender.instanceId),
        energy('Fire', { attachedTo: defender.instanceId })
      );
    },
  });
  const coldRes = attack(cold);
  assert.equal(attachedTo(coldRes, 'p1', activeRoot(coldRes, 'p1').instanceId).length, 0);
  assert.equal(attachedTo(coldRes, 'p2', activeRoot(coldRes, 'p2').instanceId).length, 2);

  const vanish = board("Shuffle all Energy from each of your opponent's Pokémon into their deck.", {
    name: 'Palkia-GX',
    setup: ({ p2, defender }) => {
      p2.zones.active.push(shield(defender.instanceId));
      const bench = mon('Opp Bench');
      p2.zones.bench.push(bench, energy('Lightning', { attachedTo: bench.instanceId }));
    },
  });
  const vanishRes = attack(vanish);
  assert.equal(attachedTo(vanishRes, 'p2', activeRoot(vanishRes, 'p2').instanceId).length, 1);
  assert.equal(zone(vanishRes, 'p2', 'bench').filter((c) => c.supertype === 'Energy').length, 0);
});
