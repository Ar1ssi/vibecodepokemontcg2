/**
 * @file Card classification — the single source of truth for "what is this
 * card?" predicates shared by the server-authoritative reducer and the legacy
 * rules path (rulebook 30c, Phase 0).
 *
 * Every predicate takes a card-shaped object (TCGdex fields: `name`,
 * `supertype`, `subtypes`, `stage`, `rarity`, plus an optional
 * `ability`/`text` for Tera detection) and returns a boolean. Subtype matching
 * ignores case and punctuation, so "Prism Star" === "prism-star".
 *
 * `isRuleBoxPokemon` is the ONLY rule-box definition in the codebase. Do not
 * reintroduce a `prizesForKO(card) > 1` heuristic or a second subtype list —
 * the pre-30c duplicates disagreed (Radiant/V-UNION were missed).
 *
 * Pure and dependency-free (no DOM, no imports).
 */

const lower = (value) => String(value ?? '').toLowerCase();

// Collapse to letters+digits so "Stage 1", "stage-1" and "Stage1" agree.
const collapse = (value) => lower(value).replace(/[^a-z0-9]/g, '');

const subtypeTokens = (card) =>
  Array.isArray(card?.subtypes) ? card.subtypes.map(collapse) : [];

const hasSubtype = (card, ...tokens) => {
  const present = subtypeTokens(card);
  return tokens.some((token) => present.includes(token));
};

const nameOf = (card) => String(card?.name ?? '').trim();

const textOf = (card) =>
  lower(
    card?.ability?.text ?? card?.abilityText ?? card?.text ?? card?.effect ?? ''
  );

// ── individual card-type predicates ────────────────────────────────────────

// The printed suffix needs a separator ("Cetitan ex", "M Venusaur-EX") — a bare
// `endsWith('ex')` also matched plain names like "Toxapex", mis-classifying them
// as rule-box ex (App. 8). Same separator rule for GX for symmetry.
export function isExCard(card = {}) {
  if (hasSubtype(card, 'ex')) return true;
  return /(?:^|[\s-])ex$/i.test(nameOf(card));
}

export function isGxCard(card = {}) {
  if (hasSubtype(card, 'gx')) return true;
  return /(?:^|[\s-])gx$/i.test(nameOf(card));
}

// TAG TEAM Pokémon carry a "TAG TEAM" subtype (sometimes absent before async
// enrichment) and their names are written "<A> & <B>-GX".
export function isTagTeamCard(card = {}) {
  if (hasSubtype(card, 'tagteam')) return true;
  const name = nameOf(card);
  return /-gx$/i.test(name) && name.includes('&');
}

// V-UNION pieces share one name and are always written "<Name> V-UNION".
export function isVUnionCard(card = {}) {
  if (hasSubtype(card, 'vunion')) return true;
  return /v-?union$/i.test(nameOf(card));
}

export function isVmaxCard(card = {}) {
  if (hasSubtype(card, 'vmax')) return true;
  return /(?:^|\s)vmax$/i.test(nameOf(card));
}

export function isVstarCard(card = {}) {
  if (hasSubtype(card, 'vstar')) return true;
  return /(?:^|\s)vstar$/i.test(nameOf(card));
}

// V, VMAX, VSTAR and V-UNION are all "Pokémon V" for rule purposes.
export function isVCard(card = {}) {
  if (hasSubtype(card, 'v')) return true;
  if (isVmaxCard(card) || isVstarCard(card) || isVUnionCard(card)) return true;
  const name = nameOf(card);
  return /(?:^|\s)v(?:star|max|-?union)?$/i.test(name) || /\bv\b/i.test(name);
}

export function isTeraCard(card = {}) {
  if (hasSubtype(card, 'tera')) return true;
  const text = textOf(card);
  if (
    text.includes('tera: as long as this pokémon is on your bench') ||
    text.includes('tera rule')
  ) {
    return true;
  }
  return /\btera\b/i.test(nameOf(card));
}

// Legacy Mega Evolution / Primal Reversion is written "<M|Primal> <Name>-EX"
// (e.g. "M Lucario-EX", "Primal Kyogre-EX") in the XY Series.
const LEGACY_MEGA_NAME_RE = /^(?:m|primal)\s+\S/i;

// Modern (2025+) Mega Evolution spells the full word "Mega"; the legacy
// abbreviation "M Venusaur-EX" must not match here. The printed name wins over
// subtype/rarity fallbacks: TCGdex reports `stage: "MEGA"` for legacy cards
// (an importer can surface that as a "MEGA" subtype token), which would
// otherwise mis-flag every legacy Mega as modern.
export function isModernMegaCard(card = {}) {
  if (LEGACY_MEGA_NAME_RE.test(nameOf(card))) return false;
  if (lower(card?.rarity).includes('mega')) return true;
  if (subtypeTokens(card).some((token) => token.includes('mega'))) return true;
  return /\bmega\b/i.test(nameOf(card));
}

// Legacy Mega Evolution / Primal Reversion: "<M|Primal> <Name>-EX".
export function isLegacyMegaCard(card = {}) {
  if (!LEGACY_MEGA_NAME_RE.test(nameOf(card))) return false;
  return !isModernMegaCard(card);
}

export function isMegaCard(card = {}) {
  return isModernMegaCard(card) || isLegacyMegaCard(card);
}

export function isPrismStarCard(card = {}) {
  if (hasSubtype(card, 'prismstar')) return true;
  return /\u25c7/.test(nameOf(card));
}

export function isAceSpecCard(card = {}) {
  if (hasSubtype(card, 'acespec')) return true;
  // TCGdex prints no `subtypes`; ACE SPEC cards carry the "ACE SPEC Rare" rarity.
  return lower(card?.rarity).includes('ace spec');
}

export function isRadiantCard(card = {}) {
  if (hasSubtype(card, 'radiant')) return true;
  if (/^radiant\s/i.test(nameOf(card))) return true;
  // TCGdex rarity for Radiant Pokémon (name prefix is the primary signal).
  return lower(card?.rarity).includes('radiant');
}

export function isLegendCard(card = {}) {
  if (hasSubtype(card, 'legend')) return true;
  return /\blegend\b/i.test(nameOf(card));
}

// App. 24: a Team Flare Hyper Gear is a Pokémon Tool that attaches to one of
// your OPPONENT's Pokémon-EX. TCGdex prints the marker in the card NAME
// ("Head Ringer Team Flare Hyper Gear"); imported rows may instead carry it as
// a subtype.
//
// The App. 24 "Pokémon-EX" target is resolved through isExCard, which
// deliberately unifies modern "ex" and legacy "EX" engine-wide (prize counts,
// Briar-style effects). In Unlimited both families coexist, so a modern Pokémon
// ex is accepted as a valid TFHG target — an accepted convention, not a bug
// (D74); do not narrow this gate without also un-unifying isExCard.
export function isTeamFlareHyperGearCard(card = {}) {
  if (hasSubtype(card, 'teamflarehypergear')) return true;
  const name = lower(nameOf(card)).replace(/\s+/g, ' ');
  return name.includes('team flare hyper gear');
}

// Official Basic Energy names: "<Type> Energy", "Basic <Type> Energy" and the
// symbol form "Basic {W} Energy". Imported deck rows carry only name+supertype,
// so this is the last-resort fallback when no subtype/energyType is present.
const BASIC_ENERGY_NAME_RE =
  /^(?:basic\s+)?(?:\{\w+\}|grass|fire|water|lightning|psychic|fighting|darkness|dark|metal|fairy|colorless|dragon)\s+energy$/i;

// Basic Energy: supertype/type Energy, never Special. Prefers explicit subtype
// then TCGdex `energyType` ("Normal" vs "Special"), then the printed name.
export function isBasicEnergy(card = {}) {
  const supertype = lower(card?.supertype || card?.type);
  if (supertype !== 'energy') return false;
  if (hasSubtype(card, 'special')) return false;
  const energyType = lower(card?.energyType);
  if (energyType === 'special') return false;
  if (hasSubtype(card, 'basic') || energyType === 'normal') return true;
  return BASIC_ENERGY_NAME_RE.test(nameOf(card));
}

// ── rule box (single definition) ───────────────────────────────────────────
// App. 8: a Rule Box Pokémon is any of ex / GX / V / VMAX / VSTAR / Tera /
// Mega / Radiant / Prism Star / ACE SPEC / TAG TEAM / V-UNION / LEGEND.
export function isRuleBoxPokemon(card = {}) {
  if (!card) return false;
  return (
    isExCard(card) ||
    isGxCard(card) ||
    isVCard(card) ||
    isVmaxCard(card) ||
    isVstarCard(card) ||
    isTeraCard(card) ||
    isMegaCard(card) ||
    isRadiantCard(card) ||
    isPrismStarCard(card) ||
    isAceSpecCard(card) ||
    isTagTeamCard(card) ||
    isVUnionCard(card) ||
    isLegendCard(card)
  );
}

// ── prizes ─────────────────────────────────────────────────────────────────
// 3: VMAX / TAG TEAM / V-UNION / modern Mega Evolution Pokémon ex.  2: ex /
// GX / V / VSTAR / legacy Mega (Gen 6 "M …-EX") / LEGEND / Double Rare.
// 1: everything else. (App. 1, 10, 14, 16, 19, 26.)
export function prizesForKO(card = {}) {
  if (
    isVmaxCard(card) ||
    isTagTeamCard(card) ||
    isVUnionCard(card) ||
    isModernMegaCard(card)
  ) {
    return 3;
  }
  if (
    isExCard(card) ||
    isGxCard(card) ||
    isVCard(card) ||
    isVstarCard(card) ||
    isLegacyMegaCard(card) ||
    isLegendCard(card) ||
    lower(card?.rarity).includes('double rare')
  ) {
    return 2;
  }
  return 1;
}
