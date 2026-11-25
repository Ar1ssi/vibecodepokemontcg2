// An evolved Pokémon is stored as its Basic (the root) with its Evolution cards attached under it
// (evolved-pokemon.mjs), so the instanceId the engine names a Pokémon by is the Basic's, and a
// lookup by that id finds the Basic's card. Anything that shows the Pokémon to a player — a
// battle-log line, a choice option — must name the card on top of the stack instead.
// Pure and DOM-free.

import { findCard } from '../state.mjs';
import { isPokemon } from '../cards.mjs';
import { evolvedFromCard, topPokemonCard } from './evolved-pokemon.mjs';

const IN_PLAY_ZONES = new Set(['active', 'bench']);

const hidden = (card) => Boolean(card?.faceDown && !card.revealed);

/** The in-play Pokémon whose root is `instanceId`, or null when the id is not one. */
function inPlayStack(state, instanceId) {
  if (instanceId == null) return null;
  const ref = findCard(state, instanceId);
  if (!ref || !IN_PLAY_ZONES.has(ref.zoneId) || ref.card?.attachedTo != null) return null;
  return { root: ref.card, zone: ref.player?.zones?.[ref.zoneId] || [] };
}

const shownTop = ({ root, zone }) => {
  const top = topPokemonCard(zone, root);
  return top && top !== root && !hidden(top) && !hidden(root) ? top : null;
};

/**
 * The card an evolved in-play Pokémon shows: its top Evolution. Null when `instanceId` is not
 * the root of an evolved in-play Pokémon (an unevolved one already shows its own card), or when
 * the stack is face down.
 * @param {object} state
 * @param {number} instanceId
 * @returns {object|null}
 */
export function shownEvolutionCard(state, instanceId) {
  const stack = inPlayStack(state, instanceId);
  return stack ? shownTop(stack) : null;
}

// Event fields that name an in-play Pokémon by its root id (the mapper in
// client/src/setup/netcode/server-battle-log.mjs and attack-announcements.mjs phrases them).
const POKEMON_FIELDS = {
  pokemonKnockedOut: ['instanceId'],
  pokemonPromoted: ['instanceId'],
  statusApplied: ['instanceId'],
  statusCleared: ['instanceId'],
  benchDamaged: ['instanceId'],
  cardAttached: ['targetInstanceId'],
  pokemonDevolved: ['targetInstanceId'],
  cardRetreated: ['activeId', 'promotedId'],
  cardSwitched: ['activeId', 'benchId'],
};

// What the Pokémon showed when the command ended; one that left play (a Knock Out) is named as
// it was when the command started.
function shownName(before, after, instanceId) {
  const now = inPlayStack(after, instanceId);
  const stack = now || inPlayStack(before, instanceId);
  return stack ? shownTop(stack)?.name || null : null;
}

// "Charizard evolved onto Charmeleon": the card the new Evolution went onto, not the Basic.
function evolvedOntoName(after, event) {
  const stack = inPlayStack(after, event.targetInstanceId);
  const card = stack?.zone.find(
    (c) => c?.instanceId === event.instanceId && c.attachedTo === stack.root.instanceId
  );
  if (!card) return null;
  const below = evolvedFromCard(stack.zone, stack.root, card);
  return below !== stack.root && !hidden(below) ? below.name || null : null;
}

function namesFor(before, after, event) {
  if (event.type === 'pokemonEvolved') {
    const onto = evolvedOntoName(after, event);
    return onto ? { [event.targetInstanceId]: onto } : null;
  }
  let names = null;
  for (const field of POKEMON_FIELDS[event.type] || []) {
    const name = shownName(before, after, event[field]);
    if (name) names = { ...names, [event[field]]: name };
  }
  return names;
}

/**
 * Adds `pokemonNames: { [rootId]: name }` to each event that names an evolved Pokémon by its
 * root id, in place, so the battle log names the card the players see. Events about unevolved
 * Pokémon are left untouched.
 * @param {object} before the state the command started from
 * @param {object} after the state the command produced
 * @param {object[]} events that command's events
 */
export function stampShownPokemonNames(before, after, events) {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const names = namesFor(before, after, event);
    if (names) event.pokemonNames = names;
  }
}

// A pick among one Pokémon's own cards (its Basic and Evolutions) means each card itself.
const picksAmongStack = (stack, optionIds) =>
  stack.zone.some(
    (c) => c?.attachedTo === stack.root.instanceId && isPokemon(c) && optionIds.has(c.instanceId)
  );

/**
 * Choice options with each evolved in-play Pokémon shown as its top Evolution (name and art)
 * instead of the Basic its id names.
 * @param {object} state
 * @param {object[]} options a PendingChoice's options
 * @returns {object[]}
 */
export function withShownPokemonOptions(state, options) {
  if (!Array.isArray(options)) return options;
  const optionIds = new Set(options.map((option) => option?.instanceId));
  return options.map((option) => {
    if (!option || option.faceDown) return option;
    const stack = inPlayStack(state, option.instanceId);
    const top = stack && shownTop(stack);
    if (!top || picksAmongStack(stack, optionIds)) return option;
    return {
      ...option,
      name: top.name || option.name,
      ...(option.src ? { src: top.src || option.src } : {}),
    };
  });
}
