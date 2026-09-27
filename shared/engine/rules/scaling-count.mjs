/**
 * @file "for each <unit>" / "equal to the number of <unit>" → a board count.
 *
 * The damage parser's scaling chain and the attack coin flipper ("Flip a coin for each …")
 * both need the same count. `countUnit(unit, ctx)` reads one normalized unit phrase against a
 * server-built ctx (buildServerAttackContext) and returns `{ count, label }`, or null for a
 * unit it does not read — the caller then keeps its unresolved note. Units are normalized by
 * `normalizeUnit`: the attacker's own name is "this pokémon" and the Defending Pokémon is
 * "your opponent's active pokémon".
 * Pure.
 */

import { kindsOf } from './attack-conditions.mjs';
import { escapeRegExp } from './attack-text.mjs';

const LETTER_TYPES = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  y: 'fairy',
  n: 'dragon',
  c: 'colorless',
};

const list = (value) => (Array.isArray(value) ? value : []);
const lower = (value) => String(value ?? '').toLowerCase();
const sameType = (a, b) => {
  const x = lower(a) === 'dark' ? 'darkness' : lower(a);
  const y = lower(b) === 'dark' ? 'darkness' : lower(b);
  return x === y;
};

/** The unit text a count reads: its own clause only, own name and Defending Pokémon normalized. */
export function normalizeUnit(unit, selfName = '') {
  let out = lower(unit)
    .replace(/[’‘]/g, "'")
    .replace(/pokemon/g, 'pokémon')
    .split(/\.\s|\.$|;|\(/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  // Only "attached to <name>" / "on <name>" name the attacker itself; elsewhere a name counts
  // cards by name (Spiritomb "for each Spiritomb in your discard pile").
  const name = lower(selfName).trim();
  if (name) {
    out = out.replace(
      new RegExp(`\\b(attached to|on|under) ${escapeRegExp(name)}(?![\\w'])`, 'g'),
      '$1 this pokémon'
    );
  }
  return out
    .replace(/\bthe defending pokémon\b/g, "your opponent's active pokémon")
    .replace(/\byour opponent's active pokémon's\b/g, "your opponent's active pokémon's");
}

function nameIs(actual, wanted) {
  const name = lower(actual);
  const word = lower(wanted).trim();
  if (!name || !word) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word)}(?:$|[^a-z0-9])`).test(name);
}

/** "wishiwashi and wishiwashi-gx" / "omanyte, omastar, kabuto, and kabutops" → names. */
function namesOf(phrase) {
  const names = lower(phrase)
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.some((n) => /\b(pokémon|card|cards|energy|any|each)\b/.test(n))) return null;
  return names;
}

/**
 * A printed Pokémon description → predicate over a `{ name, kinds }` entry. Kinds come from
 * attack-damage-context.mjs ruleBoxKinds. Plural "Pokémon-EX" / "Ultra Beasts" read as singular.
 */
function pokemonMatcher(phrase) {
  const text = lower(phrase)
    .replace(/^(?:an? |any )/, '')
    .replace(/\bpokémon-ex\b/, 'pokémon-ex')
    .trim();
  if (text === 'pokémon') return () => true;
  const parts = text.split(/\s+and\s+/);
  const kindSets = parts.map((part) => kindsOf(part.replace(/s$/, '')) || kindsOf(part));
  if (kindSets.every(Boolean)) {
    const wanted = kindSets.flat();
    return (entry) => wanted.some((kind) => list(entry.kinds).includes(kind));
  }
  const names = namesOf(text);
  return names ? (entry) => names.some((n) => nameIs(entry.name, n)) : null;
}

// ── discard pile ──────────────────────────────────────────────────────────────

/** A printed discard-pile card description → predicate over a ctx discard entry, or null. */
function discardMatcher(phrase) {
  const text = lower(phrase).trim();
  const named = /^supporter cards? that has "(.+?)" in its name$/.exec(text);
  if (named) return (c) => c.trainerKind === 'supporter' && lower(c.name).includes(named[1]);
  if (/^supporter cards?$/.test(text)) return (c) => c.trainerKind === 'supporter';
  if (/^item cards?$/.test(text)) return (c) => c.trainerKind === 'item';
  if (/^pokémon tool cards?$/.test(text)) return (c) => c.trainerKind === 'tool';
  if (/^trainer cards?$/.test(text)) return (c) => c.category === 'trainer';
  const energy = /^(basic )?(?:\{([a-z])\} )?energy(?: cards?)?$/.exec(text);
  if (energy) {
    return (c) =>
      c.category === 'energy' &&
      (!energy[1] || c.basicEnergy) &&
      (!energy[2] || sameType(c.energyType, LETTER_TYPES[energy[2]]));
  }
  if (/^basic pokémon and each evolution card$/.test(text)) return (c) => c.category === 'pokemon';
  const typedMon = /^\{([a-z])\} pokémon$/.exec(text);
  if (typedMon) {
    return (c) => c.category === 'pokemon' && list(c.pokemonTypes).some((t) => sameType(t, LETTER_TYPES[typedMon[1]]));
  }
  if (/^pokémon$/.test(text)) return (c) => c.category === 'pokemon';
  const card = /^(.+?) cards?$/.exec(text);
  const names = namesOf(card ? card[1] : text);
  return names ? (c) => names.some((n) => nameIs(c.name, n)) : null;
}

function discardCount(unit, ctx) {
  const m = /^(.+?) in your (opponent's )?discard pile(?: that has the (.+?) attack)?$/.exec(unit);
  if (!m) return null;
  const matches = discardMatcher(m[1]);
  const pile = m[2] ? ctx.opponentDiscardCards : ctx.ownDiscardCards;
  if (!matches || !Array.isArray(pile)) return null;
  const attack = m[3];
  const count = pile.filter(
    (c) => matches(c) && (!attack || list(c.attackNames).some((a) => lower(a) === attack))
  ).length;
  return { count, label: `${m[1]} in ${m[2] ? "opponent's " : ''}discard pile` };
}

// ── in play ───────────────────────────────────────────────────────────────────

function inPlayCount(unit, ctx) {
  const own = ctx.ownPokemon;
  const opp = ctx.opponentPokemon;
  if (!Array.isArray(own) || !Array.isArray(opp)) return null;
  const count = (entries, phrase, label) => {
    const matches = pokemonMatcher(phrase);
    return matches ? { count: entries.filter(matches).length, label } : null;
  };
  let m;
  if ((m = /^of your opponent's (.+?)(?: in play)?$/.exec(unit))) return count(opp, m[1], `opponent's ${m[1]}`);
  if ((m = /^of your benched (.+)$/.exec(unit))) return count(own.filter((e) => e.bench), m[1], `benched ${m[1]}`);
  if ((m = /^of your (.+?) in play$/.exec(unit))) return count(own, m[1], `your ${m[1]} in play`);
  if ((m = /^(.+?) you have in play that has δ on its card$/.exec(unit))) {
    return { count: own.filter((e) => e.delta).length, label: 'δ Pokémon in play' };
  }
  if ((m = /^(.+?) you have in play$/.exec(unit))) return count(own, m[1], `${m[1]} in play`);
  if ((m = /^(.+?) on your bench$/.exec(unit))) return count(own.filter((e) => e.bench), m[1], `${m[1]} on your Bench`);
  if (/^trainer cards? your opponent has in play$/.test(unit) && typeof ctx.opponentTrainersInPlay === 'number') {
    return { count: ctx.opponentTrainersInPlay, label: "opponent's Trainer cards in play" };
  }
  return null;
}

// ── attached to this Pokémon ──────────────────────────────────────────────────

function attachedCount(unit, ctx) {
  const cards = ctx.attackerAttachedCards;
  if (!Array.isArray(cards)) return null;
  let m;
  if (/^(?:different )?types? of basic energy cards? attached to this pokémon$/.test(unit)) {
    const types = new Set(cards.filter((c) => c.energy && c.basicEnergy).map((c) => lower(c.energyType)));
    return { count: types.size, label: 'types of basic Energy attached' };
  }
  if (/^technical machine cards? attached to this pokémon$/.test(unit)) {
    return { count: cards.filter((c) => /technical machine/i.test(c.name)).length, label: 'Technical Machines attached' };
  }
  if ((m = /^basic energy cards? attached to this pokémon( but not used to pay for this attack's energy cost)?$/.exec(unit))) {
    const basic = cards.filter((c) => c.energy && c.basicEnergy).length;
    const spent = m[1] ? list(ctx.attackCost).length : 0;
    return { count: Math.max(0, basic - spent), label: 'basic Energy attached' };
  }
  if ((m = /^(?:\{([a-z])\} )?energy attached to this pokémon$/.exec(unit)) && Array.isArray(ctx.attackerEnergyUnits)) {
    const type = LETTER_TYPES[m[1]];
    const units = ctx.attackerEnergyUnits.filter(
      (u) => !type || lower(u).split('|').some((part) => sameType(part, type))
    );
    return { count: units.length, label: `${type ? `${type} ` : ''}Energy attached` };
  }
  if ((m = /^(?:\{([a-z])\} )?energy cards? attached to this pokémon$/.exec(unit))) {
    const type = LETTER_TYPES[m[1]];
    return {
      count: cards.filter((c) => c.energy && (!type || sameType(c.energyType, type))).length,
      label: 'Energy cards attached',
    };
  }
  if ((m = /^(.+?) energy cards? attached to this pokémon$/.exec(unit))) {
    const word = m[1];
    return { count: cards.filter((c) => c.energy && lower(c.name).includes(word)).length, label: `${word} Energy attached` };
  }
  return null;
}

// ── both Actives / board-wide Energy ─────────────────────────────────────────

function energyAcrossCount(unit, ctx) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (/^(basic )?energy(?: cards?)? attached to this pokémon and your opponent's active pokémon$/.test(unit)) {
    const basic = /^basic /.test(unit);
    const own = basic ? list(ctx.attackerBasicEnergyTypes).length : num(ctx.energyCount);
    const opp = basic ? num(ctx.defenderBasicEnergyCount) : num(ctx.opponentEnergyCount);
    return own == null || opp == null ? null : { count: own + opp, label: 'Energy on both Active Pokémon' };
  }
  if (/^energy(?: cards?)? attached to your opponent's active pokémon$/.test(unit) && num(ctx.opponentEnergyCount) != null) {
    return { count: ctx.opponentEnergyCount, label: "Energy on the Defending Pokémon" };
  }
  if (/^energy attached to all of your active pokémon$/.test(unit) && num(ctx.energyCount) != null) {
    return { count: ctx.energyCount, label: 'Energy on your Active Pokémon' };
  }
  if (/^energy attached to all pokémon$/.test(unit)) {
    const own = num(ctx.ownEnergyCount);
    const opp = num(ctx.opponentAllEnergyCount);
    return own == null || opp == null ? null : { count: own + opp, label: 'Energy on all Pokémon' };
  }
  if (/^\{c\} energy in your opponent's active pokémon's retreat cost/.test(unit) && num(ctx.retreatCostColorless) != null) {
    return { count: ctx.retreatCostColorless, label: "{C} in the Defending Pokémon's Retreat Cost" };
  }
  return null;
}

// ── damage counters and conditions ───────────────────────────────────────────

function counterCount(unit, ctx) {
  const counters = (damage) => Math.max(0, Math.floor((Number(damage) || 0) / 10));
  let m;
  if (/^damage counters? on this pokémon$/.test(unit) && ctx.attackerDamage != null) {
    return { count: counters(ctx.attackerDamage), label: 'damage counters on this Pokémon' };
  }
  if (/^damage counters? on your opponent's active pokémon$/.test(unit) && ctx.defenderDamage != null) {
    return { count: counters(ctx.defenderDamage), label: "damage counters on the Defending Pokémon" };
  }
  if ((m = /^damage counters? on each of your benched (.+)$/.exec(unit)) && Array.isArray(ctx.ownPokemon)) {
    const matches = pokemonMatcher(m[1]);
    if (!matches) return null;
    const total = ctx.ownPokemon.filter((e) => e.bench && matches(e)).reduce((sum, e) => sum + (e.counters || 0), 0);
    return { count: total, label: `damage counters on your Benched ${m[1]}` };
  }
  if (/^special conditions? affecting this pokémon$/.test(unit)) {
    return { count: list(ctx.attackerConditions).length, label: 'Special Conditions on this Pokémon' };
  }
  if (/^of those special conditions$/.test(unit) && Array.isArray(ctx.defenderConditions)) {
    return { count: ctx.defenderConditions.length, label: 'Special Conditions on the Defending Pokémon' };
  }
  if (/^of those pokémon$/.test(unit) && typeof ctx.damagedOwnPokemonCount === 'number') {
    return { count: ctx.damagedOwnPokemonCount, label: 'your Pokémon with damage counters' };
  }
  return null;
}

// ── what this attack's own before-damage step did ────────────────────────────

function paidCount(unit, ctx) {
  if (/^(?:\{[a-z]\} )?energy(?: cards?)? attached in this way$/.test(unit) && typeof ctx.attachedForDamage === 'number') {
    return { count: ctx.attachedForDamage, label: 'Energy attached in this way' };
  }
  if (/^cards? you discarded$/.test(unit) && typeof ctx.handDiscarded === 'number') {
    return { count: ctx.handDiscarded, label: 'cards you discarded' };
  }
  return null;
}

/**
 * @param {string} unit Unit phrase, normalized by `normalizeUnit`
 * @param {object} ctx Server-built attack ctx
 * @returns {{ count: number, label: string }|null}
 */
export function countUnit(unit, ctx = {}) {
  const text = lower(unit).trim();
  if (!text) return null;
  return (
    paidCount(text, ctx) ??
    discardCount(text, ctx) ??
    attachedCount(text, ctx) ??
    energyAcrossCount(text, ctx) ??
    counterCount(text, ctx) ??
    inPlayCount(text, ctx)
  );
}

/** "You can't add (do) more than 60 damage in this way." → 60, else null. */
export function scalingCap(text) {
  const m = /you can't (?:add|do) more than (\d+) damage in this way/.exec(lower(text));
  return m ? Number(m[1]) : null;
}
