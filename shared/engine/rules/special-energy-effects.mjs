// Typed special energy cards (ME03 Perfect Order, ME04 Chaos Rising,
// ME05 Pitch Black). Pure parsers + helpers — DOM-free (node:test friendly).
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

export function getAttachedEnergies(pokemonCard, zoneArray = []) {
  const target = pokemonCard?.image;
  if (!target) return [];
  return zoneArray.filter(
    (e) => e && e.type === 'Energy' && e.image?.relative === target,
  );
}

function typedEnergyOnPokemon(pokemonCard, zoneArray, predicate) {
  for (const energy of getAttachedEnergies(pokemonCard, zoneArray)) {
    const def = parseTypedSpecialEnergy(energy);
    if (!def) continue;
    if (!pokemonMatchesEnergyType(pokemonCard, def.requiredPokemonType)) continue;
    if (predicate(def, energy)) return { def, energy };
  }
  return null;
}

export function getEnergyHpBonus(pokemonCard, zoneArray = []) {
  const hit = typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.hpBonus > 0,
  );
  return hit?.def.hpBonus || 0;
}

export function hasRockyEffectShield(pokemonCard, zoneArray = []) {
  return typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.blocksAttackEffects,
  ) != null;
}

export function hasBubblyStatusImmunity(pokemonCard, zoneArray = []) {
  return typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.statusImmune,
  ) != null;
}

export function hasMagneticFreeRetreat(pokemonCard, zoneArray = []) {
  return typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.freeRetreat,
  ) != null;
}

export function blocksBenchAttackDamage(pokemonCard, zoneId, zoneArray = []) {
  if (zoneId !== 'bench') return false;
  return typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.benchDamageShield,
  ) != null;
}

export function getVoltaicDamageBonus(pokemonCard, zoneArray = []) {
  const hit = typedEnergyOnPokemon(
    pokemonCard,
    zoneArray,
    (def) => def.activeDamageBonus > 0,
  );
  return hit?.def.activeDamageBonus || 0;
}

export function getTelepathicOnAttachSearch(energyCard) {
  const def = parseTypedSpecialEnergy(energyCard);
  if (!def?.onAttachFromHandSearch) return null;
  return { ...def.onAttachFromHandSearch };
}

export function shouldNitroReturnToHand(energyCard, hostPokemon, attackExecuting = false) {
  if (!attackExecuting) return false;
  const def = parseTypedSpecialEnergy(energyCard);
  if (!def?.nitroRecycle) return false;
  if (!hostPokemon) return false;
  return pokemonMatchesEnergyType(hostPokemon, def.requiredPokemonType);
}

export function matchesBasicPokemonType(card, typeName) {
  const isPokemon =
    String(card?.type || '').toLowerCase().includes('pokémon') ||
    String(card?.type || '').toLowerCase().includes('pokemon') ||
    (Array.isArray(card?.subtypes) &&
      card.subtypes.some((s) => lower(s) === 'pokémon' || lower(s) === 'pokemon'));
  if (!isPokemon) return false;
  const stage = card?.stage || 'Basic';
  if (stage !== 'Basic') return false;
  return pokemonMatchesEnergyType(card, typeName);
}
