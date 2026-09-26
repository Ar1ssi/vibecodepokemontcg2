// Behavioural oracle for attacks and abilities (promoted from the S265 scratch audit, I113).
// Runs each printed attack / ability through the authoritative engine in a fixed rich board over
// several seeds (auto-resolving choices), diffs the state, and records what changed plus the
// damage the attack dealt. The gate (oracle-gate.mjs) decides whether that counts as executed.
import { splitCard } from './split-card-text.mjs';
import { parseAbility } from '../../shared/engine/rules/abilities.mjs';
import { isHandActivatedAbility } from '../../shared/engine/rules/ability-executors.mjs';
import { classifyAbility } from '../../shared/engine/rules/ability-effects.mjs';
import { classifyAttackEffect } from '../../shared/engine/rules/attack-effects.mjs';
import {
  createGameState,
  createPlayerZones,
} from '../../shared/engine/state.mjs';
import { createCard } from '../../shared/engine/cards.mjs';
import { createRng } from '../../shared/engine/rng.mjs';
import { applyCommand } from '../../shared/engine/reduce.mjs';

export const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MAX_CHOICES = 12;
const ALL_TYPES = [
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
const ZONES = [
  'deck',
  'hand',
  'discard',
  'prizes',
  'active',
  'bench',
  'lostZone',
];

// Instance ids restart at 1 for every board so runs are reproducible card for card.
let nextId = 1;
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
const trainer = (name, subtype) =>
  mk({ name, supertype: 'Trainer', subtypes: [subtype], type: subtype });
const tool = (name, attachedTo = null) =>
  mk({
    name,
    supertype: 'Trainer',
    subtypes: ['Pokémon Tool'],
    type: 'Pokémon Tool',
    attachedTo,
  });

/** A Basic Pokémon of every type, so type-gated effects find a match. */
export const mon = (name, extra = {}) =>
  mk({
    name,
    supertype: 'Pokémon',
    stage: 'Basic',
    subtypes: ['Basic'],
    types: ALL_TYPES,
    hp: 120,
    ...extra,
  });

function deckFor(pfx) {
  const out = [];
  const types = [
    'Fire',
    'Water',
    'Grass',
    'Lightning',
    'Psychic',
    'Fighting',
    'Darkness',
    'Metal',
  ];
  for (const t of types) out.push(energy(t));
  for (let i = 0; i < 4; i++)
    out.push(mon(`${pfx}Basic${i}`, { types: [types[i]] }));
  out.push(
    mon(`${pfx}Evo`, {
      stage: 'Stage 1',
      subtypes: ['Stage 1'],
      evolvesFrom: `${pfx}Basic0`,
    })
  );
  out.push(
    trainer('Potion', 'Item'),
    trainer('Great Ball', 'Item'),
    trainer('Professor', 'Supporter'),
    tool('Tool Card')
  );
  out.push(energy('Fire'), energy('Water'), energy('Lightning'));
  return out;
}

/**
 * Turn 5, p1 to act. Each side: damaged Active with 8 Energy + a Tool, 3 damaged Benched Pokémon
 * with 1 Energy each, a stocked deck, hand, discard and 6 Prizes. `holder()` builds the card under
 * test and is placed as p1's Active or first Benched Pokémon.
 */
export function buildState(holder, holderZone) {
  nextId = 1;
  const state = createGameState({
    gameId: 'oracle',
    seed: 7,
    rulesEnabled: false,
  });
  state.players.p1 = {
    playerId: 'p1',
    username: 'A',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.players.p2 = {
    playerId: 'p2',
    username: 'B',
    zones: createPlayerZones(),
    flags: { abilitiesUsed: {} },
  };
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  for (const pid of ['p1', 'p2']) {
    const z = state.players[pid].zones;
    const own = pid === 'p1';
    const active =
      own && holderZone === 'active'
        ? holder()
        : mon(
            `${pid}Active`,
            own ? { hp: 200 } : { hp: 300, types: ['Water'] }
          );
    active.damage = 30;
    z.active.push(active);
    z.active.push(
      ...[
        'Fire',
        'Water',
        'Lightning',
        'Psychic',
        'Darkness',
        'Metal',
        'Grass',
        'Fighting',
      ].map((t) => energy(t, active.instanceId))
    );
    z.active.push(tool('Held Tool', active.instanceId));
    for (let b = 0; b < 3; b++) {
      const benched =
        own && holderZone === 'bench' && b === 0
          ? holder()
          : mon(
              `${pid}Bench${b}`,
              own ? {} : { types: [['Fire', 'Water', 'Grass'][b]] }
            );
      benched.damage = 20;
      z.bench.push(benched);
      z.bench.push(energy('Grass', benched.instanceId));
    }
    z.deck.push(...deckFor(pid));
    z.hand.push(
      energy('Fire'),
      trainer('Hand Item', 'Item'),
      mon(`${pid}HandMon`),
      trainer('Hand Sup', 'Supporter'),
      mon(`${pid}HandEvo`, {
        stage: 'Stage 1',
        subtypes: ['Stage 1'],
        evolvesFrom: `${pid}Active`,
      })
    );
    z.discard.push(
      ...ALL_TYPES.slice(0, 10).map((t) => energy(t)),
      energy('Fire'),
      energy('Lightning'),
      energy('Psychic'),
      mon(`${pid}DiscMon`),
      trainer('Disc Item', 'Item'),
      trainer('Disc Sup', 'Supporter'),
      tool('Disc Tool')
    );
    for (let i = 0; i < 6; i++) z.prizes.push(mon(`${pid}Prize${i}`));
    // A hand-activated Ability (Luxray Swelling Flash) is used from the hand.
    if (own && holderZone === 'hand') z.hand.unshift(holder());
  }
  return state;
}

/** Total damage on one player's cards in a snapshot. */
function damageTotal(snap, pid) {
  let total = 0;
  for (const [, c] of snap.cards) if (c.pid === pid) total += c.damage || 0;
  return total;
}

/** Per-card position and markers, keyed by instanceId, plus both Active ids and the winner. */
export function snapshot(state) {
  const cards = new Map();
  for (const pid of ['p1', 'p2']) {
    const z = state.players[pid]?.zones || {};
    for (const zone of ZONES) {
      for (const c of z[zone] || []) {
        cards.set(c.instanceId, {
          pid,
          zone: c.attachedTo != null ? 'attached' : zone,
          attachedTo: c.attachedTo ?? null,
          damage: c.damage || 0,
          cond: JSON.stringify([
            c.specialCondition,
            c.asleep,
            c.paralyzed,
            c.confused,
            c.poisoned,
            c.burned,
            c.conditions,
          ]),
          locks: JSON.stringify([
            c.cannotAttackUntilTurn,
            c.cannotRetreatUntilTurn,
            c.cannotAttackAttackName,
          ]),
        });
      }
    }
  }
  const activeId = (pid) =>
    state.players[pid]?.zones?.active?.find((c) => c.attachedTo == null)
      ?.instanceId;
  return {
    cards,
    activeIds: [activeId('p1'), activeId('p2')],
    deckOrders: ['p1', 'p2'].map((pid) =>
      (state.players[pid]?.zones?.deck || []).map((c) => c.instanceId).join(',')
    ),
    winner: state.winner,
  };
}

/** Tags naming each observed change, from p1's point of view ('own' = p1, 'opp' = p2). */
export function diffTags(before, after, events) {
  const tags = new Set();
  const role = (pid) => (pid === 'p1' ? 'own' : 'opp');
  for (const [id, a] of after.cards) {
    const b = before.cards.get(id);
    if (!b) {
      tags.add(`${role(a.pid)}:new->${a.zone}`);
      continue;
    }
    if (b.pid !== a.pid) tags.add('owner-change');
    if (b.zone !== a.zone) tags.add(`${role(a.pid)}:${b.zone}->${a.zone}`);
    else if (b.zone === 'attached' && b.attachedTo !== a.attachedTo)
      tags.add(`${role(a.pid)}:attached-move`);
    if (a.damage > b.damage) tags.add(`${role(a.pid)}:${b.zone}+dmg`);
    if (a.damage < b.damage) tags.add(`${role(a.pid)}:heal`);
    if (a.cond !== b.cond) tags.add(`${role(a.pid)}:status`);
    if (a.locks !== b.locks) tags.add(`${role(a.pid)}:lock`);
  }
  for (const [id, b] of before.cards)
    if (!after.cards.has(id)) tags.add(`${role(b.pid)}:${b.zone}->gone`);
  if (before.activeIds[0] !== after.activeIds[0])
    tags.add('own:active-changed');
  if (before.activeIds[1] !== after.activeIds[1])
    tags.add('opp:active-changed');
  for (const e of events) {
    if (/coin|flip/i.test(e.type)) tags.add('coin');
    if (/shuffle/i.test(e.type)) tags.add('shuffle');
    // A hand reveal changes no zone but is the whole effect of "reveal their hand" cards.
    // Only cards still in the opponent's hand count: a search's own reveal proves nothing.
    if (
      e.type === 'cardsRevealed' &&
      e.playerId === 'p2' &&
      (e.cards || []).length > 0 &&
      e.cards.every((c) => after.cards.get(c.instanceId)?.zone === 'hand')
    ) {
      tags.add('opp:hand-revealed');
    }
    if (/knock|KO/i.test(e.type)) tags.add('ko');
    if (e.type === 'effectStepSkipped') tags.add(`skipped:${e.reason}`);
    if (e.type === 'abilityUsed') tags.add('ability-used');
    // A turn-scoped damage boost lives on the turn flags, not on any card.
    if (e.type === 'turnDamageBonus') tags.add(`${role(e.playerId)}:turn-bonus`);
  }
  // A top-to-bottom move (Aipom Scampering Tail) changes only the deck's order; a shuffle is
  // already tagged by its event.
  ['p1', 'p2'].forEach((pid, i) => {
    const shuffled = events.some((e) => /shuffle/i.test(e.type) && e.playerId === pid);
    const [was, now] = [before.deckOrders?.[i] ?? '', after.deckOrders?.[i] ?? ''];
    const sameCards = was.split(',').sort().join(',') === now.split(',').sort().join(',');
    if (!shuffled && sameCards && was !== now) {
      tags.add(`${role(pid)}:deck-reordered`);
    }
  });
  if (after.winner && !before.winner) tags.add('game-won');
  return tags;
}

const DECLINE = /don't|no\b|decline|skip/i;

/** Picks up to 3 options (at least `min`), preferring anything that is not a decline. */
export function pickSelection(pc) {
  const opts = pc.options || [];
  const want = Math.max(pc.min || 0, Math.min(pc.max ?? 1, opts.length, 3));
  const sorted = [...opts].sort(
    (x, y) => (DECLINE.test(x.name) ? 1 : 0) - (DECLINE.test(y.name) ? 1 : 0)
  );
  return sorted.slice(0, want).map((o) => o.instanceId);
}

/** Leading number of a printed damage ("30", "30×", "10+", "50-"); 0 when blank. */
export function printedBase(damageText) {
  const m = String(damageText ?? '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/**
 * Applies one command, auto-resolving up to MAX_CHOICES pending choices.
 * Returns `{ tags, eventTypes, dealt }` (dealt = attackExecuted damage, null when none fired)
 * or `{ error }` when the engine throws or rejects the command.
 */
export function runOnce(buildCmd, holder, holderZone, seed) {
  let state = buildState(holder, holderZone);
  const before = snapshot(state);
  const events = [];
  let res;
  try {
    res = applyCommand(state, buildCmd(state), createRng(seed));
    for (
      let n = 0;
      res && !res.error && res.state?.pendingChoice && n < MAX_CHOICES;
      n++
    ) {
      events.push(...(res.events || []));
      state = res.state;
      const pc = state.pendingChoice;
      const payload = { choiceId: pc.choiceId, selection: pickSelection(pc) };
      res = applyCommand(
        state,
        { type: 'resolveChoice', playerId: pc.player, payload },
        createRng(seed + 100)
      );
    }
  } catch (e) {
    return { error: `THROW ${e.message}` };
  }
  if (!res || res.error)
    return {
      error: `${res?.error || 'no-result'}${res?.reason ? ` ${res.reason}` : ''}`,
    };
  events.push(...(res.events || []));
  const executed = events.filter((e) => e.type === 'attackExecuted').pop();
  const after = snapshot(res.state);
  return {
    tags: diffTags(before, after, events),
    eventTypes: events.map((e) => e.type),
    dealt: executed ? executed.damage || 0 : null,
    // Damage on the opponent apart from `attackExecuted` (choose-target snipes, counter
    // placement): a zero-base attack's whole effect otherwise hides behind base tags.
    oppDamageDelta: damageTotal(after, 'p2') - damageTotal(before, 'p2'),
  };
}

/** Unions runOnce over the seeds; `dealt`/`deltas` keep one entry per successful seed. */
export function runAll(buildCmd, holder, holderZone, seeds = DEFAULT_SEEDS) {
  const tags = new Set();
  const errors = new Set();
  const eventTypes = new Set();
  const dealt = [];
  const deltas = [];
  for (const seed of seeds) {
    const r = runOnce(buildCmd, holder, holderZone, seed);
    if (r.error) {
      errors.add(r.error);
      continue;
    }
    for (const t of r.tags) tags.add(t);
    for (const t of r.eventTypes) eventTypes.add(t);
    dealt.push(r.dealt);
    deltas.push(r.oppDamageDelta);
  }
  return {
    tags: [...tags].sort(),
    errors: [...errors],
    eventTypes: [...eventTypes].sort(),
    dealt,
    deltas,
  };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * One row per printed attack / ability in the corpus (pkmncards shape, see split-card-text.mjs).
 * `kinds` limits the rows to 'attack' and/or 'ability' (the ability-behaviour audit runs only
 * abilities).
 */
export function oracleCorpus(
  corpus,
  { seeds = DEFAULT_SEEDS, onCard, kinds = ['attack', 'ability'] } = {}
) {
  const rows = [];
  for (const card of corpus) {
    onCard?.(card);
    const { items } = splitCard(card);
    const attacks = items
      .filter((i) => i.kind === 'attack')
      .map((a) => ({
        name: a.name,
        cost: a.cost,
        damage: a.damageText || '',
        text: a.text,
      }));
    const abilities = items
      .filter((i) => i.kind === 'ability')
      .map((a) => ({ name: a.name, type: a.abilityType, text: a.text }));
    const holder = () => mon(card.name, { hp: 200, attacks, abilities });
    const where = { card: card.name, set: card.set, number: card.number };
    let attackIndex = 0;
    for (const entry of items) {
      if (entry.kind === 'attack') {
        const idx = attackIndex++;
        if (!kinds.includes('attack')) continue;
        const attackCmd = () => ({
          type: 'attack',
          playerId: 'p1',
          payload: { attackIndex: idx },
        });
        rows.push({
          kind: 'attack',
          ...where,
          name: entry.name,
          text: entry.text,
          family: safe(() => classifyAttackEffect(attacks[idx]), 'ERR'),
          printedBase: printedBase(attacks[idx].damage),
          ...runAll(attackCmd, holder, 'active', seeds),
        });
        continue;
      }
      if (!kinds.includes('ability')) continue;
      const aIdx = abilities.findIndex((a) => a.name === entry.name);
      const useFrom = (zone) => (state) => ({
        type: 'useAbility',
        playerId: 'p1',
        payload: {
          instanceId: state.players.p1.zones[zone][0].instanceId,
          abilityIndex: aIdx,
        },
      });
      // The ability is used from wherever it is legal: the hand for a hand-activated one,
      // else the Active Spot and the Bench.
      const fromHand = isHandActivatedAbility({ abilities: [abilities[aIdx]] });
      const fromActive = runAll(useFrom(fromHand ? 'hand' : 'active'), holder, fromHand ? 'hand' : 'active', seeds);
      const fromBench = fromHand
        ? { tags: [], errors: [], eventTypes: [] }
        : runAll(useFrom('bench'), holder, 'bench', seeds);
      rows.push({
        kind: 'ability',
        ...where,
        name: entry.name,
        abilityType: entry.abilityType,
        text: entry.text,
        family: safe(
          () =>
            classifyAbility({ name: card.name, abilities: [abilities[aIdx]] }),
          'ERR'
        ),
        stepTypes: safe(
          () => (parseAbility(entry.text) || []).map((s) => s.type),
          []
        ),
        tags: [...new Set([...fromActive.tags, ...fromBench.tags])].sort(),
        errors: [...new Set([...fromActive.errors, ...fromBench.errors])],
        eventTypes: [
          ...new Set([...fromActive.eventTypes, ...fromBench.eventTypes]),
        ].sort(),
      });
    }
  }
  return rows;
}
