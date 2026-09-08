/**
 * @file Pure Card data model and instanceId minting.
 * Strictly DOM-free; holds no HTMLImageElement or DOM references.
 */

/**
 * Mint a new integer instanceId stable for the life of the game.
 *
 * @param {{ nextInstanceId?: number }} state
 * @returns {number}
 */
export function mintInstanceId(state) {
  if (!state) {
    throw new Error('mintInstanceId requires a state object');
  }
  state.nextInstanceId = (typeof state.nextInstanceId === 'number' ? state.nextInstanceId : 0) + 1;
  return state.nextInstanceId;
}

/**
 * Creates a pure Card object.
 *
 * @param {object} props
 * @returns {object} Pure Card data object
 */
export function createCard(props = {}) {
  const instanceId = props.instanceId ?? props.syncInstance ?? null;
  const card = {
    instanceId,
    syncInstance: props.syncInstance ?? instanceId,
    ownerId: props.ownerId ?? null,
    name: props.name ?? '',
    set: props.set ?? '',
    number: props.number != null ? String(props.number) : '',
    id: props.id ?? '',
    src: props.src ?? '',
    type: props.type ?? '',
    supertype: props.supertype ?? '',
    subtypes: Array.isArray(props.subtypes) ? [...props.subtypes] : [],
    hp: props.hp != null ? props.hp : null,
    attacks: Array.isArray(props.attacks) ? props.attacks.map((a) => ({ ...a })) : [],
    weaknesses: Array.isArray(props.weaknesses) ? props.weaknesses.map((w) => ({ ...w })) : [],
    retreatCost: Array.isArray(props.retreatCost) ? [...props.retreatCost] : [],
    damage: typeof props.damage === 'number' && props.damage > 0 ? props.damage : 0,
    specialCondition: props.specialCondition ?? null,
    abilityUsed: typeof props.abilityUsed === 'boolean' ? props.abilityUsed : false,
    attachedTo: props.attachedTo ?? null,
    revealed: typeof props.revealed === 'boolean' ? props.revealed : false,
  };

  // Preserve any extra non-DOM data properties that might have been supplied
  for (const [key, value] of Object.entries(props)) {
    if (key === 'image') continue; // Invariant 8 & H2: strictly no DOM references
    if (!(key in card)) {
      card[key] = value;
    }
  }

  return card;
}

/**
 * Pure copy of a Card object.
 *
 * @param {object} card
 * @returns {object} Cloned card
 */
export function cloneCard(card) {
  if (!card) return null;
  return createCard(card);
}

/**
 * Formats a concise human-readable description of a card.
 *
 * @param {object} card
 * @returns {string}
 */
export function describeCard(card) {
  if (!card) return 'Empty';
  const name = card.name || 'Unknown';
  const setNum = card.set && card.number ? ` (${card.set} #${card.number})` : '';
  const idStr = card.instanceId != null ? ` [#${card.instanceId}]` : '';
  return `${name}${setNum}${idStr}`;
}

/**
 * Card type predicates.
 */
export function isPokemon(card) {
  if (!card) return false;
  return (
    card.supertype === 'Pokémon' ||
    card.supertype === 'Pokemon' ||
    Boolean(card.type && !['Trainer', 'Energy', 'Item', 'Supporter', 'Stadium'].includes(card.type))
  );
}

export function isEnergy(card) {
  if (!card) return false;
  return (
    card.supertype === 'Energy' ||
    card.type === 'Energy' ||
    Boolean(typeof card.name === 'string' && card.name.toLowerCase().includes('energy'))
  );
}

export function isTrainer(card) {
  if (!card) return false;
  return (
    card.supertype === 'Trainer' ||
    ['Trainer', 'Item', 'Supporter', 'Stadium', 'Tool', 'Pokémon Tool'].includes(card.type)
  );
}

export function isBasicPokemon(card) {
  if (!isPokemon(card)) return false;
  const stage = String(card.stage || card.subtypes?.[0] || 'Basic').toLowerCase();
  if (['stage 1', 'stage 2', 'vmax', 'vstar', 'mega'].includes(stage)) {
    return false;
  }
  const subtypes = Array.isArray(card.subtypes) ? card.subtypes.map((s) => String(s).toLowerCase()) : [];
  if (subtypes.some((s) => ['stage 1', 'stage 2', 'vmax', 'vstar', 'mega'].includes(s))) {
    return false;
  }
  return true;
}

export function getRetreatCostCount(card) {
  if (!card) return 0;
  if (typeof card.retreatCost === 'number') return Math.max(0, card.retreatCost);
  if (Array.isArray(card.retreatCost)) return card.retreatCost.length;
  return 0;
}

