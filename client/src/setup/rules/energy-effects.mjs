// Special-energy effect engine (taxonomy Section F, Gap #4).
//
// Today the sim only understands an energy's *type* (what it satisfies in an
// attack cost, via `canPayAttackCost`). The *effect* a special-energy card
// carries (Double, Double Colorless, Lock, Switching, Buddy-Buddy, letter /
// named specials that change the attached type, …) is recognized and described
// here, but NOT executed.
//
// This module is pure + DOM-free (node:test friendly). It deliberately matches
// the project's existing "announce-only / guidance" convention:
//   - `classifyEnergyEffect` buckets a card into an effect family (from
//     TCGdex `subtypes` + `name`, with a name fallback so it works before
//     async card data loads).
//   - `describeEnergyEffect` builds a human-readable announcement line.
//   - `applyEnergyEffect` is an announce-only stub: it returns a result object
//     and does NOT mutate any game state. Full per-family execution is deferred
//     pending user confirmation (taxonomy: do not silently build execution).

// Effect families a special energy can be classified into.
export const ENERGY_EFFECT_FAMILIES = [
  'double',           // provides 2 energy of the printed type
  'double-colorless', // provides 2 Colorless energy (satisfies any 2 symbols)
  'lock',             // Lock Energy — attached energy cannot be removed
  'redirect',         // Switching Energy — may be used to switch your Active
  'protect',          // Buddy-Buddy Energy — shields this Pokémon from some effects
  'attach-type',      // letter / named specials that change the attached type
  'basic',            // standard single-type basic energy
  'unknown',          // energy we can't place
];

const lower = (v) => String(v ?? '').toLowerCase();

const subtypesOf = (card) =>
  (Array.isArray(card?.subtypes) ? card.subtypes : []).map(lower);

// Single-word basic names TCGdex sometimes omits subtypes for.
const BASIC_ENERGY_NAME = /^(colorless|grass|fire|water|lightning|psychic|fighting|metal|darkness|dragon|fairy) energy$/;

const isBasicNamedEnergy = (name) => BASIC_ENERGY_NAME.test(lower(name).trim());

// "Rocky Fighting Energy", "Growing Grass Energy", …
const TYPED_ENERGY_NAME =
  /\b(colorless|grass|fire|water|lightning|psychic|fighting|metal|darkness|dragon|fairy)\s+energy\b/i;

const ENERGY_SYMBOL_TYPES = {
  c: 'Colorless',
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  m: 'Metal',
  d: 'Darkness',
  n: 'Dragon',
  y: 'Fairy',
};

const normalizeEnergyType = (raw) => {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const key = t.toLowerCase();
  if (key === 'dark') return 'Dark';
  if (key === 'darkness') return 'Darkness';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

const typeHintFromEnergyName = (name) => {
  const m = TYPED_ENERGY_NAME.exec(String(name ?? ''));
  return m ? normalizeEnergyType(m[1]) : null;
};

const typeHintFromEffect = (card) => {
  const text = String(card?.effect ?? card?.text ?? '');
  const sym = text.match(/\{([a-z])\}/i);
  if (!sym) return null;
  return ENERGY_SYMBOL_TYPES[sym[1].toLowerCase()] || null;
};

const providesTypedEnergy = (card) => {
  const name = lower(card?.name);
  const text = lower(card?.effect ?? card?.text ?? '');
  return typeHintFromEnergyName(name) != null
    || /\bprovides?\b/.test(text)
    || /\{[a-z]\}\s+energy/.test(text);
};

const isEnergyCard = (card) => {
  if (!card) return false;
  const subs = subtypesOf(card);
  if (
    subs.includes('basic') ||
    subs.includes('special') ||
    subs.includes('double') ||
    subs.includes('double colorless')
  ) {
    return true;
  }
  const type = lower(card.type);
  const name = lower(card.name);
  return type.includes('energy') || name.includes('energy');
};

export { isEnergyCard };

// Bucket a card into an energy-effect family. Non-energy / unrecognizable
// cards return 'unknown'. Precedence: the most specific family wins
// (double-colorless > double > named specials > basic > generic special).
export function classifyEnergyEffect(card) {
  if (!isEnergyCard(card)) return 'unknown';

  const subs = subtypesOf(card);
  const name = lower(card.name);
  const isSpecial = subs.includes('special');
  const isBasic = subs.includes('basic');

  // Double families (check "double colorless" before "double" — the former
  // name also contains the latter).
  if (subs.includes('double colorless') || name.includes('double colorless')) {
    return 'double-colorless';
  }
  if (subs.includes('double') || name.includes('double')) {
    return 'double';
  }

  // Named specials with a dedicated, well-known effect.
  if ((name.includes('lock') && isSpecial) || name.includes('lock energy')) {
    return 'lock';
  }
  if (name.includes('switching')) {
    return 'redirect';
  }
  if (name.includes('buddy-buddy')) {
    return 'protect';
  }

  if (isBasic || isBasicNamedEnergy(card?.name)) return 'basic';

  // A special energy we don't have a named rule for is treated as an
  // "attach-type" modifier (letter / named specials that change the type).
  if (isSpecial) return 'attach-type';

  // TCGdex often omits subtypes on modern special energies (e.g. Rocky
  // Fighting Energy). Infer attach-type from the name/effect when it is not
  // a basic- or double-named card.
  if (
    !name.includes('double') &&
    !isBasicNamedEnergy(card?.name) &&
    (providesTypedEnergy(card) || (name.includes(' energy') && name !== 'energy'))
  ) {
    return 'attach-type';
  }

  return 'unknown';
}

// Human-readable, guidance-only description of the effect (for announcements).
export function describeEnergyEffect(card) {
  const family = classifyEnergyEffect(card);
  const name = card?.name || 'This Energy';

  switch (family) {
    case 'double':
      return `${name}: provides 2 energy of the printed type (counts as 2 toward a cost).`;
    case 'double-colorless':
      return `${name}: provides 2 Colorless energy (satisfies any 2 energy symbols).`;
    case 'lock':
      return `${name}: Lock Energy — attached energy cannot be removed by card effects while attached.`;
    case 'redirect':
      return `${name}: Switching Energy — may be used to switch your Active Pokémon.`;
    case 'protect':
      return `${name}: Buddy-Buddy Energy — shields this Pokémon from certain opponent effects.`;
    case 'attach-type':
      return `${name}: Special Energy — attached as a modified energy type (see the card text for the exact type).`;
    case 'basic':
      return `${name}: Basic Energy — provides 1 energy of its printed type.`;
    case 'unknown':
    default:
      return `${name}: Energy card (no special effect recognized).`;
  }
}

// ── attach-type execution (taxonomy §F Gap #4b, first family) ────────────
// Some special energies are letter / named cards that attach as a *specific
// modified type* (U Energy → Fighting, Griseous → Metal, Prism → any type,
// …). Derive the effective attached type: TCGdex `types` first (when the
// card is already classified 'attach-type'), else a name-based map so it
// works before async card data loads. Returns null when no override applies
// (callers keep their own type derivation for basic / unknown energies).
const VALID_TYPES = new Set([
  'colorless', 'grass', 'fire', 'water', 'lightning',
  'psychic', 'fighting', 'metal', 'dark', 'dragon',
]);

// Letter energies (Evolutions set): single-letter name → provided type.
const LETTER_ENERGY_TYPES = { u: 'Fighting', v: 'Metal', w: 'Metal', z: 'Dragon' };

// Named special energies → the most general type they provide. Multi-type
// cards (Stellar: Colorless or Dragon; Terra: Grass or Fighting; Ancient /
// Obsidian: Dark or Dragon) use their most general option; Prism (any type)
// maps to Colorless, the sim's wildcard.
const NAMED_ATTACH_TYPES = [
  [/(^|\b)griseous energy/, 'Metal'],
  [/(^|\b)prism energy/, 'Colorless'],
  [/(^|\b)stellar energy/, 'Colorless'],
  [/(^|\b)terra energy/, 'Grass'],
  [/(^|\b)ancient energy/, 'Dark'],
  [/(^|\b)obsidian energy/, 'Dark'],
];

export function effectiveEnergyType(card) {
  if (!isEnergyCard(card)) return null;
  if (classifyEnergyEffect(card) === 'attach-type') {
    const fromData = String(card?.types?.[0] ?? '').trim();
    if (VALID_TYPES.has(fromData.toLowerCase())) return normalizeEnergyType(fromData);

    const fromEffect = typeHintFromEffect(card);
    if (fromEffect) return fromEffect;

    const fromName = typeHintFromEnergyName(card?.name);
    if (fromName) return fromName;
  }
  const name = lower(card?.name);
  const letter = name.match(/^([a-z]) energy/);
  if (letter && LETTER_ENERGY_TYPES[letter[1]]) return LETTER_ENERGY_TYPES[letter[1]];
  for (const [re, type] of NAMED_ATTACH_TYPES) {
    if (re.test(name)) return type;
  }
  return null;
}

// Single entry point for attack-cost / retreat-cost energy typing.
export function resolveAttachedEnergyType(card) {
  if (!isEnergyCard(card)) return 'Colorless';
  return (
    effectiveEnergyType(card)
    || normalizeEnergyType(card?.types?.[0])
    || typeHintFromEnergyName(card?.name)
    || typeHintFromEffect(card)
    || 'Colorless'
  );
}

// ── lock execution (taxonomy §F, family 2) ──────────────────────────────
// Lock Energy: the energy attached to a Pokémon that has a Lock Energy
// attached cannot be removed by card effects. Pure helpers for the
// `moveCard` removal gate (UI wiring in actions/move-card-bundle).
// `pokemonHasLockedEnergy` scans a flat list of card objects (e.g. a zone
// array) for an attached Lock Energy whose `image.relative` points at the
// Pokémon; detached energy (relative reset, e.g. after a KO) is not
// protected — matching the real rule that KO discard is not a card effect.
export function isLockEnergy(card) {
  return classifyEnergyEffect(card) === 'lock';
}

export function pokemonHasLockedEnergy(pokemonCard, energyCards = []) {
  const target = pokemonCard?.image;
  if (!target) return false;
  return (energyCards || []).some(
    (e) => e && e.image?.relative === target && isLockEnergy(e)
  );
}

// ── redirect execution (taxonomy §F, family 3: Switching Energy) ────────
// Switching Energy: "You may use this Energy to switch your Active Pokémon." We
// model it as the minimal, testable slice — a free switch: when a Pokémon with
// a Switching Energy attached retires (retreat), the retreat-cost energy-discard
// step is skipped. Pure helpers for the `retreat()` gate (UI wiring in
// actions/chat-buttons). `pokemonHasRedirectEnergy` mirrors the lock helpers:
// it scans a flat list of card objects for an attached Switching Energy whose
// `image.relative` points at the Pokémon.
export function isRedirectEnergy(card) {
  return classifyEnergyEffect(card) === 'redirect';
}

export function pokemonHasRedirectEnergy(pokemonCard, energyCards = []) {
  const target = pokemonCard?.image;
  if (!target) return false;
  return (energyCards || []).some(
    (e) => e && e.image?.relative === target && isRedirectEnergy(e)
  );
}

// ── protect execution (taxonomy §F, family 4: Buddy-Buddy Energy) ──────
// Buddy-Buddy Energy: "If this Pokémon would be dealt damage by an opponent's
// attack, instead do 1 damage to it." We model the minimal, testable slice — a
// damage cap: when the defending Pokémon has a Buddy-Buddy Energy attached, any
// damage an opponent's attack would deal is capped at 1. `pokemonHasProtectEnergy`
// mirrors the lock/redirect helpers: it scans a flat list of card objects for an
// attached Buddy-Buddy Energy whose `image.relative` points at the Pokémon.
export function isProtectEnergy(card) {
  return classifyEnergyEffect(card) === 'protect';
}

export function pokemonHasProtectEnergy(pokemonCard, energyCards = []) {
  const target = pokemonCard?.image;
  if (!target) return false;
  return (energyCards || []).some(
    (e) => e && e.image?.relative === target && isProtectEnergy(e)
  );
}

// Buddy-Buddy damage cap: if the defender carries a Buddy-Buddy Energy and the
// attack would deal more than 1 damage, the damage dealt is reduced to 1.
// Damage of 0 stays 0 (nothing to cap). No-op when `hasProtect` is false.
export function applyProtectCap(damage, hasProtect) {
  const d = Math.max(0, damage ?? 0);
  if (!hasProtect) return d;
  return d > 1 ? 1 : d;
}

// Per-family execution entry point. `attach-type` is fully executed: it
// reports the effective attached type used for cost payment. Other families
// remain announce-only until their execution is built.
export function applyEnergyEffect(card) {
  const family = classifyEnergyEffect(card);
  const description = describeEnergyEffect(card);
  if (family === 'attach-type') {
    const effectiveType = effectiveEnergyType(card);
    return {
      family,
      executed: true,
      effectiveType,
      message: `⚡ ${description}${effectiveType ? ` Effective type: ${effectiveType}.` : ''}`,
    };
  }
  return {
    family,
    executed: false,
    message: `⚡ ${description} (announce-only — effect execution not yet implemented)`,
  };
}
