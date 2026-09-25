// Typed special energy cards (ME03 Perfect Order, ME04 Chaos Rising,
// ME05 Pitch Black). Name catalog + type-match helpers — DOM-free. Their effects
// run through special-energy-parse.mjs; this catalog only feeds descriptions.
// UI wiring lives in rules-bridge.js, chat-buttons.js, and move-card.js.

const lower = (v) => String(v ?? '').toLowerCase();

export const TYPED_SPECIAL_ENERGY_DEFS = [
  {
    id: 'growing-grass',
    nameMatch: /growing grass energy/i,
    providedType: 'Grass',
    requiredPokemonType: 'Grass',
    hpBonus: 20,
    description:
      'Growing Grass Energy: provides Grass Energy; the Grass Pokémon it is attached to gets +20 HP.',
  },
  {
    id: 'rocky-fighting',
    nameMatch: /rocky fighting energy/i,
    providedType: 'Fighting',
    requiredPokemonType: 'Fighting',
    blocksAttackEffects: true,
    description:
      'Rocky Fighting Energy: provides Fighting Energy; prevents attack effects (not damage) done to the attached Fighting Pokémon.',
  },
  {
    id: 'telepathic-psychic',
    nameMatch: /telepathic psychic energy/i,
    providedType: 'Psychic',
    requiredPokemonType: 'Psychic',
    onAttachFromHandSearch: { what: 'Basic Psychic Pokémon', count: 2, destination: 'bench' },
    description:
      'Telepathic Psychic Energy: provides Psychic Energy; when attached from hand to a Psychic Pokémon, search your deck for up to 2 Basic Psychic Pokémon and put them on your Bench.',
  },
  {
    id: 'bubbly-water',
    nameMatch: /bubbly water energy/i,
    providedType: 'Water',
    requiredPokemonType: 'Water',
    statusImmune: true,
    recoverStatusOnAttach: true,
    description:
      'Bubbly Water Energy: provides Water Energy; the Water Pokémon it is attached to recovers from all Special Conditions and cannot be affected by Special Conditions.',
  },
  {
    id: 'magnetic-metal',
    nameMatch: /magnetic metal energy/i,
    providedType: 'Metal',
    requiredPokemonType: 'Metal',
    freeRetreat: true,
    description:
      'Magnetic Metal Energy: provides Metal Energy; the Metal Pokémon it is attached to has no Retreat Cost.',
  },
  {
    id: 'nitro-fire',
    nameMatch: /nitro fire energy/i,
    providedType: 'Fire',
    requiredPokemonType: 'Fire',
    nitroRecycle: true,
    description:
      'Nitro Fire Energy: provides Fire Energy; if discarded by an attack used by the attached Fire Pokémon, put this card into your hand instead.',
  },
  {
    id: 'shadowy-darkness',
    nameMatch: /shadowy darkness energy/i,
    providedType: 'Darkness',
    requiredPokemonType: 'Darkness',
    benchDamageShield: true,
    description:
      'Shadowy Darkness Energy: provides Darkness Energy; while the attached Darkness Pokémon is on your Bench, prevent all attack damage done to it.',
  },
  {
    id: 'voltaic-lightning',
    nameMatch: /voltaic lightning energy/i,
    providedType: 'Lightning',
    requiredPokemonType: 'Lightning',
    activeDamageBonus: 20,
    description:
      'Voltaic Lightning Energy: provides Lightning Energy; attacks used by the attached Lightning Pokémon do 20 more damage to your opponent\'s Active Pokémon.',
  },
];

export function parseTypedSpecialEnergy(card) {
  if (!card?.name) return null;
  for (const def of TYPED_SPECIAL_ENERGY_DEFS) {
    if (def.nameMatch.test(card.name)) return { ...def };
  }
  return null;
}

export function isTypedSpecialEnergy(card) {
  return parseTypedSpecialEnergy(card) != null;
}

export function describeTypedSpecialEnergy(card) {
  const def = parseTypedSpecialEnergy(card);
  return def?.description || null;
}

export function pokemonMatchesEnergyType(pokemon, energyType) {
  if (!pokemon || !energyType) return false;
  const want = energyType.toLowerCase();
  const fromData = String(pokemon?.types?.[0] ?? '').trim().toLowerCase();
  if (fromData) {
    if (fromData === want) return true;
    if (want === 'darkness' && fromData === 'dark') return true;
    if (want === 'dark' && fromData === 'darkness') return true;
  }
  const name = lower(pokemon?.name);
  return name.includes(want);
}

// "Basic {X} Pokémon" search filter. Cards can arrive with the Pokémon marker
// on `type`, `supertype`, or only an `hp` field (deck rows / oracle harness),
// and `stage` casing varies, so all three markers and a case-folded stage are
// accepted.
export function matchesBasicPokemonType(card, typeName) {
  const marker = lower(card?.type || card?.supertype);
  const isPokemon =
    marker.includes('pokémon') ||
    marker.includes('pokemon') ||
    (card?.hp != null && Number.isFinite(Number(card.hp))) ||
    (Array.isArray(card?.subtypes) &&
      card.subtypes.some(
        (s) => lower(s) === 'pokémon' || lower(s) === 'pokemon'
      ));
  if (!isPokemon) return false;
  if (lower(card?.stage || 'basic') !== 'basic') return false;
  return pokemonMatchesEnergyType(card, typeName);
}
