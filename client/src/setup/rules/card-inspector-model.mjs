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
  statusAttackBlock,
} from '../../../../shared/engine/rules/attack-window.mjs';
import { parseAttackDamage } from '../../../../shared/engine/rules/damage-parser.mjs';
import { parseTypeValue } from '../../../../shared/engine/rules/rules-state.mjs';
import {
  isStadiumCard,
  stadiumActivationStatus,
  mergeAttacks,
} from '../../../../shared/engine/rules/stadium-effects.mjs';
import { resolveTcgdexSetId } from '../../../../shared/engine/rules/legacy-set-ids.mjs';
import {
  isModernMegaCard,
  isLegacyMegaCard,
  isRuleBoxPokemon,
} from '../../../../shared/engine/rules/card-classify.mjs';
import { canRetreat } from '../../../../shared/engine/rules/retreat.mjs';
import {
  DEFAULT_ATTACK_BAND,
  DEFAULT_STADIUM_BAND,
  attackWeights,
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
// `sideInsetPct` keeps the panels inside the printed card border (TCG Live draws them inside it);
// it is the border plus the inner frame stripe, measured per frame.
// Measured off a Mega Dragonite ex scan: the label starts at ~66% and the cost ends at ~90%.
const MODERN_RETREAT_CORNER = { leftPct: 64, widthPct: 28, bottomPct: 8.5 };

// ME-era Mega ex print the Retreat label further left (from ~62%), measured off a Mega Charizard X ex scan.
// Kept apart from the older modern frames so neither has to compromise.
const MEGA_RETREAT_CORNER = { leftPct: 61, widthPct: 31, bottomPct: 8.5 };

export const INSPECTOR_BANDS = {
  // Content-sized: the stack starts at the band top and is only as tall as its text.
  default: {
    footH: 8.5,
    sideInsetPct: 6,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: DEFAULT_STADIUM_BAND,
  },
  // Modern Mega ex: the printed effect box ends at ~75% of the card, so the stack is stretched to
  // the band bottom (its attack rows sharing the height by text weight) to cover all printed text.
  'mega-ex': {
    footH: 8.5,
    sideInsetPct: 6,
    band: { ...DEFAULT_ATTACK_BAND, bottomPct: 75 },
    fillBand: true,
    retreatCorner: MEGA_RETREAT_CORNER,
    retreatInline: true,
  },
  // SM, SwSh, SV and Mega print Retreat on the bottom row's right, label left of the cost.
  'pokemon-modern': {
    footH: 8.5,
    sideInsetPct: 6,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: DEFAULT_STADIUM_BAND,
    retreatCorner: MODERN_RETREAT_CORNER,
    retreatInline: true,
  },
  // BW and XY print Retreat alone at the bottom-left on a second row under Weakness/Resistance, so
  // the strip covers only those two and Retreat gets its own corner button. Boxes measured off
  // TCGdex art (White Kyurem EX, bw11-101 and xy1 cards).
  'pokemon-bwxy': {
    footH: 8.5,
    sideInsetPct: 6,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: DEFAULT_STADIUM_BAND,
    retreatCorner: { leftPct: 6, widthPct: 34, bottomPct: 1 },
  },
  // XY M-EX and Primal Reversion cards print a rules box mid-card, which pushes the attack text
  // down: it ends at ~85% and a lone attack starts at ~71%. The stack hangs from the band bottom
  // and grows upward over the print. It ends just above the printed divider line and is compact so
  // its top stays clear of the rules box.
  'pokemon-xy-mega': {
    footH: 8.5,
    sideInsetPct: 6,
    band: { ...DEFAULT_ATTACK_BAND, bottomPct: 85 },
    anchorBottom: true,
    compactStack: true,
    fillBand: false,
    stadiumBand: DEFAULT_STADIUM_BAND,
    retreatCorner: { leftPct: 6, widthPct: 34, bottomPct: 1 },
  },
  // Stadium frames, measured off TCGdex art (one card per era). Modern (BW → Mega) centres a short
  // effect at ~63–75%; the header strip sits just above it. Classic (Gym, EX, DP, Pt, HGSS) prints
  // a taller box, so the panel covers ~55–90%. e-Card has a much wider left border.
  'stadium-modern': {
    footH: 8.5,
    sideInsetPct: 8,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: { topPct: 60, bottomPct: 78 },
  },
  'stadium-classic': {
    footH: 8.5,
    sideInsetPct: 8,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: { topPct: 55, bottomPct: 90 },
  },
  'stadium-ecard': {
    footH: 8.5,
    sideInsetPct: 9,
    sideInsetLeftPct: 14,
    band: DEFAULT_ATTACK_BAND,
    fillBand: false,
    stadiumBand: { topPct: 55, bottomPct: 90 },
  },
};

export function bandsForFrame(frameKey = 'default') {
  return INSPECTOR_BANDS[frameKey] ?? INSPECTOR_BANDS.default;
}

// Stadium frames are sorted by era off the set (`card.set` is a TCGdex id like "xy5" or a printed
// code like "PRC"). No set, or an unrecognised one, gets `default`.
const MODERN_SET_ID = /^(bw|xy|g1$|dc1$|sm|swsh|sv|me)/i;
const CLASSIC_SET_ID = /^(gym|base|neo|ex\d|dp|pl|hgss|col|pop|np)/i;
const ECARD_SET_ID = /^ecard/i;
const MODERN_POKEMON_SET_ID = /^(sm|swsh|sv|me)/i;
const BW_XY_SET_ID = /^(bw|xy|g1$|dc1$)/i;
// Printed decklist codes for the BW and XY blocks; legacy-set-ids.mjs does not map them to TCGdex ids.
const BW_XY_PRINTED_CODES = new Set(
  ('BLW EPO NVI NXD DEX DRX DRV BCR PLS PLF PLB LTR BWP ' +
    'XY FLF FFI PHF PRC DCR ROS AOR BKT BKP GEN FCO STS EVO XYP').split(' ')
);

const isBwXyEraSet = (set) =>
  BW_XY_PRINTED_CODES.has(String(set ?? '').trim().toUpperCase()) ||
  BW_XY_SET_ID.test(resolveTcgdexSetId(set) ?? '');

function stadiumFrameKeyFor(set) {
  const printed = String(set ?? '').trim().toUpperCase();
  if (BW_XY_PRINTED_CODES.has(printed)) return 'stadium-modern';
  const id = resolveTcgdexSetId(set) ?? '';
  if (ECARD_SET_ID.test(id)) return 'stadium-ecard';
  if (CLASSIC_SET_ID.test(id)) return 'stadium-classic';
  if (MODERN_SET_ID.test(id)) return 'stadium-modern';
  return 'default';
}

/** Left/right inset of a frame; a frame gives one `sideInsetPct` and may override the left. */
const sideInsetsOf = (frame) => ({
  sideInsetLeftPct: frame.sideInsetLeftPct ?? frame.sideInsetPct,
  sideInsetRightPct: frame.sideInsetPct,
});

/** Which INSPECTOR_BANDS frame a card is printed in; `default` when no frame is known for it. */
export function frameKeyFor(card) {
  if (isStadiumCard(card ?? {})) {
    return stadiumFrameKeyFor(card?.set);
  }
  if (isModernMegaCard(card ?? {})) return 'mega-ex';
  if (!isBwXyEraSet(card?.set)) {
    return MODERN_POKEMON_SET_ID.test(resolveTcgdexSetId(card?.set) ?? '') ? 'pokemon-modern' : 'default';
  }
  return isLegacyMegaCard(card ?? {}) ? 'pokemon-xy-mega' : 'pokemon-bwxy';
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

// Wording that marks an ability as one the player triggers; anything else ("As long as…", "If this
// Pokémon has no Energy…") is passive. Same phrases listAbilities keys the once-per-turn gate on.
const ACTIVATED_ABILITY_TEXT =
  /once during your turn|during your turn,? you may|you may use this ability|as often as you like|once per turn/i;

/**
 * Whether the engine would accept a retreat right now (turn, already retreated / attacked, and
 * whether the attached Energy covers the cost). The engine reads a numeric `retreatCost`, so the
 * printed symbols are reduced to a count. A gate that throws must not blank the tile.
 */
function retreatGateFor({ card, cost, energyTypes, user }) {
  try {
    const verdict = canRetreat(user, { ...card, retreatCost: cost }, energyTypes, []);
    return { allowed: Boolean(verdict.allowed), reason: verdict.reason ?? null };
  } catch {
    return { allowed: true, reason: null };
  }
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
/**
 * Printed finish tier, which picks the panels' flowing animation: `plain` (common/uncommon),
 * `holo`, `ultra` (rule-box Pokémon and the ultra/double rares) or `secret` (gold-tier rarities).
 * Unknown or missing rarity is `plain`.
 */
export function finishFor(card) {
  const rarity = String(card?.rarity ?? '').toLowerCase();
  if (/secret|hyper|illustration|special|rainbow|gold|shiny ultra|black white/.test(rarity)) return 'secret';
  if (/ultra|double rare|mega|ex|gx|vmax|vstar|amazing|radiant/.test(rarity)) return 'ultra';
  if (card && isRuleBoxPokemon(card)) return 'ultra';
  if (/holo|rare/.test(rarity)) return 'holo';
  return 'plain';
}

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
    frameKey = frameKeyFor(card),
  } = ctx;

  const name = String(card?.name ?? '');
  const hp = Number.isFinite(Number(card?.hp)) ? Number(card.hp) : null;

  // A Stadium is not a Pokémon, but it earns the same module: an effect panel over the printed
  // text with a Use affordance when the effect is activatable. The decision is the pure
  // stadiumActivationStatus() the sidebox path's gates mirror, so the panel cannot advertise a
  // use the game would reject.
  if (isStadiumCard(card)) {
    const stadiumBounds = stadiumZoneBounds({
      band: bandsForFrame(frameKey).stadiumBand,
    });
    const status = stadiumActivationStatus(card, {
      rulesEnabled,
      yourTurn: ctx.yourTurn ?? true,
      usedThisTurn: Boolean(ctx.stadiumUsed),
      flags: ctx.flags || {},
    });
    return {
      kind: 'stadium',
      finish: finishFor(card),
      name,
      hp,
      text: String(card?.text ?? card?.effect ?? ''),
      actionable: status.actionable,
      usable: status.usable,
      reason: status.reason,
      recede: status.actionable && !status.usable,
      blockTopPct: stadiumBounds.topPct,
      blockHeightPct: stadiumBounds.heightPct,
      ...sideInsetsOf(bandsForFrame(frameKey)),
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

  const statusBlockReason = statusAttackBlock(card);
  const window =
    attackWindow ??
    listAttacks(card, {
      energyTypes,
      rulesEnabled,
      abilityUsed: Boolean(abilityUsed),
      stadiumCostModifier: Number(ctx.stadiumCostModifier) || 0,
      extraAttacks: ctx.extraAttacks || [],
      blockedReason: statusBlockReason,
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
        statusBlockReason ||
        (zone === 'bench' ? 'A benched Pokémon cannot attack.' : null),
      // The renderer wires clicks off `usable` alone, so every gate lives here rather than being
      // re-derived in the DOM layer.
      usable: attackable && payable && !onceUsed && !statusBlockReason,
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
  // Only an ability the player can activate is ever greyed or clickable; a passive one is printed
  // text with nothing to use, so it stays lit and inert.
  const activated = ACTIVATED_ABILITY_TEXT.test(String(rawAbility?.text ?? ''));
  const ability = abilityInfo
    ? {
        name: abilityInfo.name,
        text: String(rawAbility.text ?? ''),
        usable: activated && Boolean(abilityInfo.usable) && interactive,
        reason: abilityInfo.reason ?? null,
        recede: activated && interactive && !abilityInfo.usable,
      }
    : null;

  const retreatSymbols = normalizeRetreatSymbols(card?.retreatCost);
  const retreatable = interactive && zone === 'active';
  const retreatGate = retreatable
    ? retreatGateFor({
        card,
        cost: retreatSymbols.length,
        energyTypes,
        user: ctx.user ?? 'self',
      })
    : { allowed: true, reason: null };

  const abilityCount = ability ? 1 : 0;
  // attackZoneBounds returns null for a card with no attacks (E1/E5), so the band has to
  // be defaulted rather than read off the result.
  const frame = bandsForFrame(frameKey);
  const weights = attackWeights(attacks);
  const bounds = attackZoneBounds({
    attackCount: attacks.length,
    index: 0,
    abilityCount,
    band: frame.band,
    weights,
  });
  const abilityBounds = abilityZoneBounds({ abilityCount, band: frame.band });
  const blockTopPct = abilityBounds?.topPct ?? bounds?.topPct ?? null;
  // Only a frame that declares `fillBand` stretches its stack; the rest stay content-sized (013).
  const blockHeightPct =
    frame.fillBand && blockTopPct != null
      ? frame.band.bottomPct +
        abilityCount * frame.band.abilityShiftPct -
        blockTopPct
      : null;

  return {
    kind: 'pokemon',
    finish: finishFor(card),
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
    retreat: retreatSymbols,
    // Where the rendered stack starts: the ability band when there is an ability, since that
    // text prints above the attacks, otherwise the attack band. `bandTopPct` stays the attack
    // band alone for anything laying out attacks specifically.
    blockTopPct,
    blockBottomPct:
      frame.anchorBottom && blockTopPct != null
        ? 100 - frame.band.bottomPct
        : null,
    blockHeightPct,
    attackWeights: weights,
    bandTopPct: bounds?.topPct ?? null,
    bandHeightPct: bounds?.heightPct ?? null,
    footH: frame.footH,
    ...sideInsetsOf(frame),
    dimLevel: readOnly || zone === 'bench' ? 'none' : dimLevelFor(attacks),
    interactive,
    attackable,
    // Retreat is a positional action: only the Active Spot can retreat, and only when there is
    // something to retreat to. The model sees one card, so the bench-count and energy gates stay
    // in `retreat()` (the same gate the sidebox Retreat button passes through), which reports the
    // reason through the chat line. What lives here is the one fact this model owns: a benched or
    // read-only Pokémon is not the one that retreats.
    retreatable,
    // `retreatable` is positional; `retreatUsable` adds the cost / turn gates the greyed tile and
    // the click both follow, so the tile never advertises a retreat the engine would refuse.
    retreatUsable: retreatable && retreatGate.allowed,
    retreatRecede: retreatable && !retreatGate.allowed,
    retreatReason:
      zone === 'bench'
        ? 'A benched Pokémon cannot retreat.'
        : (retreatGate.reason ?? null),
    retreatCorner: frame.retreatCorner ?? null,
    retreatInline: Boolean(frame.retreatInline),
    compactStack: Boolean(frame.compactStack),
    zone,
    readOnly,
  };
}
