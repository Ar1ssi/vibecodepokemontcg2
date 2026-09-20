/**
 * @file Card inspector model (design 013) — pure, DOM-free.
 *
 * Turns a board card plus the current game context into the descriptor the inspector
 * renderer draws: live HP, resolved attack damage, payability, weakness/resistance/retreat,
 * and where the rendered pieces sit over the printed card.
 *
 * Nothing here touches the DOM, so every decision is unit-testable. The renderer in
 * `card-inspector.mjs` only applies the result.
 *
 * Two rules this module owns:
 *
 * 1. Payability is never re-derived. It comes from `listAttacks()`, the same primitive the
 *    engine enforces, so the panel cannot advertise an attack the game would reject.
 * 2. Damage is the RESOLVED number, not the printed label. "30+" with two damage counters
 *    on this Pokémon reads 50, which is what TCG Live shows and what the player will deal.
 */

import {
  listAttacks,
  listAbilities,
} from '../../../../shared/engine/rules/attack-window.mjs';
import { parseAttackDamage } from '../../../../shared/engine/rules/damage-parser.mjs';
import { parseTypeValue } from '../../../../shared/engine/rules/rules-state.mjs';
import {
  isStadiumCard,
  stadiumActivationStatus,
  mergeAttacks,
} from '../../../../shared/engine/rules/stadium-effects.mjs';
import {
  attackZoneBounds,
  abilityZoneBounds,
  stadiumZoneBounds,
} from './attack-zone-geometry.js';

const POKEMON_SUPERTYPES = ['Pokémon', 'Pokemon', ''];

/**
 * Frame-keyed band table. Band positions are FRAME-SPECIFIC — a Tera ex header is ~20% of
 * the card, a classic frame's is not — so one set of numbers cannot serve every card.
 * `default` is conservative; an unmapped frame may let print show through, which is a
 * visible data bug to report, never a crash (013 E16).
 */
export const INSPECTOR_BANDS = {
  default: { footH: 8.5 },
};

export function bandsForFrame(frameKey = 'default') {
  return INSPECTOR_BANDS[frameKey] ?? INSPECTOR_BANDS.default;
}

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Printed damage arrives as either shape depending on the path that resolved it: client
 * enrichment parses it to a number, while the server's `cardStats` contract passes the
 * printed string through unchanged ('30+', ''). Both must render, and the '+' matters —
 * it is the difference between a fixed and a scaling attack.
 */
export function splitDamageLabel(damage) {
  if (damage == null || damage === '') return { base: null, printed: null };
  const printed = String(damage).trim();
  if (!printed) return { base: null, printed: null };
  const n = Number(printed.replace(/[^0-9]/g, ''));
  return { base: Number.isFinite(n) ? n : null, printed };
}

/**
 * Retreat cost reaches the model in three shapes: a symbol array (the server contract —
 * `extractStats` expands an integer into Colorless pips, audit B-6), a bare count (client
 * enrichment, since `parseRetreatCost` discards the printed symbols), or absent.
 *
 * The Colorless fill is not a lie: the printed symbols are thrown away before the model
 * ever sees them, and Colorless is exactly what the engine will charge.
 */
export function normalizeRetreatSymbols(retreatCost) {
  if (Array.isArray(retreatCost)) {
    return retreatCost.filter(Boolean).map(String);
  }
  if (
    isFiniteNumber(retreatCost) ||
    (typeof retreatCost === 'string' && retreatCost.trim())
  ) {
    const n = Number(retreatCost);
    return Number.isFinite(n) && n > 0
      ? new Array(Math.floor(n)).fill('Colorless')
      : [];
  }
  return [];
}

/**
 * The dim rule, stated exactly (013 Design):
 *   ≥1 payable attack   → 'none'  (card stays lit; unpayable panels alone recede)
 *   0 payable, ≥1 attack → 'full'  (the whole card box dims)
 *   no attacks at all    → 'none'  (nothing to fail — see E5)
 */
export function dimLevelFor(attacks = []) {
  if (!attacks.length) return 'none';
  return attacks.some((a) => a.payable) ? 'none' : 'full';
}

const supertypeOf = (card) => String(card?.supertype ?? '').trim();

/**
 * A card the inspector can lay out as a Pokémon. Energy and Trainers are deliberately
 * excluded: they have no HP row, no attack box and no weakness strip, so the chrome would
 * have nothing to cover (E19).
 */
export function isInspectablePokemon(card) {
  if (!card) return false;
  if (card.hp == null || card.hp === '') return false;
  if (!Number.isFinite(Number(card.hp))) return false;
  const supertype = supertypeOf(card);
  if (supertype && !POKEMON_SUPERTYPES.includes(supertype)) return false;
  if (/energy|trainer|item|supporter|stadium/i.test(String(card.type ?? '')))
    return false;
  return (
    Array.isArray(card.attacks) ||
    Array.isArray(card.weaknesses) ||
    card.weakness != null
  );
}

const typesOf = (card) => {
  if (Array.isArray(card?.types) && card.types.length)
    return card.types.map(String);
  if (
    card?.type &&
    !/energy|trainer|item|supporter|stadium/i.test(String(card.type))
  ) {
    return [String(card.type)];
  }
  return [];
};

// Server hydration sets `weakness`/`resistance` (singular) while createCard normalizes
// `weaknesses`/`resistances` (plural, empty unless the card came from a source that filled
// it), so both spellings have to be read or a hydrated card shows an empty tile. Named
// explicitly: the plurals are not `${key}s` ("weakness" pluralises to "weaknesses").
const TYPE_VALUE_PROPS = {
  weakness: ['weakness', 'weaknesses'],
  resistance: ['resistance', 'resistances'],
};

const typeValueOf = (card, key) => {
  for (const prop of TYPE_VALUE_PROPS[key] ?? [key]) {
    const value = card?.[prop];
    if (Array.isArray(value)) {
      if (value.length) return parseTypeValue(value[0]);
    } else if (value && typeof value === 'object') {
      return parseTypeValue(value);
    }
  }
  return null;
};

/**
 * The card's real ability, if it has one. Read from either spelling for the same reason as
 * weakness/resistance: client enrichment sets singular `card.ability`, while server hydration
 * (`reduce.mjs` cardStats) writes a plural `card.abilities` array.
 *
 * TCGdex carries rule-box text — Tera ex, Stellar, "Pokémon Tool" — in that same array, so an
 * entry is only an ability when it is untyped (already narrowed by the hydration filter) or
 * explicitly typed `Ability`. A rule box is printed on the card and is not the player's to use,
 * so it gets no panel.
 */
export function rawAbilityOf(card) {
  const singular = card?.ability;
  if (singular && typeof singular === 'object' && singular.text)
    return singular;
  if (Array.isArray(card?.abilities)) {
    const found = card.abilities.find(
      (a) => a?.text && (!a.type || String(a.type).toLowerCase() === 'ability')
    );
    if (found) return found;
  }
  return null;
}

/**
 * @param {object} card the preview card — a server stamp (`img.card`) or a legacy zone card
 * @param {object} [ctx]
 * @param {Array<string|{type,family}>} [ctx.energyTypes] attached energy
 * @param {object} [ctx.attacker] passed to parseAttackDamage (type/energy-scaled damage)
 * @param {object} [ctx.defender] passed to parseAttackDamage (weakness/resistance on target)
 * @param {object} [ctx.damageCtx] extra parseAttackDamage context (attackerDamage counters, …)
 * @param {boolean} [ctx.rulesEnabled] rules mode off ⇒ no zones, no actions (E18)
 * @param {boolean} [ctx.readOnly] opponent's Pokémon ⇒ inspect only, never dim (E7)
 * @param {Array} [ctx.attackWindow] injectable listAttacks() result, for tests
 * @param {string} [ctx.frameKey] band table key
 */
export function buildInspectorModel(card, ctx = {}) {
  const {
    energyTypes = [],
    attacker = null,
    defender = null,
    damageCtx = {},
    rulesEnabled = true,
    readOnly = false,
    abilityUsed = false,
    zone = 'active',
    attackWindow,
    frameKey = 'default',
  } = ctx;

  const name = String(card?.name ?? '');
  const hp = Number.isFinite(Number(card?.hp)) ? Number(card.hp) : null;

  // A Stadium is not a Pokémon, but it earns the same module: an effect panel over the printed
  // text with a Use affordance when the effect is activatable. The decision is the pure
  // stadiumActivationStatus() the sidebox path's gates mirror, so the panel cannot advertise a
  // use the game would reject.
  if (isStadiumCard(card)) {
    const status = stadiumActivationStatus(card, {
      rulesEnabled,
      yourTurn: ctx.yourTurn ?? true,
      usedThisTurn: Boolean(ctx.stadiumUsed),
      flags: ctx.flags || {},
    });
    return {
      kind: 'stadium',
      name,
      hp,
      text: String(card?.text ?? card?.effect ?? ''),
      actionable: status.actionable,
      usable: status.usable,
      reason: status.reason,
      recede: status.actionable && !status.usable,
      blockTopPct: stadiumZoneBounds().topPct,
      dimLevel: 'none',
      interactive: status.usable,
    };
  }

  if (!isInspectablePokemon(card)) {
    return {
      kind: 'plain',
      name,
      hp,
      ability: null,
      attacks: [],
      blockTopPct: null,
      dimLevel: 'none',
      interactive: false,
    };
  }

  const window =
    attackWindow ??
    listAttacks(card, {
      energyTypes,
      rulesEnabled,
      abilityUsed: Boolean(abilityUsed),
      stadiumCostModifier: Number(ctx.stadiumCostModifier) || 0,
      extraAttacks: ctx.extraAttacks || [],
    });

  // Stadium-granted / inherited attacks render alongside the printed ones; the
  // window indexes line up because both use the same merge order.
  const renderedAttacks = mergeAttacks(
    card.attacks || [],
    ctx.extraAttacks || []
  );

  const byName = new Map(window.map((w) => [w.name, w]));
  const interactive = rulesEnabled && !readOnly;
  // A benched Pokémon cannot attack, so its panels are inert — but they are NOT receded and the
  // card does NOT dim. Greying them or dimming the card would report an energy problem that does
  // not exist; the reason is positional, and it says so.
  const attackable = interactive && zone === 'active';

  const attacks = renderedAttacks.map((raw, i) => {
    const { base, printed } = splitDamageLabel(raw?.damage);
    const entry = window[i] ?? byName.get(raw?.name) ?? null;
    const payable = entry ? Boolean(entry.payable) : true;
    const onceUsed = entry ? Boolean(entry.onceUsed) : false;

    // Resolved through the real parser; falls back to the printed label whenever the
    // engine reports the value unresolved, so a text-driven attack never shows blank.
    const parsed = parseAttackDamage(
      { ...(raw || {}), damage: base },
      attacker || {},
      defender || {},
      damageCtx
    );
    const resolved =
      parsed?.resolved && isFiniteNumber(parsed.total) ? parsed.total : null;
    const damageLabel = resolved != null ? resolved : (base ?? printed);

    const cost = Array.isArray(entry?.cost)
      ? entry.cost
      : Array.isArray(raw?.cost)
        ? raw.cost
        : [];
    return {
      index: i,
      name: String(raw?.name ?? entry?.name ?? `Attack ${i + 1}`),
      cost: cost.map(String),
      text: String(raw?.text ?? raw?.effect ?? ''),
      damageLabel: damageLabel == null ? null : damageLabel,
      printedLabel: printed,
      payable,
      onceUsed,
      reason:
        // `||` not `??`: listAttacks returns '' when there is nothing to explain, and an empty
        // tooltip is worse than no tooltip.
        entry?.reason ||
        (zone === 'bench' ? 'A benched Pokémon cannot attack.' : null),
      // The renderer wires clicks off `usable` alone, so every gate lives here rather than being
      // re-derived in the DOM layer.
      usable: attackable && payable && !onceUsed,
      recede: attackable && (onceUsed || !payable),
    };
  });

  // Usability comes from the shipping primitive, so the once-per-turn wording the engine enforces
  // — and the spot the card occupies — are what the panel shows. Fed a normalised singular so both
  // spellings work.
  const rawAbility = rawAbilityOf(card);
  const abilityInfo = rawAbility
    ? (listAbilities(
        { ability: rawAbility },
        { abilityUsed, rulesEnabled, zone }
      )[0] ?? null)
    : null;
  const ability = abilityInfo
    ? {
        name: abilityInfo.name,
        text: String(rawAbility.text ?? ''),
        usable: Boolean(abilityInfo.usable) && interactive,
        reason: abilityInfo.reason ?? null,
        recede: interactive && !abilityInfo.usable,
      }
    : null;

  const abilityCount = ability ? 1 : 0;
  // attackZoneBounds returns null for a card with no attacks (E1/E5), so the band has to
  // be defaulted rather than read off the result.
  const bounds = attackZoneBounds({
    attackCount: attacks.length,
    index: 0,
    abilityCount,
  });
  const abilityBounds = abilityZoneBounds({ abilityCount });

  return {
    kind: 'pokemon',
    name,
    hp,
    types: typesOf(card),
    type: typesOf(card)[0] ?? null,
    damage: Number.isFinite(Number(card?.damage)) ? Number(card.damage) : 0,
    evolvesFrom:
      typeof card?.evolvesFrom === 'string' ? card.evolvesFrom : null,
    stage: card?.stage != null ? String(card.stage) : null,
    ability,
    attacks,
    weakness: typeValueOf(card, 'weakness'),
    resistance: typeValueOf(card, 'resistance'),
    retreat: normalizeRetreatSymbols(card?.retreatCost),
    // Where the rendered stack starts: the ability band when there is an ability, since that
    // text prints above the attacks, otherwise the attack band. `bandTopPct` stays the attack
    // band alone for anything laying out attacks specifically.
    blockTopPct: abilityBounds?.topPct ?? bounds?.topPct ?? null,
    bandTopPct: bounds?.topPct ?? null,
    bandHeightPct: bounds?.heightPct ?? null,
    footH: bandsForFrame(frameKey).footH,
    dimLevel: readOnly || zone === 'bench' ? 'none' : dimLevelFor(attacks),
    interactive,
    attackable,
    zone,
    readOnly,
  };
}
