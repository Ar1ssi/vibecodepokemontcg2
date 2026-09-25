// Rich-board attack harness (design 036 slice 16, promoted from the S279 scratch probe): the
// oracle-harness board with rules on, every Basic Energy type in hand, a stocked deck/hand/
// discard, and a cost pool that makes any printed attack cost payable. Auto-resolves choices.
// Used by scripts/lib/attack-behaviour.mjs (the `pnpm audit:attacks` gate).
import {
  buildState,
  snapshot,
  diffTags,
  pickSelection,
  DEFAULT_SEEDS,
} from './oracle-harness.mjs';
import { createCard } from '../../shared/engine/cards.mjs';
import { createRng } from '../../shared/engine/rng.mjs';
import { applyCommand } from '../../shared/engine/reduce.mjs';

const MAX_CHOICES = 80;
const TYPES = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Dragon',
  'Fairy',
  'Colorless',
];

let nextId = 90000;
const mk = (props) => createCard({ instanceId: nextId++, ...props });
const energy = (t, attachedTo = null) =>
  mk({
    name: `Basic ${t} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: t,
    type: 'Energy',
    attachedTo,
  });
const mon = (name, extra = {}) =>
  mk({
    name,
    supertype: 'Pokémon',
    type: 'Pokémon',
    stage: 'Basic',
    subtypes: ['Basic'],
    types: ['Colorless'],
    hp: 60,
    ...extra,
  });
const trainer = (name, subtype) =>
  mk({ name, supertype: 'Trainer', subtypes: [subtype], type: subtype });

// Cost symbols already present on the stock buildState active.
const STOCK = {
  Fire: 1,
  Water: 1,
  Lightning: 1,
  Psychic: 1,
  Darkness: 1,
  Metal: 1,
  Grass: 1,
  Fighting: 1,
};

function enrich(state, costPool, opts = {}) {
  const z = state.players.p1.zones;
  // Three of every Basic type so hand-discard costs ("discard 2 {L} Energy from your hand")
  // are payable as well.
  for (const t of TYPES) for (let i = 0; i < 3; i++) z.hand.push(energy(t));
  z.hand.push(
    mk({ name: 'Filler Tool', supertype: 'Trainer', subtypes: ['Pokémon Tool'], type: 'Pokémon Tool' }),
    mon('Hand Basic', { hp: 70 }),
    mon('Hand Evo', { stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'p1Active' })
  );
  z.deck.push(
    mon('Deck Colorless Small', { types: ['Colorless'], hp: 90 }),
    mon('Deck Lightning Basic', { types: ['Lightning'], hp: 70 }),
    mon('Deck Lightning Basic 2', { types: ['Lightning'], hp: 60 }),
    mon('Deck Metal Evo', {
      types: ['Metal'],
      stage: 'Stage 1',
      subtypes: ['Stage 1'],
      evolvesFrom: 'Deck Metal Basic',
      hp: 100,
    }),
    mon('Deck Metal Basic', { types: ['Metal'], hp: 70 }),
    mon('Deck Psychic Evo', {
      types: ['Psychic'],
      stage: 'Stage 1',
      subtypes: ['Stage 1'],
      evolvesFrom: 'Deck Psychic Basic',
      hp: 90,
    }),
    mon('Deck Water Basic', { types: ['Water'], hp: 70 }),
    mon('Deck Grass Basic', { types: ['Grass'], hp: 70 }),
    mon('Deck Fire Basic', { types: ['Fire'], hp: 70 }),
    mon('Deck Fighting Basic', { types: ['Fighting'], hp: 70 }),
    mon('Deck Darkness Basic', { types: ['Darkness'], hp: 70 }),
    mon('Deck Stage2', { stage: 'Stage 2', subtypes: ['Stage 2'], hp: 140 }),
    energy('Fire'),
    energy('Water'),
    energy('Grass'),
    energy('Lightning'),
    energy('Psychic'),
    energy('Fighting'),
    energy('Darkness'),
    energy('Metal'),
    trainer('Deck Item', 'Item'),
    trainer('Deck Supporter', 'Supporter')
  );
  z.discard.push(
    ...TYPES.map((t) => energy(t)),
    mon('Discard Small Basic', { hp: 60 }),
    mon('Discard Small Basic 2', { hp: 50 }),
    mon('Discard Water Basic', { types: ['Water'], hp: 60 }),
    mon('Discard Lightning Basic', { types: ['Lightning'], hp: 60 }),
    trainer('Discard Supporter', 'Supporter'),
    trainer('Discard Item', 'Item'),
    mk({ name: 'Discard Tool', supertype: 'Trainer', subtypes: ['Pokémon Tool'], type: 'Pokémon Tool' })
  );
  // Cost pool: attach just enough extra Energy that every printed cost symbol of this card
  // is payable (double-colored costs otherwise fail on the stock single-of-each board).
  const active = z.active.find((c) => !c.attachedTo);
  if (active && costPool) {
    for (const [sym, want] of Object.entries(costPool)) {
      const have = STOCK[sym] || 0;
      for (let i = have; i < want; i++) z.active.push(energy(sym, active.instanceId));
    }
  }
  for (const c of [...z.active, ...z.bench]) {
    if (!c.attachedTo) {
      c.enteredPlayTurn = state.turn.number;
      c.playedToBenchTurn = state.turn.number;
    }
  }
  // Every type on the opposing Active, so type-conditional bonuses ("if the Defending
  // Pokémon is {R}") have a chance to fire instead of failing on a Water-only stub.
  const oppActive = state.players.p2.zones.active.find((c) => !c.attachedTo);
  if (oppActive) {
    oppActive.types = [...TYPES];
    // A real Retreat Cost so "{C} in the Retreat Cost"-scaling attacks have data.
    // createCard defaults retreatCost to [], so set it unconditionally.
    oppActive.retreatCost = 2;
  }
  // A plain attack on every opposing Pokémon so copy-attack clauses ("use it as this
  // attack") have something to copy.
  for (const c of [...state.players.p2.zones.active, ...state.players.p2.zones.bench]) {
    if (!c.attachedTo) c.attacks = [{ name: 'Dummy Strike', cost: [], damage: '10', text: '' }];
  }
  // Targeted-scenario knobs (the targeted scenarios live in the audit's unit tests):
  // low-HP defender, small attacker hand, attacker already damaged, evolved defender.
  if (opts.oppHp != null) {
    const opp = state.players.p2.zones.active.find((c) => !c.attachedTo);
    if (opp) opp.hp = opts.oppHp;
  }
  if (opts.attackerDamage != null) {
    const atk = state.players.p1.zones.active.find((c) => !c.attachedTo);
    if (atk) atk.damage = opts.attackerDamage;
  }
  if (opts.smallHand) {
    z.hand.length = 0;
    z.hand.push(energy('Fire'));
  }
  if (opts.handSize != null) {
    while (z.hand.length > opts.handSize) z.hand.pop();
    while (z.hand.length < opts.handSize) z.hand.push(energy('Fire'));
  }
  if (opts.oppEvolved) {
    const opp = state.players.p2.zones.active.find((c) => !c.attachedTo);
    if (opp) {
      z.oppEvoPlaceholder = true;
      const evo = mon('Defender Evo', {
        stage: 'Stage 1',
        subtypes: ['Stage 1'],
        evolvesFrom: opp.name,
        hp: 150,
      });
      evo.attachedTo = opp.instanceId;
      state.players.p2.zones.active.push(evo);
    }
  }
  if (opts.oppStatus) {
    const opp = state.players.p2.zones.active.find((c) => !c.attachedTo);
    if (opp) opp.specialCondition = opts.oppStatus;
  }
}

export function runAttackOnce(holder, attackIndex, seed, costPool, opts = {}) {
  nextId = 90000;
  const state = buildState(holder, 'active');
  state.rulesEnabled = true;
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  enrich(state, costPool, opts);
  const before = snapshot(state);
  const events = [];
  const choices = [];
  let res;
  try {
    res = applyCommand(
      state,
      { type: 'attack', playerId: 'p1', payload: { attackIndex } },
      createRng(seed)
    );
    for (
      let n = 0;
      res && !res.error && res.state?.pendingChoice && n < MAX_CHOICES;
      n++
    ) {
      events.push(...(res.events || []));
      const pc = res.state.pendingChoice;
      choices.push({
        prompt: String(pc.prompt || '').slice(0, 120),
        min: pc.min,
        max: pc.max,
        options: (pc.options || []).map((o) => String(o.name || '').slice(0, 40)).slice(0, 8),
      });
      res = applyCommand(
        res.state,
        {
          type: 'resolveChoice',
          playerId: pc.player,
          payload: { choiceId: pc.choiceId, selection: pickSelection(pc) },
        },
        createRng(seed + 100)
      );
    }
  } catch (e) {
    return { error: `THROW ${e.message}` };
  }
  if (!res || res.error)
    return { error: `${res?.error || 'no-result'}${res?.reason ? ` ${res.reason}` : ''}` };
  events.push(...(res.events || []));
  const executed = events.filter((e) => e.type === 'attackExecuted').pop();
  const scaled = events.filter((e) => e.type === 'attackDamageScaled');
  // The turn-start draw (the p2 `cardsDrawn` immediately before `turnStarted`) is turn
  // setup, not the attack's effect — keep it out of the evidence so a no-op attack is visible.
  const turnIdx = events.findIndex((e) => e.type === 'turnStarted');
  const setupDrawIdx =
    turnIdx > 0 &&
    events[turnIdx - 1].type === 'cardsDrawn' &&
    events[turnIdx - 1].playerId === 'p2'
      ? turnIdx - 1
      : -1;
  const preTurn = events.filter(
    (e, i) => (turnIdx < 0 || i < turnIdx) && i !== setupDrawIdx
  );
  const oppDrew = preTurn.some((e) => e.type === 'cardsDrawn' && e.playerId === 'p2');
  const prizeEvents = events
    .filter((e) =>
      ['prizesTaken', 'prizeEntitlementGranted', 'prizeChoiceRequested', 'prizeHandSwapped'].includes(
        e.type
      )
    )
    .map((e) => ({ type: e.type, playerId: e.playerId, count: e.count }));
  return {
    tags: diffTags(before, snapshot(res.state), events),
    eventTypes: events.map((e) => e.type),
    preTurnEvents: preTurn.map((e) => e.type),
    oppDrew,
    dealt: executed ? executed.damage || 0 : null,
    executedName: executed?.attackName || null,
    choices,
    skipped: events.filter((e) => e.type === 'effectStepSkipped').map((e) => e.reason),
    scaled: scaled.map((e) => ({ base: e.base, total: e.total, notes: e.notes })),
    prizeEvents,
  };
}

export function runAttackRich(holder, attackIndex, { seeds = DEFAULT_SEEDS, costPool, opts } = {}) {
  const tags = new Set();
  const errors = new Set();
  const eventTypes = new Set();
  const preTurnEvents = new Set();
  const dealt = [];
  const choices = [];
  const skipped = new Set();
  const scaled = [];
  let oppDrew = false;
  const prizeEvents = [];
  for (const seed of seeds) {
    const r = runAttackOnce(holder, attackIndex, seed, costPool, opts);
    if (r.error) {
      errors.add(r.error);
      continue;
    }
    for (const t of r.tags) tags.add(t);
    for (const t of r.eventTypes) eventTypes.add(t);
    for (const t of r.preTurnEvents) preTurnEvents.add(t);
    for (const c of r.choices) choices.push(c);
    for (const s of r.skipped) skipped.add(s);
    for (const s of r.scaled) scaled.push(s);
    dealt.push(r.dealt);
    oppDrew = oppDrew || r.oppDrew;
    for (const e of r.prizeEvents || []) prizeEvents.push(e);
  }
  return {
    prizeEvents,
    tags: [...tags].sort(),
    errors: [...errors],
    eventTypes: [...eventTypes].sort(),
    preTurnEvents: [...preTurnEvents].sort(),
    oppDrew,
    dealt,
    choices,
    skipped: [...skipped].sort(),
    scaled,
  };
}
