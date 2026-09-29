/**
 * @file Attacks a Pokémon Tool grants to its holder (design 035, slice 7).
 *
 * TM/Cube Items print their attack in the card text ("{F} → Violent Rage : 10× …")
 * rather than in `attacks[]`, so the server reads either source and returns attacks
 * shaped like printed ones, tagged `granted`. Pure: no state, no randomness.
 * Also owns the Technical Machine attach restriction and end-of-turn discard clause.
 */

import { isEnergy, isPokemon } from '../cards.mjs';
import { isExCard } from './card-classify.mjs';

const TYPE_SYMBOLS = {
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
  c: 'Colorless',
};

const ARROW = /[→⇢]/;
// The cost symbols immediately before an arrow ("… discard Fighting Cube 01. {F} →").
const COST_RUN = /((?:\{[A-Za-z]\}\s*)+)$/;
const DAMAGE_SPLIT = /^\s*(.*?)\s*:\s*([0-9]+\s*[+×xX-]?)(?:\s+|$)(.*)$/s;
// Sentence starts that begin an attack's effect text (used when the attack prints no
// damage, so there is no ": <damage>" delimiter to split on).
const EFFECT_STARTERS =
  /(?:^|\s)(The Defending|If |Flip |Devolve |Choose|Before doing damage|This attack|Your opponent|Draw |Put |Search |Each |During |You may|For each|Remove |Attach |Shuffle |Move |Look at|Take |Prevent |Does |Return |Switch |Reveal |Until |Whenever |Once |As long as|When |Then, |You can|Do |Both |At the end|Discard |Knock Out|Heal |Place )/;

function parseCost(prefix) {
  const cost = [];
  for (const m of String(prefix || '').matchAll(/\{([A-Za-z])\}/g)) {
    const name = TYPE_SYMBOLS[m[1].toLowerCase()];
    if (name) cost.push(name);
  }
  return cost;
}

function splitBody(body) {
  const damage = body.match(DAMAGE_SPLIT);
  if (damage) {
    return { name: damage[1].trim(), damage: damage[2].trim(), text: damage[3].trim() };
  }
  const starter = body.match(EFFECT_STARTERS);
  if (starter && starter.index > 0) {
    return {
      name: body.slice(0, starter.index).trim(),
      damage: 0,
      text: body.slice(starter.index).trim(),
    };
  }
  return { name: body.trim(), damage: 0, text: '' };
}

/**
 * The attacks `card` grants when attached to a Pokémon: its `attacks[]` when the
 * card data carries them, otherwise the printed "→" lines in its text.
 *
 * @param {object} card
 * @returns {object[]} attacks tagged `granted` ([] when the card grants none)
 */
export function parseGrantedAttacks(card) {
  if (!card) return [];
  const printed = Array.isArray(card.attacks) ? card.attacks.filter((a) => a?.name) : [];
  if (printed.length > 0) return printed.map((a) => ({ ...a, granted: true }));

  const text = cardTextOf(card);
  const segments = text.split(ARROW);
  if (segments.length < 2) return knownAttacksFor(card);

  const out = [];
  for (let i = 1; i < segments.length; i++) {
    const costPrefix = (segments[i - 1].match(COST_RUN) || [''])[0];
    const body = segments[i].trim();
    if (!body) continue;
    const parsed = splitBody(body);
    if (!parsed.name) continue;
    out.push({ ...parsed, cost: parseCost(costPrefix), granted: true });
  }
  return out;
}

function cardTextOf(card) {
  return [card?.text, card?.effect, card?.cardText].find((v) => typeof v === 'string' && v) || '';
}

const normalizeName = (name) =>
  String(name || '')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .trim();

// TCGdex ships these Technical Machines with an empty `attacks: [{}]` and no "→" line in
// `effect` (dp6-136, dp6-137), so their attacks come from the pkmncards corpus rows
// (out/pkmn-trainer-cards.json, Legends Awakened 136/137). The printed cost is {@}: no Energy.
const KNOWN_TM_ATTACKS = {
  'technical machine ts-1': {
    name: 'Evoluter',
    damage: 0,
    text:
      'Search your deck for a card that evolves from 1 of your Pokémon and put it onto that Pokémon. (This counts as evolving that Pokémon.) Shuffle your deck afterward.',
    cost: [],
  },
  'technical machine ts-2': {
    name: 'Devoluter',
    damage: 0,
    text:
      "Choose 1 of your opponent's Evolved Pokémon (excluding Pokémon LV.X). Remove the highest Stage Evolution card from that Pokémon and put that card back into your opponent's hand.",
    cost: [],
  },
};

function knownAttacksFor(card) {
  const known = KNOWN_TM_ATTACKS[normalizeName(card?.name)];
  return known ? [{ ...known, granted: true }] : [];
}

const normalizeText = (text) => String(text || '').replace(/[‘’]/g, "'").toLowerCase();

/**
 * True when a Pokémon Tool / Technical Machine discards itself at the end of its owner's
 * turn: SV TMs ("If this card is attached to 1 of your Pokémon, discard it at the end of
 * your turn") and older TM/Cube Items ("At the end of your turn, discard <name>").
 * Pokémon and Energy cards never qualify (Special Energy has its own sweep).
 */
export function toolDiscardsAtEndOfTurn(card) {
  if (!card || isPokemon(card) || isEnergy(card)) return false;
  const t = normalizeText(cardTextOf(card));
  return /discard it at the end of your turn|at the end of your turn, discard /.test(t);
}

/**
 * The Pokémon a Technical Machine may be attached to, read from "Attach this card to 1 of
 * your <X> in play" (ex5-84, ex4 Team Magma/Aqua TM 01, pl2-95). Null when unrestricted
 * or when the card prints no such clause (SV TMs attach like any Tool).
 * @returns {{ evolved?: true, excludeEx?: true, excludeOwners?: true, sp?: true,
 *   nameIncludes?: string }|null}
 */
export function parseTmAttachRestriction(text) {
  const t = normalizeText(text);
  const m = t.match(/attach this card to 1 of your (.+?)(?: in play)?\.(?:\s|$)/);
  if (!m) return null;
  const target = m[1];
  const out = {};
  if (/^evolved pok[ée]mon/.test(target)) out.evolved = true;
  if (/excluding pok[ée]mon-ex/.test(target)) out.excludeEx = true;
  if (/pok[ée]mon that has an owner in its name/.test(target)) out.excludeOwners = true;
  if (/^pok[ée]mon sp$/.test(target)) out.sp = true;
  const named = target.match(/^pok[ée]mon that has (.+?) in its name$/);
  if (named) out.nameIncludes = named[1];
  return Object.keys(out).length > 0 ? out : null;
}

// Owner's Pokémon print a possessive trainer name ("Team Magma's Groudon", "Brock's Onix").
const hasOwnerInName = (name) => /'s\s/.test(normalizeText(name));
const isSpPokemon = (card) =>
  (card?.subtypes || []).some((s) => /^sp$/i.test(String(s))) ||
  /\s(?:G|GL|FB|C|E4|4)(?:\s+LV\.?\s*X)?$/.test(String(card?.name ?? ''));

/**
 * Whether a Technical Machine with `restriction` may attach to the Pokémon whose top card is
 * `top`. `evolved` says the stack holds an Evolution; `mayAttachAnyTm` is Xatu Synchronicity
 * (Skyridge 35: "You may attach any Technical Machine to Xatu").
 */
export function tmAttachAllowed(restriction, { top, evolved = false, mayAttachAnyTm = false } = {}) {
  if (!restriction || mayAttachAnyTm) return true;
  if (!top) return false;
  const name = normalizeText(top.name);
  if (restriction.evolved && !evolved) return false;
  if (restriction.excludeEx && isExCard(top)) return false;
  if (restriction.excludeOwners && hasOwnerInName(top.name)) return false;
  if (restriction.sp && !isSpPokemon(top)) return false;
  if (restriction.nameIncludes && !name.includes(restriction.nameIncludes)) return false;
  return true;
}

/** Xatu Synchronicity: the holder's own text lets any Technical Machine attach to it. */
export function mayAttachAnyTechnicalMachine(top) {
  if (!top) return false;
  const texts = [
    ...(Array.isArray(top.abilities) ? top.abilities.map((a) => a?.text || a?.effect) : []),
    top.ability?.text,
    cardTextOf(top),
  ];
  return texts.some((t) => /attach any technical machine to/.test(normalizeText(t)));
}
