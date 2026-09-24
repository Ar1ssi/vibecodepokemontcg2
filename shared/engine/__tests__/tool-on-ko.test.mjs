// On-damage / on-KO Tool effects (design 035 slice 9, audit F2): real printed texts
// driven through an attack that damages or Knocks Out the defender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { evaluateToolKoPrevention, parseToolOnDamageEffect } from '../rules/tool-combat.mjs';
import { createRng } from '../rng.mjs';

let nextId = 900;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const energy = (name = 'Basic Fire Energy', props = {}) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Fire'], ...props });
const tool = (name, text, props = {}) =>
  card({ name, type: 'Trainer', trainerType: 'Tool', text, ...props });

function game({ p1Active, p2Active, p1Bench = [], p2Bench = [], decks = 4, prizes = 6 } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(p1Active);
  state.players.p2.zones.active.push(p2Active);
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.bench.push(...p2Bench);
  for (let i = 0; i < prizes; i++) {
    state.players.p1.zones.prizes.push(card({ name: `p1 prize ${i}` }));
    state.players.p2.zones.prizes.push(card({ name: `p2 prize ${i}` }));
  }
  for (let i = 0; i < decks; i++) {
    state.players.p1.zones.deck.push(card({ name: `p1 deck ${i}` }));
    state.players.p2.zones.deck.push(card({ name: `p2 deck ${i}` }));
  }
  return state;
}

const attacker = (props = {}) =>
  card({
    name: 'Buzzwole',
    hp: 130,
    types: ['Fighting'],
    subtypes: ['Ultra Beast'],
    attacks: [{ name: 'KO Punch', cost: [], damage: 200 }],
    ...props,
  });
const defender = (props = {}) =>
  card({ name: 'Defender', hp: 100, types: ['Colorless'], ...props });

function attack(state, rng) {
  return applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
}

const attach = (state, playerId, cardToAttach, host) => {
  cardToAttach.attachedTo = host.instanceId;
  state.players[playerId].zones.active.push(cardToAttach);
  return cardToAttach;
};
const attachBench = (state, playerId, cardToAttach, host) => {
  cardToAttach.attachedTo = host.instanceId;
  state.players[playerId].zones.bench.push(cardToAttach);
  return cardToAttach;
};

test('Rescue Scarf returns the Knocked Out Pokémon to hand instead of the discard pile', () => {
  const victim = defender();
  const scarf = tool(
    'Rescue Scarf',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack, put that Pokémon into your hand. (Discard all cards attached to that Pokémon.)'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', scarf, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === victim.instanceId));
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === victim.instanceId));
});

test('Billowing Smoke denies the Prizes for the Knock Out', () => {
  const victim = defender();
  const smoke = tool(
    'Billowing Smoke',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, that player discards any Prize cards they would take for that Knock Out instead of putting those cards into their hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', smoke, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko.prizeCount, 0);
  assert.ok(!res.state.players.p1.flags.prizesOwed);
});

test('Energy Pouch puts all basic Energy on the victim into hand', () => {
  const victim = defender();
  const pouch = tool(
    'Energy Pouch',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, put all basic Energy attached to that Pokémon into your hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  const e1 = energy();
  const e2 = energy();
  attach(state, 'p2', pouch, victim);
  attach(state, 'p2', e1, victim);
  attach(state, 'p2', e2, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === e1.instanceId));
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === e2.instanceId));
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === e1.instanceId));
});

test("Exp. Share (on a Benched Pokémon) moves a Basic Energy from the KO'd Active", () => {
  const benchMon = defender({ name: 'Bench Holder' });
  const state = game({ p1Active: attacker(), p2Active: defender(), p2Bench: [benchMon] });
  const share = tool(
    'Exp. Share',
    'When your Active Pokémon is Knocked Out by damage from an attack from your opponent’s Pokémon, you may move a Basic Energy from that Pokémon to the Pokémon this card is attached to.'
  );
  const basic = energy();
  attachBench(state, 'p2', share, benchMon);
  attach(state, 'p2', basic, state.players.p2.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const moved = [...res.state.players.p2.zones.active, ...res.state.players.p2.zones.bench].find(
    (c) => c.instanceId === basic.instanceId
  );
  assert.equal(moved?.attachedTo, benchMon.instanceId, 'the Energy follows the holder');
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === basic.instanceId));
});

test('Cursed Shovel mills the top 2 of the attacker deck', () => {
  const victim = defender();
  const shovel = tool(
    'Cursed Shovel',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, discard the top 2 cards of your opponent’s deck.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 5 });
  attach(state, 'p2', shovel, victim);
  const top = state.players.p1.zones.deck.slice(0, 2).map((c) => c.instanceId);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.deepEqual(
    res.state.players.p1.zones.discard
      .filter((c) => top.includes(c.instanceId))
      .map((c) => c.instanceId)
      .sort(),
    top.sort()
  );
});

test('Cursed Duster discards a random card from the attacker hand', () => {
  const victim = defender();
  const duster = tool(
    'Cursed Duster',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, discard a random card from your opponent’s hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', duster, victim);
  state.players.p1.zones.hand.push(card({ name: 'h1' }), card({ name: 'h2' }), card({ name: 'h3' }));
  const res = attack(state, { next: () => 0.5, shuffle: (a) => [...a] });
  assert.equal(res.error, null);
  assert.equal(
    res.state.players.p1.zones.hand.filter((c) => String(c.name).startsWith('h')).length,
    2,
    'one of the three hand cards was discarded'
  );
  assert.equal(res.state.players.p1.zones.discard.length >= 1, true);
});

test('Lucky Egg draws the victim up to 7 cards on Knock Out', () => {
  const victim = defender();
  const egg = tool(
    'Lucky Egg',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, draw cards until you have 7 cards in your hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 9 });
  attach(state, 'p2', egg, victim);
  state.players.p2.zones.hand.push(card({ name: 'p2 h1' }));
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.hand.length, 7);
});

test('Amulet of Hope searches up to 3 cards on Knock Out', () => {
  const victim = defender();
  const amulet = tool(
    'Amulet of Hope',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, search your deck for up to 3 cards and put them into your hand. Then, shuffle your deck.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 6 });
  attach(state, 'p2', amulet, victim);
  const res = attack(state, { next: () => 0.5, shuffle: (a) => [...a] });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.hand.length, 3);
  assert.equal(res.state.players.p2.zones.deck.length, 3);
  const searched = res.events.find((e) => e.type === 'cardsLookedAt');
  assert.deepEqual(searched, { type: 'cardsLookedAt', playerId: 'p2', count: 3, zone: 'deck' });
  assert.ok(
    !res.events.some((e) => e.type === 'cardsRevealed' && e.playerId === 'p2'),
    'the private search names no card in the broadcast events'
  );
});

test("Beast Bringer (attacker-side) takes 1 more Prize when the Ultra Beast KOs a GX", () => {
  const victim = defender({ name: 'Charizard-GX', hp: 100, subtypes: ['GX'] });
  const bringer = tool(
    'Beast Bringer',
    'If you have exactly 6 Prize cards remaining, and if your opponent’s Active Pokémon-GX or Pokémon-EX is Knocked Out by damage from an attack of the Ultra Beast this card is attached to, take 1 more Prize card.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p1', bringer, state.players.p1.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko.prizeCount, 3, 'GX base 2 + Beast Bringer 1');
});

test("Team Rocket's Hypnotizer puts the Attacking Pokémon to Sleep on damage", () => {
  const victim = defender({ name: "Team Rocket's Mewtwo", hp: 200 });
  const hypnotizer = tool(
    "Team Rocket's Hypnotizer",
    'If the Team Rocket’s Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Team Rocket’s Pokémon is Knocked Out), the Attacking Pokémon is now Asleep.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', hypnotizer, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(
    res.events.some(
      (e) => e.type === 'statusApplied' && e.condition === 'Asleep' && e.instanceId === state.players.p1.zones.active[0].instanceId
    ),
    'the Attacking Pokémon is put to Sleep'
  );
});

test('Handheld Fan moves an Energy from the Attacking Pokémon to the attacker Bench', () => {
  const benchMon = defender({ name: 'p1 Bench' });
  const victim = defender({ name: 'Tank', hp: 300 });
  const fan = tool(
    'Handheld Fan',
    'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Pokémon is Knocked Out), move an Energy from the Attacking Pokémon to 1 of your opponent’s Benched Pokémon.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, p1Bench: [benchMon] });
  attach(state, 'p2', fan, victim);
  const basic = energy();
  attach(state, 'p1', basic, state.players.p1.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const moved = res.state.players.p1.zones.bench.find((c) => c.instanceId === basic.instanceId);
  assert.equal(moved?.attachedTo, benchMon.instanceId);
});

test('Focus Band flips a coin and prevents the Knock Out on heads (F6)', () => {
  const victim = defender();
  const band = tool(
    'Focus Band',
    'If the Pokémon Focus Band is attached to would be Knocked Out by your opponent’s attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', band, victim);
  const heads = attack(state, { next: () => 0.1, shuffle: (a) => [...a] });
  assert.equal(heads.error, null);
  assert.equal(heads.state.players.p2.zones.active[0]?.damage, 90, 'survives at 10 HP');
  assert.ok(heads.events.some((e) => e.type === 'koPrevented' && e.tool === 'Focus Band'));
  assert.ok(!heads.state.players.p2.zones.active.some((c) => c.instanceId === band.instanceId), 'Focus Band is discarded');

  const state2 = game({ p1Active: attacker(), p2Active: defender() });
  attach(state2, 'p2', tool('Focus Band', band.text), state2.players.p2.zones.active[0]);
  const tails = attack(state2, { next: () => 0.9, shuffle: (a) => [...a] });
  assert.equal(tails.error, null);
  assert.equal(tails.state.players.p2.zones.active.length, 0, 'tails is a Knock Out');
});

// ── Design 038 slice 1: prize-clause side (I138) and damage/KO phase split (I139, I140) ──

const TEXT = {
  luxuriousCape:
    'If the Pokémon this card is attached to doesn’t have a Rule Box, it gets +100 HP, and if it is Knocked Out by damage from an attack from your opponent’s Pokémon, that player takes 1 more Prize card. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)',
  expertBelt:
    'The Pokémon this card is attached to gets +20 HP and that Pokémon’s attacks do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance). When the Pokémon this card is attached to is Knocked Out, your opponent takes 1 more Prize card.',
  lifeDew:
    'If the Pokémon this card is attached to is Knocked Out, your opponent takes 1 fewer Prize card.',
  beastBringer:
    'If you have exactly 6 Prize cards remaining, and if your opponent’s Active Pokémon-GX or Pokémon-EX is Knocked Out by damage from an attack of the Ultra Beast this card is attached to, take 1 more Prize card.',
  skySealStone:
    'VSTAR Power The Pokémon V this card is attached to can use the VSTAR Power on this card. Ability ⇢ Star Order During your turn, you may use this Ability. During this turn, if your opponent’s Active Pokémon VSTAR or Active Pokémon VMAX is Knocked Out by damage from an attack from your Basic Pokémon V, take 1 more Prize card. (You can’t use more than 1 VSTAR Power in a game.)',
  luckyEgg:
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, draw cards until you have 7 cards in your hand.',
  handheldFan:
    'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Pokémon is Knocked Out), move an Energy from the Attacking Pokémon to 1 of your opponent’s Benched Pokémon.',
  ruggedHelmet:
    'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if it is Knocked Out), put an Energy attached to the Attacking Pokémon into your opponent’s hand.',
  vengefulPunch:
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, put 4 damage counters on the Attacking Pokémon.',
};

const koPrizeCount = (res) =>
  res.events.find((e) => e.type === 'pokemonKnockedOut')?.prizeCount;

test('an attacker holding a victim-side prize Tool takes the base Prizes (I138)', () => {
  for (const [name, text] of [
    ['Luxurious Cape', TEXT.luxuriousCape],
    ['Expert Belt', TEXT.expertBelt],
    ['Life Dew', TEXT.lifeDew],
  ]) {
    const state = game({ p1Active: attacker(), p2Active: defender() });
    attach(state, 'p1', tool(name, text), state.players.p1.zones.active[0]);
    const res = attack(state);
    assert.equal(res.error, null, name);
    assert.equal(
      koPrizeCount(res),
      1,
      `${name} on the attacker leaves a 1-Prize KO at 1`
    );
  }
});

test('the victim holding Beast Bringer at exactly 6 Prizes gives the base Prizes (design 038 row 2)', () => {
  const victim = defender({
    name: 'Buzzwole-GX',
    subtypes: ['GX', 'Ultra Beast'],
  });
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', tool('Beast Bringer', TEXT.beastBringer), victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(
    koPrizeCount(res),
    2,
    'GX base 2; the clause is the holder owner’s own Knock Outs'
  );
});

test('an attacker holding Sky Seal Stone takes the base Prizes until Star Order exists (design 038 row 3)', () => {
  const victim = defender({
    name: 'Arceus VSTAR',
    hp: 100,
    subtypes: ['VSTAR'],
  });
  const striker = attacker({ name: 'Zeraora V', subtypes: ['Basic', 'V'] });
  const state = game({ p1Active: striker, p2Active: victim });
  attach(state, 'p1', tool('Sky Seal Stone', TEXT.skySealStone), striker);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(koPrizeCount(res), 2, 'VSTAR base 2, no Star Order bonus');
});

test('attacker-side Prize clauses need a Knock Out by the holder’s attack (design 038 row 4)', () => {
  // p1's Confused GX hurts itself; p2's Ultra Beast holds Beast Bringer at 6 Prizes.
  // p2 is credited the Knock Out, but no attack of the Ultra Beast caused it.
  const confusedGx = attacker({
    name: 'Charizard-GX',
    hp: 30,
    subtypes: ['GX'],
  });
  confusedGx.specialCondition = 'Confused';
  const ultraBeast = defender({ name: 'Buzzwole', subtypes: ['Ultra Beast'] });
  const state = game({ p1Active: confusedGx, p2Active: ultraBeast });
  attach(state, 'p2', tool('Beast Bringer', TEXT.beastBringer), ultraBeast);
  const res = attack(state, { next: () => 0.9, shuffle: (a) => [...a] });
  assert.equal(res.error, null);
  assert.ok(
    res.events.some((e) => e.type === 'attackConfusedFizzle'),
    'tails: confusion damage'
  );
  assert.equal(koPrizeCount(res), 2, 'GX base 2, no Beast Bringer bonus');
});

test('parseToolOnDamageEffect: phase follows the governing trigger (design 038 row 7)', () => {
  const rows = [
    ['Handheld Fan', TEXT.handheldFan, 'damage'],
    ['Rugged Helmet', TEXT.ruggedHelmet, 'damage'],
    [
      'Rocky Helmet',
      'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if it is Knocked Out), put 2 damage counters on the Attacking Pokémon.',
      'damage',
    ],
    [
      "Team Rocket's Hypnotizer",
      'If the Team Rocket’s Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Team Rocket’s Pokémon is Knocked Out), the Attacking Pokémon is now Asleep.',
      'damage',
    ],
    ['Lucky Egg', TEXT.luckyEgg, 'ko'],
    ['Vengeful Punch', TEXT.vengefulPunch, 'ko'],
    [
      'Exp. Share',
      'When your Active Pokémon is Knocked Out by damage from an attack from your opponent’s Pokémon, you may move a Basic Energy from that Pokémon to the Pokémon this card is attached to.',
      'ko',
    ],
    [
      'Time Shard',
      'Attach Time Shard to 1 of your Pokémon that doesn’t already have a Pokémon Tool card attached to it. If that Pokémon is Knocked Out, discard this card. If the Pokémon this card is attached to is Knocked Out by damage from the Defending Pokémon’s attack during your opponent’s turn, you may return up to 2 basic Energy cards attached to that Pokémon to your hand.',
      'ko',
    ],
  ];
  for (const [name, text, phase] of rows) {
    assert.equal(parseToolOnDamageEffect(tool(name, text))?.phase, phase, name);
  }
});

test('Lucky Egg does nothing when its holder is damaged but survives (I139, design 038 row 5)', () => {
  const victim = defender({ name: 'Tank', hp: 300 });
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 9 });
  attach(state, 'p2', tool('Lucky Egg', TEXT.luckyEgg), victim);
  state.players.p2.zones.hand.push(card({ name: 'p2 h1' }));
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(
    res.state.players.p2.zones.active[0].damage,
    200,
    'the holder survives'
  );
  // The attack ends p1's turn, so p2's hand is the 1 card plus the turn-start draw.
  assert.equal(res.state.players.p2.zones.hand.length, 2, 'no Lucky Egg draw');
  assert.ok(
    !res.events.some((e) => e.type === 'cardsDrawn' && e.source === 'Lucky Egg')
  );
});

test('Handheld Fan on a Knocked Out holder moves at most one Energy, once (I140, design 038 row 6)', () => {
  for (const [energyCount, expectedMoved] of [
    [0, 0],
    [1, 1],
    [2, 1],
  ]) {
    const benchMon = defender({ name: 'p1 Bench' });
    const victim = defender();
    const state = game({
      p1Active: attacker(),
      p2Active: victim,
      p1Bench: [benchMon],
    });
    attach(state, 'p2', tool('Handheld Fan', TEXT.handheldFan), victim);
    for (let i = 0; i < energyCount; i++)
      attach(state, 'p1', energy(), state.players.p1.zones.active[0]);
    const res = attack(state);
    assert.equal(res.error, null);
    assert.ok(koPrizeCount(res) >= 1, 'the holder is Knocked Out');
    const moved = res.state.players.p1.zones.bench.filter(
      (c) => c.attachedTo === benchMon.instanceId
    );
    assert.equal(
      moved.length,
      expectedMoved,
      `${energyCount} Energy on the attacker`
    );
  }
});

test('Rugged Helmet on a Knocked Out holder returns one Energy to the attacker hand (I140)', () => {
  const victim = defender();
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', tool('Rugged Helmet', TEXT.ruggedHelmet), victim);
  attach(state, 'p1', energy(), state.players.p1.zones.active[0]);
  attach(state, 'p1', energy(), state.players.p1.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(
    res.state.players.p1.zones.hand.filter((c) => c.type === 'Energy').length,
    1
  );
});

test('Vengeful Punch retaliates only when its holder is Knocked Out', () => {
  const tank = defender({ name: 'Tank', hp: 300 });
  const survived = game({ p1Active: attacker(), p2Active: tank });
  attach(survived, 'p2', tool('Vengeful Punch', TEXT.vengefulPunch), tank);
  const hit = attack(survived);
  assert.equal(hit.error, null);
  assert.equal(
    hit.state.players.p1.zones.active[0].damage || 0,
    0,
    'no counters on a non-KO hit'
  );

  const victim = defender();
  const koed = game({ p1Active: attacker(), p2Active: victim });
  attach(koed, 'p2', tool('Vengeful Punch', TEXT.vengefulPunch), victim);
  const ko = attack(koed);
  assert.equal(ko.error, null);
  assert.equal(
    ko.state.players.p1.zones.active[0].damage,
    40,
    '4 counters on the Attacking Pokémon'
  );
});

// ── Design 038 slice 3: Focus Band coin events and bench RNG (I146) ──

const FOCUS_BAND =
  'If the Pokémon Focus Band is attached to would be Knocked Out by your opponent’s attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.';
const coinEvents = (res) => res.events.filter((e) => e.type === 'coinFlipped');

test('Focus Band reports its tails flip on the Active (design 038 row 14)', () => {
  const state = game({ p1Active: attacker(), p2Active: defender() });
  attach(state, 'p2', tool('Focus Band', FOCUS_BAND), state.players.p2.zones.active[0]);
  const tails = attack(state, { next: () => 0.9, shuffle: (a) => [...a] });
  assert.equal(tails.error, null);
  assert.deepEqual(
    coinEvents(tails).map((e) => [e.playerId, e.face]),
    [['p2', 'tails']]
  );
});

const spreader = () =>
  attacker({
    attacks: [
      {
        name: 'Spread',
        cost: [],
        damage: 10,
        text: 'This attack also does 20 damage to each of your opponent’s Benched Pokémon.',
      },
    ],
  });

test('Focus Band on a Benched Pokémon flips against bench spread damage (design 038 row 14)', () => {
  for (const [roll, face] of [
    [0.1, 'heads'],
    [0.9, 'tails'],
  ]) {
    const benched = defender({ name: 'Benched', hp: 20 });
    const state = game({ p1Active: spreader(), p2Active: defender(), p2Bench: [benched] });
    attachBench(state, 'p2', tool('Focus Band', FOCUS_BAND), benched);
    const res = attack(state, { next: () => roll, shuffle: (a) => [...a] });
    assert.equal(res.error, null);
    assert.deepEqual(
      coinEvents(res).map((e) => [e.playerId, e.face]),
      [['p2', face]]
    );
    const survived = res.state.players.p2.zones.bench.some((c) => c.instanceId === benched.instanceId);
    assert.equal(survived, face === 'heads', `${face}: survives only on heads`);
    if (survived) {
      const onBench = res.state.players.p2.zones.bench.find((c) => c.instanceId === benched.instanceId);
      assert.equal(onBench.damage, 10, 'heads leaves 10 HP');
    }
  }
});

test('Focus Band flips replay deterministically from the same seed (design 038 row 15)', () => {
  const run = () => {
    const benched = defender({ name: 'Benched', hp: 20, instanceId: 'bench-fb' });
    const state = game({ p1Active: spreader(), p2Active: defender(), p2Bench: [benched] });
    attachBench(state, 'p2', tool('Focus Band', FOCUS_BAND), benched);
    return coinEvents(attack(state, createRng(38))).map((e) => e.face);
  };
  const first = run();
  assert.equal(first.length, 1);
  assert.deepEqual(run(), first);
});

test('evaluateToolKoPrevention: Focus Band without a coin flipper neither flips nor prevents', () => {
  const victim = defender();
  const band = tool('Focus Band', FOCUS_BAND);
  band.attachedTo = victim.instanceId;
  const res = evaluateToolKoPrevention(victim, [victim, band], {
    incomingDamage: 200,
    baseHp: 100,
    inHp: true,
  });
  assert.equal(res.prevented, false);
  assert.equal(res.coinFace, undefined);
});
