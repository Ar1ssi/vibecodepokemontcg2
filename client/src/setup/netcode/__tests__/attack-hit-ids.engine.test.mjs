// Design 069: attackHitIds against the events reduce actually emits for multi-target attacks.
// Card text: out/pkmn-pokemon-cards.json (Kyurem ex BLK 165, Mewtwo ex 30C 157, Buzzwole-GX 30C 57).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisoryAnimationPlan, attackHitIds, attackLeads, attackStrikes, strikeKnockouts } from '../advisory-animations.mjs';
import { createFxQueue } from '../mat-fx/fx-queue.mjs';
import { createImpactQueue } from '../mat-fx/combat-pose.mjs';
import { createStrikeBook, hitDelaysOf, knockoutHoldMs, layoutHits } from '../mat-fx/multi-hit.mjs';
import { createGameState } from '../../../../../shared/engine/state.mjs';
import { createCard } from '../../../../../shared/engine/cards.mjs';
import { applyCommand } from '../../../../../shared/engine/reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', subtypes: ['Basic'], ...props });

const board = ({ attacker, active, bench = [], prizesLeft = { p1: 6, p2: 6 } }) => {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(active);
  state.players.p2.zones.bench.push(...bench);
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < prizesLeft[playerId]; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: `${playerId}-prize-${i}`, name: 'Prize' }));
    }
  }
  return state;
};

const hitIdsOf = (events) => {
  const attack = events.find((event) => event.type === 'attackExecuted');
  assert.ok(attack, `no attackExecuted in ${events.map((event) => event.type).join(' > ')}`);
  return attackHitIds(events).get(attack).map((hit) => hit.instanceId);
};

test('Kyurem ex Blizzard Burst (BLK 165): the Active and every Benched Pokémon are hits', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Kyurem ex',
    subtypes: ['Basic', 'ex'],
    hp: 230,
    attacks: [
      {
        name: 'Blizzard Burst',
        cost: [],
        damage: '130',
        text: "This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Snorlax', hp: 300 }),
    bench: [pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }), pokemon({ instanceId: 22, name: 'Rattata', hp: 200 })],
    prizesLeft: { p1: 6, p2: 4 },
  });
  const { events, error } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(error, null);
  assert.deepEqual(hitIdsOf(events), [20, 21, 22]);
});

test('Mewtwo ex Photon Bullets (30C 157): only the opponent’s Pokémon ex are hits', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Mewtwo ex',
    subtypes: ['Basic', 'ex'],
    hp: 230,
    attacks: [
      {
        name: 'Photon Bullets',
        cost: [],
        damage: '',
        text: "This attack does 50 damage to each of your opponent's Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Iron Hands ex', subtypes: ['Basic', 'ex'], hp: 230 }),
    bench: [
      pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }),
      pokemon({ instanceId: 22, name: 'Miraidon ex', subtypes: ['Basic', 'ex'], hp: 220 }),
    ],
  });
  const { events, error } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(error, null);
  assert.deepEqual(hitIdsOf(events), [20, 22]);
});

test('Buzzwole-GX Jet Punch (30C 57): the resumed batch’s hit is the chosen Benched Pokémon', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Buzzwole-GX',
    subtypes: ['Basic', 'GX'],
    hp: 190,
    attacks: [
      {
        name: 'Jet Punch',
        cost: [],
        damage: '30',
        text: "This attack does 30 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Snorlax', hp: 300 }),
    bench: [pokemon({ instanceId: 21, name: 'Pidgey', hp: 200 }), pokemon({ instanceId: 22, name: 'Rattata', hp: 200 })],
  });
  const first = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(first.error, null);
  // The pick suspends the attack: the Active's 30 arrives with no attackExecuted, so it plays bare.
  assert.deepEqual(first.events.map((event) => event.type), ['damageUpdated']);
  const choice = first.state.pendingChoice;
  assert.deepEqual(choice.options.map((option) => option.instanceId), [21, 22]);
  const resumed = applyCommand(first.state, {
    type: 'resolveChoice',
    playerId: choice.player,
    payload: { choiceId: choice.choiceId, selection: [22] },
  });
  assert.equal(resumed.error, null);
  assert.deepEqual(hitIdsOf(resumed.events), [22]);
});

// A fake clock driving the real FX queue, impact queue and strike book the way advisory-animations.js
// and combat.js use them: the attack holds until contact, a ripple damage holds 0, a knockout holds
// per knockoutHoldMs. Each plan's land time is recorded.
const playBatch = (events) => {
  let now = 0;
  let seq = 0;
  const timers = [];
  const schedule = (fn, ms) => {
    const timer = { at: now + Math.max(0, ms || 0), seq: seq++, fn };
    timers.push(timer);
    return timer;
  };
  const book = createStrikeBook({ now: () => now, setTimer: schedule });
  const impacts = createImpactQueue({ setTimer: schedule });
  const landed = [];
  const CONTACT_MS = 600;
  const card = (left, top) => ({ left, top, width: 100, height: 140 });
  const rects = { 20: card(500, 300), 21: card(400, 0), 22: card(520, 0), 23: card(640, 0) };
  const run = (plan) => {
    if (plan.kind === 'fx' && plan.effect === 'attack') {
      const layout = layoutHits(plan.hits.map((hit) => ({ id: hit.instanceId, rect: rects[hit.instanceId], amount: hit.dealt, isDefender: hit.instanceId === plan.defenderId })));
      const ctx = { impactType: 'water', hitDelays: hitDelaysOf(layout) };
      book.announce(plan.strike, CONTACT_MS, ctx);
      impacts.strikeIn(CONTACT_MS, ctx);
      return CONTACT_MS + 40;
    }
    if (plan.kind === 'fx' && plan.effect === 'damage') {
      book.afterHit(impacts, plan, (ctx) => landed.push({ what: `hit ${plan.instanceId}`, at: now, ctx }));
      return book.isRipple(plan) ? 0 : 180;
    }
    if (plan.kind === 'knockout') {
      book.afterHit(impacts, plan, () => landed.push({ what: `ko ${plan.instanceId}`, at: now }));
      return knockoutHoldMs({ ripple: book.isRipple(plan), moreKnockouts: Boolean(plan.moreKnockouts), waitMs: book.waitMs(plan), holdMs: 900 });
    }
    if (plan.kind === 'fx' && plan.effect === 'turn-banner') landed.push({ what: 'turn banner', at: now });
    return 0;
  };
  const queue = createFxQueue({ run, schedule, cancel: () => {}, maxQueueMs: 1e9 });
  const leads = attackLeads(events);
  const movedAttacks = new Set(leads.values());
  const hits = attackHitIds(events);
  const strikes = attackStrikes(events);
  const kos = strikeKnockouts(events);
  const push = (event) => {
    const planned = advisoryAnimationPlan(event, 'p1', undefined, {
      hits: hits.get(event) ?? null,
      strike: strikes.get(event) ?? null,
      moreKnockouts: kos.notLast.has(event),
    });
    for (const plan of [planned ?? []].flat()) if (plan.effect !== 'attack-banner') queue.push(plan);
  };
  for (const event of events) {
    if (movedAttacks.has(event) || kos.moved.has(event)) continue;
    if (leads.has(event)) push(leads.get(event));
    push(event);
    for (const knockout of kos.after.get(event) ?? []) push(knockout);
  }
  for (;;) {
    timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const next = timers.shift();
    if (!next) break;
    now = next.at;
    next.fn();
  }
  return landed;
};

test('Kyurem ex Blizzard Burst with Knock Outs: every hit lands on its ripple time with its attack’s context', () => {
  const attacker = pokemon({
    instanceId: 1,
    name: 'Kyurem ex',
    subtypes: ['Basic', 'ex'],
    hp: 230,
    attacks: [
      {
        name: 'Blizzard Burst',
        cost: [],
        damage: '130',
        text: "This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      },
    ],
  });
  const state = board({
    attacker,
    active: pokemon({ instanceId: 20, name: 'Snorlax', hp: 130 }),
    bench: [
      // 10 HP: the engine deals Blizzard Burst's Bench clause as a flat 10 (its Prize scaling is
      // not applied — a separate engine issue); 10 Knocks these two Out either way.
      pokemon({ instanceId: 21, name: 'Pidgey', hp: 10 }),
      pokemon({ instanceId: 22, name: 'Rattata', hp: 200 }),
      pokemon({ instanceId: 23, name: 'Spearow', hp: 10 }),
    ],
    prizesLeft: { p1: 6, p2: 4 },
  });
  const { events, error } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(error, null);
  const order = events.map((event) => `${event.type}${event.instanceId != null ? `:${event.instanceId}` : ''}`);
  assert.ok(order.indexOf('pokemonKnockedOut:20') < order.indexOf('damageUpdated:21'), order.join(' > '));

  const landed = playBatch(events);
  const at = (what) => landed.find((entry) => entry.what === what)?.at;
  // Contact at 600; the Bench ripples out nearest the Active first: 22 (+80), then 21 / 23 (+160, +240).
  assert.equal(at('hit 20'), 640);
  assert.equal(at('hit 22'), 680);
  assert.deepEqual([at('hit 21'), at('hit 23')].sort((a, b) => a - b), [760, 840]);
  assert.ok(landed.filter((entry) => entry.what.startsWith('hit')).every((entry) => entry.ctx?.impactType === 'water'));
  assert.equal(at('ko 20'), at('hit 20'));
  assert.equal(at('ko 21'), at('hit 21'));
  assert.equal(at('ko 23'), at('hit 23'));
  const lastHit = Math.max(at('hit 21'), at('hit 23'));
  assert.ok(at('turn banner') >= lastHit + 900, `turn banner at ${at('turn banner')}, last hit ${lastHit}`);
});
