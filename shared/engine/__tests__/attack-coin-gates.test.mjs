// Coin-gated attack sentences (design 032, I120): "If heads / If tails / For each heads, …"
// clauses the server attack phase used to skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { parseAttackEnergyDiscard } from '../rules/attack-effects.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type = 'Fire', extra = {}) =>
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
  const state = createGameState({ gameId: 'atk-gates', seed, rulesEnabled: false });
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

const coinOf = (res) => res.events.find((e) => e.type === 'attackCoinFlipped');

/** Attacks with the first seed whose coin lands on `face` ('heads' | 'tails'). */
function attackOn(face, text, options = {}) {
  for (let seed = 1; seed <= 40; seed++) {
    const b = board(text, { ...options, seed });
    const res = attack(b);
    if (coinOf(res)?.coin === face) return { b, res };
  }
  throw new Error(`no seed lands ${face}`);
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

const zone = (res, pid, name) => res.state.players[pid].zones[name];
const attachedTo = (res, pid, rootId) =>
  [...zone(res, pid, 'active'), ...zone(res, pid, 'bench')].filter((c) => c.attachedTo === rootId);
const turnPassed = (res) => assert.equal(res.state.turn.player, 'p2', 'the attack ends the turn');

const withEnergy = (...types) => ({ attacker, p1 }) => {
  for (const type of types) {
    const e = energy(type);
    e.attachedTo = attacker.instanceId;
    p1.zones.active.push(e);
  }
};

// ── slice 1: self Energy discard behind the coin ────────────────────────────

test('parseAttackSteps: gated self discards are steps; ungated ones stay with the helper', () => {
  const after = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(after('Flip a coin. If tails, discard 2 Energy attached to this Pokémon.'), [
    { type: 'atkDiscardSelfEnergy', count: 2, gate: 'tails' },
  ]);
  assert.deepEqual(after('Flip a coin. If tails, discard all {R} Energy cards attached to Arcanine.', 'Arcanine'), [
    { type: 'atkDiscardSelfEnergy', all: true, energyType: 'R', gate: 'tails' },
  ]);
  assert.deepEqual(after('Flip a coin. If tails, discard a {R} Energy card attached to Ditto.', 'Ditto'), [
    { type: 'atkDiscardSelfEnergy', count: 1, energyType: 'R', gate: 'tails' },
  ]);
  assert.deepEqual(after('Discard 2 Energy from this Pokémon.'), []);
  // Damage counts the discard, or the cost can cancel the attack: left alone.
  assert.deepEqual(
    after(
      'You may flip a coin. If heads, discard all {L} Energy cards attached to Raikou. This attack does 40 damage plus 20 more damage for each Energy card discarded in this way.',
      'Raikou'
    ),
    []
  );
  assert.deepEqual(
    after(
      "Flip a coin. If heads, discard 2 Energy cards attached to Charizard. If tails, discard 4 Energy cards attached to Charizard. (If you can't, this attack does nothing.)",
      'Charizard'
    ),
    []
  );
});

test('parseAttackEnergyDiscard: a coin-gated "discard all" is not the helper\'s (Dynamic Bolt)', () => {
  assert.equal(parseAttackEnergyDiscard({ text: 'Flip a coin. If tails, discard all Energy from this Pokémon.' }), null);
  assert.deepEqual(parseAttackEnergyDiscard({ text: 'Discard all Energy from this Pokémon.' }), {
    all: true,
    count: Infinity,
    energyType: null,
  });
});

test('attack: Dynamic Bolt keeps its Energy on heads and discards all on tails', () => {
  const text = 'Flip a coin. If tails, discard all Energy from this Pokémon.';
  const heads = attackOn('heads', text, { name: 'Pikachu ex', damage: '220', setup: withEnergy('Lightning', 'Fire') });
  assert.equal(attachedTo(heads.res, 'p1', heads.b.attacker.instanceId).length, 2);
  const tails = attackOn('tails', text, { name: 'Pikachu ex', damage: '220', setup: withEnergy('Lightning', 'Fire') });
  assert.equal(attachedTo(tails.res, 'p1', tails.b.attacker.instanceId).length, 0);
  assert.equal(zone(tails.res, 'p1', 'discard').length, 2);
  turnPassed(tails.res);
});

test('attack: Aeroscream discards the 2 chosen Energy on tails only', () => {
  const text = 'Flip a coin. If tails, discard 2 Energy attached to this Pokémon.';
  const heads = attackOn('heads', text, { setup: withEnergy('Fire', 'Water', 'Grass') });
  assert.equal(attachedTo(heads.res, 'p1', heads.b.attacker.instanceId).length, 3);
  assert.equal(heads.res.state.pendingChoice, null);

  const { b, res } = attackOn('tails', text, { setup: withEnergy('Fire', 'Water', 'Grass') });
  assert.equal(res.state.pendingChoice.player, 'p1');
  const [fire, water] = attachedTo(res, 'p1', b.attacker.instanceId);
  const res2 = choose(res, [fire.instanceId, water.instanceId], b.rng);
  assert.deepEqual(
    attachedTo(res2, 'p1', b.attacker.instanceId).map((c) => c.energyType),
    ['Grass']
  );
  turnPassed(res2);
});

test('attack: a typed gated discard with fewer matches discards what there is', () => {
  const text = 'Flip a coin. If tails, discard 2 {R} Energy attached to this Pokémon.';
  const { b, res } = attackOn('tails', text, { setup: withEnergy('Fire', 'Water') });
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(
    attachedTo(res, 'p1', b.attacker.instanceId).map((c) => c.energyType),
    ['Water']
  );
});

// ── slice 1: until-tails flips ──────────────────────────────────────────────

test('attack: "Flip a coin until you get tails" counts every heads for damage', () => {
  const text = 'Flip a coin until you get tails. This attack does 20 damage for each heads.';
  let sawRun = false;
  for (let seed = 1; seed <= 20; seed++) {
    const res = attack(board(text, { damage: '20×', seed }));
    const flip = coinOf(res);
    assert.equal(flip.flips[flip.flips.length - 1], 'tails', `seed ${seed}`);
    assert.equal(flip.headsCount, flip.flips.length - 1);
    sawRun ||= flip.headsCount >= 2;
    assert.equal(zone(res, 'p2', 'active')[0].damage, 20 * flip.headsCount, `seed ${seed}`);
  }
  assert.ok(sawRun, 'the seeds cover a run of 2+ heads');
});

// ── slice 1: coin-gated deck search ─────────────────────────────────────────

test('attack: Chase Up searches the deck on heads only', () => {
  const text = 'Flip a coin. If heads, search your deck for any 1 card and put it into your hand. Shuffle your deck afterward.';
  const tails = attackOn('tails', text, { name: 'Manaphy' });
  assert.equal(tails.res.state.pendingChoice, null);
  turnPassed(tails.res);
  const heads = attackOn('heads', text, { name: 'Manaphy' });
  assert.equal(heads.res.state.pendingChoice?.player, 'p1');
});

// ── slice 2: the opponent's board ───────────────────────────────────────────

const onDefender = (...cards) => ({ defender, p2 }) => {
  for (const card of cards) {
    card.attachedTo = defender.instanceId;
    p2.zones.active.push(card);
  }
};

test('parseAttackSteps: opponent-board coin sentences', () => {
  const after = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(after('Flip a coin. If heads, discard 1 Energy card attached to the Defending Pokémon, if any.'), [
    { type: 'atkDiscardOppEnergy', scope: 'active', count: 1, gate: 'heads' },
  ]);
  assert.deepEqual(
    after('Flip a coin until you get tails. For each heads, your opponent discards an Energy card attached to the Defending Pokémon.'),
    [{ type: 'atkDiscardOppEnergy', scope: 'active', count: 1, chooser: 'opponent', perHeads: true }]
  );
  assert.deepEqual(
    after('Flip a coin until you get tails. For each heads, remove an Energy card attached to the Defending Pokémon and put it in the Lost Zone.'),
    [{ type: 'atkLostZoneEnergy', from: 'opponentActive', count: 1, perHeads: true }]
  );
  assert.deepEqual(
    after('If the Defending Pokémon has any Energy cards attached to it, flip a coin. If heads, choose 1 of those cards and discard it.'),
    [{ type: 'atkDiscardOppEnergy', scope: 'active', count: 1, gate: 'heads' }]
  );
  assert.deepEqual(
    after(
      "If the Defending Pokémon has any Energy cards attached to it, flip a coin. If heads, choose 1 of those Energy cards and move it to 1 of your opponent's Benched Pokémon. If your opponent has no Benched Pokémon, ignore this effect."
    ),
    [{ type: 'atkMoveEnergy', from: 'opponentActive', to: 'opponentBench', count: 1, gate: 'heads' }]
  );
  assert.deepEqual(
    after(
      "Flip a coin. If heads, choose a Special Energy card attached to 1 of your opponent's Pokémon and have your opponent shuffle that card into his or her deck."
    ),
    [{ type: 'atkDiscardOppEnergy', scope: 'any', count: 1, special: true, toDeck: true, gate: 'heads' }]
  );
  assert.deepEqual(after('Flip a coin. If heads, your opponent discards the top card from his or her deck.'), [
    { type: 'atkMill', side: 'opponent', count: 1, gate: 'heads' },
  ]);
  assert.deepEqual(
    after('Flip a coin. If heads, your opponent returns the Defending Pokémon and all cards attached to it to his or her hand.'),
    [{ type: 'atkBounceOppActive', gate: 'heads' }]
  );
  assert.deepEqual(
    after(
      "Flip a coin. If heads, put 1 of your opponent's Benched Pokémon and all cards attached to it on top of your opponent's deck. Your opponent shuffles his or her deck afterward."
    ),
    [{ type: 'atkShuffleOppBench', count: 1, gate: 'heads' }]
  );
  assert.deepEqual(
    after(
      "Flip a coin. If heads, choose 1 of either player's Evolved Pokémon, remove the highest Stage Evolution card from that Pokémon, and put it into that player's hand."
    ),
    [{ type: 'atkDevolve', scope: 'chooseAny', to: 'hand', gate: 'heads' }]
  );
});

test('attack: Hyper Whirlpool lets the opponent discard 1 Energy per heads', () => {
  const text =
    'Flip a coin until you get tails. For each heads, your opponent discards an Energy card attached to the Defending Pokémon.';
  let checked = false;
  for (let seed = 1; seed <= 30 && !checked; seed++) {
    const b = board(text, { seed, setup: onDefender(energy('Water'), energy('Water'), energy('Water'), energy('Water')) });
    const res = attack(b);
    const heads = coinOf(res).headsCount;
    if (heads === 0) {
      assert.equal(attachedTo(res, 'p2', b.defender.instanceId).length, 4);
      continue;
    }
    if (heads >= 4) continue;
    assert.equal(res.state.pendingChoice.player, 'p2', 'the opponent chooses');
    assert.equal(res.state.pendingChoice.min, heads);
    const picked = attachedTo(res, 'p2', b.defender.instanceId)
      .slice(0, heads)
      .map((c) => c.instanceId);
    const res2 = choose(res, picked, b.rng);
    assert.equal(attachedTo(res2, 'p2', b.defender.instanceId).length, 4 - heads);
    checked = true;
  }
  assert.ok(checked, 'a seed flips 1-3 heads');
});

test('attack: Remove Lost puts 1 Energy per heads in the Lost Zone', () => {
  const text =
    'Flip a coin until you get tails. For each heads, remove an Energy card attached to the Defending Pokémon and put it in the Lost Zone.';
  const five = () => [1, 2, 3, 4, 5].map(() => energy('Water'));
  for (let seed = 1; seed <= 10; seed++) {
    const b = board(text, { seed, setup: onDefender(...five()) });
    let res = attack(b);
    const heads = Math.min(coinOf(res).headsCount, 5);
    if (res.state.pendingChoice) {
      const picked = attachedTo(res, 'p2', b.defender.instanceId)
        .slice(0, heads)
        .map((c) => c.instanceId);
      res = choose(res, picked, b.rng);
    }
    assert.equal((zone(res, 'p2', 'lostZone') || []).length, heads, `seed ${seed}`);
  }
});

test("attack: Crushing Blow discards the Defending Pokémon's Energy on heads only", () => {
  const text =
    'If the Defending Pokémon has any Energy cards attached to it, flip a coin. If heads, choose 1 of those cards and discard it.';
  const tails = attackOn('tails', text, { setup: onDefender(energy('Water')) });
  assert.equal(attachedTo(tails.res, 'p2', tails.b.defender.instanceId).length, 1);
  const heads = attackOn('heads', text, { setup: onDefender(energy('Water')) });
  assert.equal(attachedTo(heads.res, 'p2', heads.b.defender.instanceId).length, 0);
});

test("attack: Aqua Trick moves an Energy to the opponent's Bench; no Bench does nothing", () => {
  const text =
    "If the Defending Pokémon has any Energy cards attached to it, flip a coin. If heads, choose 1 of those Energy cards and move it to 1 of your opponent's Benched Pokémon. If your opponent has no Benched Pokémon, ignore this effect.";
  const { b, res } = attackOn('heads', text, {
    setup: (ctx) => {
      onDefender(energy('Water'))(ctx);
      ctx.p2.zones.bench.push(mon('Benched'));
    },
  });
  const benched = zone(res, 'p2', 'bench').find((c) => c.name === 'Benched');
  assert.equal(attachedTo(res, 'p2', b.defender.instanceId).length, 0);
  assert.equal(attachedTo(res, 'p2', benched.instanceId).length, 1);
  const alone = attackOn('heads', text, { setup: onDefender(energy('Water')) });
  assert.equal(attachedTo(alone.res, 'p2', alone.b.defender.instanceId).length, 1);
});

test("attack: Psykiss shuffles a Special Energy into the opponent's deck on heads", () => {
  const text =
    "Flip a coin. If heads, choose a Special Energy card attached to 1 of your opponent's Pokémon and have your opponent shuffle that card into his or her deck.";
  const special = () => energy('Colorless', { name: 'Double Colorless Energy', subtypes: ['Special'] });
  const { b, res } = attackOn('heads', text, { setup: onDefender(special(), energy('Water')) });
  const left = attachedTo(res, 'p2', b.defender.instanceId);
  assert.deepEqual(
    left.map((c) => c.name),
    ['Basic Water Energy']
  );
  assert.ok(zone(res, 'p2', 'deck').some((c) => c.name === 'Double Colorless Energy'));
  assert.ok(res.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
});

test("attack: Mix-Up discards the top card of the opponent's deck on heads", () => {
  const text = 'Flip a coin. If heads, your opponent discards the top card from his or her deck.';
  const heads = attackOn('heads', text);
  assert.equal(zone(heads.res, 'p2', 'discard').length, 1);
  const tails = attackOn('tails', text);
  assert.equal(zone(tails.res, 'p2', 'discard').length, 0);
});

test('attack: Spin Storm returns the Defending Pokémon to the hand and the opponent promotes', () => {
  const text =
    'Flip a coin. If heads, your opponent returns the Defending Pokémon and all cards attached to it to his or her hand.';
  const { b, res } = attackOn('heads', text, {
    damage: '20',
    setup: (ctx) => {
      onDefender(energy('Water'))(ctx);
      ctx.p2.zones.bench.push(mon('Benched'));
    },
  });
  const hand = zone(res, 'p2', 'hand');
  assert.ok(hand.some((c) => c.instanceId === b.defender.instanceId && c.damage === 0));
  assert.ok(hand.some((c) => c.name === 'Basic Water Energy'));
  assert.equal(zone(res, 'p2', 'active').find((c) => !c.attachedTo)?.name, 'Benched', 'the only Benched Pokémon promotes');

  const alone = attackOn('heads', text);
  assert.equal(zone(alone.res, 'p2', 'active')[0].instanceId, alone.b.defender.instanceId, 'no Bench: nothing happens');
});

test("attack: Strong Breeze shuffles the chosen Benched Pokémon into the opponent's deck", () => {
  const text =
    "Flip a coin. If heads, put 1 of your opponent's Benched Pokémon and all cards attached to it on top of your opponent's deck. Your opponent shuffles his or her deck afterward.";
  const { res } = attackOn('heads', text, { setup: ({ p2 }) => p2.zones.bench.push(mon('Benched')) });
  assert.equal(zone(res, 'p2', 'bench').length, 0);
  assert.ok(zone(res, 'p2', 'deck').some((c) => c.name === 'Benched'));
});

test('attack: Hidden Power devolves the chosen evolved Pokémon of either player', () => {
  const text =
    "Flip a coin. If heads, choose 1 of either player's Evolved Pokémon, remove the highest Stage Evolution card from that Pokémon, and put it into that player's hand.";
  const evolveOnto = (player, root, zoneId, name) => {
    const stage1 = mon(name, { stage: 'Stage 1', evolvesFrom: root.name });
    stage1.attachedTo = root.instanceId;
    player.zones[zoneId].push(stage1);
  };
  const { b, res } = attackOn('heads', text, {
    setup: ({ p1, p2, defender }) => {
      evolveOnto(p2, defender, 'active', 'Opp Stage 1');
      const own = mon('Own Basic');
      p1.zones.bench.push(own);
      evolveOnto(p1, own, 'bench', 'Own Stage 1');
    },
  });
  assert.equal(res.state.pendingChoice.player, 'p1');
  assert.equal(res.state.pendingChoice.options.length, 2);
  const res2 = choose(res, [b.defender.instanceId], b.rng);
  assert.ok(zone(res2, 'p2', 'hand').some((c) => c.name === 'Opp Stage 1'));
  assert.ok(zone(res2, 'p1', 'bench').some((c) => c.name === 'Own Stage 1'), 'the other side keeps its evolution');
});

// ── slice 3: your own side ──────────────────────────────────────────────────

test('parseAttackSteps: own-side coin sentences', () => {
  const after = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(after('Flip a coin. If heads, put a card from your discard pile into your hand.'), [
    { type: 'atkRecover', count: 1, what: null, gate: 'heads' },
  ]);
  assert.deepEqual(after('Flip a coin. If heads, choose a card from your discard pile and put it on top of your deck.'), [
    { type: 'atkRecover', count: 1, what: null, to: 'deckTop', gate: 'heads' },
  ]);
  assert.deepEqual(
    after('Flip a coin. If heads, search your discard pile for a card, show it to your opponent, and put it on top of your deck.'),
    [{ type: 'atkRecover', count: 1, what: null, to: 'deckTop', gate: 'heads' }]
  );
  assert.deepEqual(
    after('If there are any {W} Energy cards in your discard pile, flip a coin. If heads, attach 1 of them to Articuno.', 'Articuno'),
    [{ type: 'atkAttach', source: 'discard', count: 1, energyType: 'W', target: 'self', gate: 'heads' }]
  );
  assert.deepEqual(
    after(
      'Flip 3 coins. For each heads, attach a basic Energy card from your discard pile to your Benched Pokémon-EX in any way you like.'
    ),
    [{ type: 'atkAttach', source: 'discard', count: 1, basic: true, target: 'bench', spread: true, targetEx: true, perHeads: true }]
  );
  assert.deepEqual(
    after('Flip a coin. If tails, shuffle Crobat and all cards attached to it back into your deck.', 'Crobat'),
    [{ type: 'atkShuffleSelf', gate: 'tails' }]
  );
  const evolve = parseAttackSteps(
    'The Defending Pokémon is now Poisoned. Flip a coin. If heads, search your deck for an Evolution card that evolves from Kakuna and put it onto Kakuna. (This counts as evolving Kakuna.) Shuffle your deck afterward.',
    { selfName: 'Kakuna' }
  );
  assert.deepEqual(evolve.after, [{ type: 'searchEvolve', ontoSource: true, gate: 'heads' }]);
  assert.equal(evolve.handlesSearch, true);
});

const inDiscard = (...cards) => ({ p1 }) => p1.zones.discard.push(...cards);

test('attack: Reverse Edge puts the chosen discard-pile card into the hand on heads', () => {
  const text = 'Flip a coin. If heads, put a card from your discard pile into your hand.';
  const { b, res } = attackOn('heads', text, { setup: inDiscard(trainer('Potion'), energy('Metal')) });
  assert.equal(res.state.pendingChoice.player, 'p1');
  const potion = zone(res, 'p1', 'discard').find((c) => c.name === 'Potion');
  const res2 = choose(res, [potion.instanceId], b.rng);
  assert.deepEqual(
    zone(res2, 'p1', 'hand').map((c) => c.name),
    ['Potion']
  );
  const tails = attackOn('tails', text, { setup: inDiscard(trainer('Potion')) });
  assert.equal(zone(tails.res, 'p1', 'hand').length, 0);
});

test('attack: Warp Hole puts the only discard-pile card on top of the deck', () => {
  const text = 'Flip a coin. If heads, choose a card from your discard pile and put it on top of your deck.';
  const { res } = attackOn('heads', text, { setup: inDiscard(trainer('Rare Candy')) });
  assert.equal(zone(res, 'p1', 'deck')[0].name, 'Rare Candy');
  assert.equal(zone(res, 'p1', 'discard').length, 0);
  const empty = attackOn('heads', text);
  assert.ok(empty.res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'nothing_to_recover'));
});

test('attack: Freeze Solid attaches a {W} Energy from the discard pile to itself on heads', () => {
  const text = 'If there are any {W} Energy cards in your discard pile, flip a coin. If heads, attach 1 of them to Articuno.';
  const { b, res } = attackOn('heads', text, { name: 'Articuno', setup: inDiscard(energy('Fire'), energy('Water')) });
  assert.deepEqual(
    attachedTo(res, 'p1', b.attacker.instanceId).map((c) => c.energyType),
    ['Water']
  );
  const tails = attackOn('tails', text, { name: 'Articuno', setup: inDiscard(energy('Water')) });
  assert.equal(attachedTo(tails.res, 'p1', tails.b.attacker.instanceId).length, 0);
});

test('attack: Energy Hunt attaches 1 basic Energy per heads to Benched Pokémon-EX only', () => {
  const text =
    'Flip 3 coins. For each heads, attach a basic Energy card from your discard pile to your Benched Pokémon-EX in any way you like.';
  let checked = false;
  for (let seed = 1; seed <= 20 && !checked; seed++) {
    const b = board(text, {
      seed,
      setup: ({ p1 }) => {
        p1.zones.bench.push(mon('Mewtwo-EX'), mon('Pikachu'));
        p1.zones.discard.push(energy('Psychic'), energy('Psychic'), energy('Psychic'));
      },
    });
    let res = attack(b);
    const heads = coinOf(res).headsCount;
    if (heads === 0) continue;
    // One Energy picked per heads, then each goes to the only Pokémon-EX.
    while (res.state.pendingChoice) {
      const { options, min } = res.state.pendingChoice;
      assert.ok(options.every((o) => o.name !== 'Pikachu'), 'a non-EX is never offered');
      res = choose(res, options.slice(0, Math.max(min, 1)).map((o) => o.instanceId), b.rng);
    }
    const mewtwo = zone(res, 'p1', 'bench').find((c) => c.name === 'Mewtwo-EX');
    assert.equal(attachedTo(res, 'p1', mewtwo.instanceId).length, heads, `seed ${seed}`);
    checked = true;
  }
  assert.ok(checked, 'a seed flips heads');
});

test('attack: Strike and Fade shuffles the attacker into the deck on tails', () => {
  const text = 'Flip a coin. If tails, shuffle Crobat and all cards attached to it back into your deck.';
  const setup = ({ p1 }) => p1.zones.bench.push(mon('Benched'));
  const tails = attackOn('tails', text, { name: 'Crobat', setup });
  assert.ok(zone(tails.res, 'p1', 'deck').some((c) => c.instanceId === tails.b.attacker.instanceId));
  const heads = attackOn('heads', text, { name: 'Crobat', setup });
  assert.equal(zone(heads.res, 'p1', 'active')[0].instanceId, heads.b.attacker.instanceId);
});

test('attack: Dangerous Evolution evolves the attacker from the deck on heads', () => {
  const text =
    'Flip a coin. If heads, search your deck for an Evolution card that evolves from Kakuna and put it onto Kakuna. (This counts as evolving Kakuna.) Shuffle your deck afterward.';
  const setup = ({ p1 }) => {
    p1.zones.deck.push(mon('Beedrill', { stage: 'Stage 2', evolvesFrom: 'Kakuna' }));
    // Another Kakuna on the Bench must not be offered: only the attacker evolves.
    p1.zones.bench.push(mon('Kakuna', { stage: 'Stage 1' }));
  };
  const { b, res } = attackOn('heads', text, { name: 'Kakuna', setup });
  assert.equal(res.state.pendingChoice.player, 'p1');
  const beedrill = res.state.pendingChoice.options.find((c) => c.name === 'Beedrill');
  const res2 = choose(res, [beedrill.instanceId], b.rng);
  assert.ok(zone(res2, 'p1', 'active').some((c) => c.name === 'Beedrill' && c.attachedTo === b.attacker.instanceId));
  assert.equal(zone(res2, 'p1', 'hand').length, 0, 'no card goes to the hand');

  const tails = attackOn('tails', text, { name: 'Kakuna', setup });
  assert.equal(tails.res.state.pendingChoice, null);
  assert.ok(zone(tails.res, 'p1', 'deck').some((c) => c.name === 'Beedrill'));
});
