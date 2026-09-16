// How the server-authoritative reducer reads an attached Energy card when paying attack and
// Retreat costs. The playtest bot (e2e-options.mjs) uses the same function so it never offers
// an attack the server will reject. Pure and DOM-free.

const NAME_TYPES = [
  [/fire/, 'Fire'],
  [/water/, 'Water'],
  [/grass/, 'Grass'],
  [/lightning/, 'Lightning'],
  [/psychic/, 'Psychic'],
  [/fighting/, 'Fighting'],
  [/metal/, 'Metal'],
  [/dark/, 'Darkness'],
  [/dragon/, 'Dragon'],
];

/**
 * @param {object|string|null} card An attached Energy card, or a bare type name
 * @returns {{type: string, family: string}} Input for expandEnergyEntries (attack-engine.mjs)
 */
export function serverEnergyDescriptor(card) {
  if (!card) return { type: 'Colorless', family: 'basic' };
  if (typeof card === 'string') return { type: card, family: 'basic' };

  const name = String(card.name || '').toLowerCase();
  const type = card.types?.[0] || NAME_TYPES.find(([pattern]) => pattern.test(name))?.[1] || 'Colorless';

  let family = 'basic';
  if (/double colorless/.test(name)) {
    family = 'double-colorless';
  } else if (/double/.test(name)) {
    family = 'double';
  }
  return { type, family };
}
