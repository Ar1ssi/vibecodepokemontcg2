// Custom sets (design 075): cards made in the cardback editor, stored in this repo under
// client/src/assets/custom-sets/<setId>/set.json and served by the TCGdex proxy as if TCGdex
// published them. This module is the one definition of what a valid set.json is; the server
// (server/custom-sets.mjs), the check script (scripts/custom-sets/check.mjs) and the tests all
// read it. Pure: no fs, no network.

export const CUSTOM_SET_DATA_FORMAT = 'ptcg-sim.custom-set-data';
export const CUSTOM_SET_DATA_VERSION = 1;
export const CUSTOM_SET_ID_PREFIX = 'custom';
export const CUSTOM_SETS_IMAGE_ROOT = '/src/assets/custom-sets';

// Set ids never collide with TCGdex: no TCGdex set id starts with "custom". One dash per card id,
// since several helpers split a card id at its dash.
export const CUSTOM_SET_ID_RE = /^custom[a-z0-9]{2,5}$/;
export const CUSTOM_SET_CODE_RE = /^[A-Z0-9]{2,5}$/;
export const CUSTOM_CARD_ID_RE = /^(custom[a-z0-9]{2,5})-([0-9]{3})$/;
const LOCAL_ID_RE = /^[0-9]{3}$/;

export const ENERGY_TYPES = Object.freeze([
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Dragon',
  'Colorless',
]);
export const POKEMON_STAGES = Object.freeze(['Basic', 'Stage1', 'Stage2']);
export const TRAINER_TYPES = Object.freeze(['Item', 'Supporter', 'Stadium', 'Tool']);
// Energy is out of scope (design 075): decks use official Energy, the editor exports none.
export const CARD_CATEGORIES = Object.freeze(['Pokemon', 'Trainer']);
// Which deck-builder pill lists the set: "custom" (the Custom pill, the default when absent) or
// "homebrew" (the Homebrew sets pill).
export const CUSTOM_SET_GROUPS = Object.freeze(['custom', 'homebrew']);
export const DEFAULT_CUSTOM_SET_GROUP = 'custom';

const MAX_NAME = 60;
const MAX_ATTACKS = 4;
const MAX_ABILITIES = 2;
const MAX_COST = 5;
export const MAX_CARDS = 999;
// A set.json is a few hundred KB at most; anything bigger is a mistake, not a set (the server skips it, the bucket
// index refuses it).
export const MAX_SET_JSON_BYTES = 4 << 20;
// Socket.IO broadcast when the server reloads changed set folders: `{ version, sets: [setId] }`.
export const CUSTOM_SETS_CHANGED_EVENT = 'customSetsChanged';

export function isCustomSetId(id) {
  return typeof id === 'string' && CUSTOM_SET_ID_RE.test(id);
}

export function isCustomCardId(id) {
  return typeof id === 'string' && CUSTOM_CARD_ID_RE.test(id);
}

/** The printed set code for a set id: "customhbw" → "HBW". */
export function setCodeForId(setId) {
  return String(setId).slice(CUSTOM_SET_ID_PREFIX.length).toUpperCase();
}

/** TCGdex-style image base (no "/high.webp") for a custom card. */
export function customCardImageBase(setId, localId) {
  return `${CUSTOM_SETS_IMAGE_ROOT}/${setId}/${localId}`;
}

const isText = (value, max = MAX_NAME) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isInt = (value) => Number.isInteger(value);

function checkTypes(list, where, errors) {
  if (!Array.isArray(list)) {
    errors.push(`${where}: expected a list of Energy types`);
    return;
  }
  for (const type of list) {
    if (!ENERGY_TYPES.includes(type)) errors.push(`${where}: unknown Energy type ${JSON.stringify(type)}`);
  }
}

function checkSide(side, where, errors) {
  if (!side || typeof side !== 'object' || Array.isArray(side) || !ENERGY_TYPES.includes(side.type) || typeof side.value !== 'string') {
    errors.push(`${where}: expected {type: <Energy type>, value: "×2" | "-30" | …}`);
  }
}

function checkAttacks(attacks, where, errors) {
  if (attacks === undefined) return;
  if (!Array.isArray(attacks)) {
    errors.push(`${where}: expected a list`);
    return;
  }
  if (attacks.length > MAX_ATTACKS) errors.push(`${where}: at most ${MAX_ATTACKS} attacks`);
  attacks.forEach((attack, i) => {
    const at = `${where}[${i}]`;
    if (!attack || typeof attack !== 'object') {
      errors.push(`${at}: expected an object`);
      return;
    }
    if (!isText(attack.name)) errors.push(`${at}.name: required, at most ${MAX_NAME} characters`);
    checkTypes(attack.cost ?? [], `${at}.cost`, errors);
    if (Array.isArray(attack.cost) && attack.cost.length > MAX_COST) errors.push(`${at}.cost: at most ${MAX_COST}`);
    if (attack.effect !== undefined && typeof attack.effect !== 'string') errors.push(`${at}.effect: expected text`);
    const damage = attack.damage;
    const damageOk =
      damage === undefined || damage === '' || isInt(damage) || (typeof damage === 'string' && /^\d{1,4}[+×x\-−]?$/.test(damage));
    if (!damageOk) errors.push(`${at}.damage: a number, optionally followed by +, × or -`);
  });
}

function checkAbilities(abilities, where, errors) {
  if (abilities === undefined) return;
  if (!Array.isArray(abilities)) {
    errors.push(`${where}: expected a list`);
    return;
  }
  if (abilities.length > MAX_ABILITIES) errors.push(`${where}: at most ${MAX_ABILITIES} abilities`);
  abilities.forEach((ability, i) => {
    const at = `${where}[${i}]`;
    if (!ability || typeof ability !== 'object') {
      errors.push(`${at}: expected an object`);
      return;
    }
    if (!isText(ability.name)) errors.push(`${at}.name: required`);
    if (!isText(ability.effect, 1000)) errors.push(`${at}.effect: required`);
    if (ability.type !== undefined && typeof ability.type !== 'string') errors.push(`${at}.type: expected text`);
  });
}

function checkPokemon(card, where, errors) {
  if (!isInt(card.hp) || card.hp < 10 || card.hp > 990 || card.hp % 10 !== 0) {
    errors.push(`${where}.hp: a multiple of 10 from 10 to 990`);
  }
  checkTypes(card.types, `${where}.types`, errors);
  if (Array.isArray(card.types) && card.types.length === 0) errors.push(`${where}.types: at least one type`);
  if (!POKEMON_STAGES.includes(card.stage)) errors.push(`${where}.stage: one of ${POKEMON_STAGES.join(', ')}`);
  if (card.stage !== 'Basic' && !isText(card.evolveFrom)) errors.push(`${where}.evolveFrom: required for an evolution`);
  if (card.suffix !== undefined && typeof card.suffix !== 'string') errors.push(`${where}.suffix: expected text`);
  checkAttacks(card.attacks, `${where}.attacks`, errors);
  checkAbilities(card.abilities, `${where}.abilities`, errors);
  for (const side of ['weaknesses', 'resistances']) {
    if (card[side] === undefined) continue;
    if (!Array.isArray(card[side])) errors.push(`${where}.${side}: expected a list`);
    else card[side].forEach((entry, i) => checkSide(entry, `${where}.${side}[${i}]`, errors));
  }
  if (card.retreat !== undefined && (!isInt(card.retreat) || card.retreat < 0 || card.retreat > 5)) {
    errors.push(`${where}.retreat: a whole number from 0 to 5`);
  }
}

function checkTrainer(card, where, errors) {
  if (!TRAINER_TYPES.includes(card.trainerType)) errors.push(`${where}.trainerType: one of ${TRAINER_TYPES.join(', ')}`);
  if (typeof card.effect !== 'string') errors.push(`${where}.effect: expected text`);
  if (card.hp !== undefined && card.hp !== null && (!isInt(card.hp) || card.hp % 10 !== 0)) {
    errors.push(`${where}.hp: a multiple of 10 (fossils and dolls only)`);
  }
  checkAttacks(card.attacks, `${where}.attacks`, errors);
  checkAbilities(card.abilities, `${where}.abilities`, errors);
}

function checkCard(card, setId, where, errors, seenLocalIds) {
  if (!card || typeof card !== 'object') {
    errors.push(`${where}: expected an object`);
    return;
  }
  if (typeof card.localId !== 'string' || !LOCAL_ID_RE.test(card.localId)) {
    errors.push(`${where}.localId: three digits, like "001"`);
    return;
  }
  if (seenLocalIds.has(card.localId)) errors.push(`${where}.localId: ${card.localId} is used twice`);
  else seenLocalIds.add(card.localId);
  if (card.id !== `${setId}-${card.localId}`) errors.push(`${where}.id: expected "${setId}-${card.localId}"`);
  if (!isText(card.name)) errors.push(`${where}.name: required, at most ${MAX_NAME} characters`);
  if (!CARD_CATEGORIES.includes(card.category)) errors.push(`${where}.category: one of ${CARD_CATEGORIES.join(', ')}`);
  const image = customCardImageBase(setId, card.localId);
  if (card.image !== image) errors.push(`${where}.image: expected "${image}"`);
  if (card.category === 'Pokemon') checkPokemon(card, where, errors);
  if (card.category === 'Trainer') checkTrainer(card, where, errors);
}

/**
 * Validates one set.json document.
 * @param {unknown} json parsed file content
 * @param {{ setDirName?: string, reservedCodes?: Iterable<string> }} [options] folder the file lives in (must equal
 *   the set id); set codes decklists already use for printed sets (a custom code must not shadow one)
 * @returns {{ ok: boolean, errors: string[], set: object|null }}
 */
export function validateCustomSet(json, { setDirName, reservedCodes = [] } = {}) {
  const errors = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['set.json: expected a JSON object'], set: null };
  }
  if (json.format !== CUSTOM_SET_DATA_FORMAT) errors.push(`format: expected "${CUSTOM_SET_DATA_FORMAT}"`);
  if (json.version !== CUSTOM_SET_DATA_VERSION) errors.push(`version: expected ${CUSTOM_SET_DATA_VERSION}`);
  if (!isCustomSetId(json.id)) errors.push(`id: "custom" followed by 2–5 lowercase letters or digits`);
  else if (setDirName !== undefined && setDirName !== json.id) errors.push(`id: ${json.id} but the folder is ${setDirName}`);
  if (typeof json.code !== 'string' || !CUSTOM_SET_CODE_RE.test(json.code)) errors.push('code: 2–5 capital letters or digits');
  else if (isCustomSetId(json.id) && json.code !== setCodeForId(json.id)) {
    errors.push(`code: expected ${setCodeForId(json.id)} for set id ${json.id}`);
  } else if (new Set(reservedCodes).has(json.code)) {
    errors.push(`code: ${json.code} is a printed set's decklist code; pick another`);
  }
  if (!isText(json.name)) errors.push(`name: required, at most ${MAX_NAME} characters`);
  if (json.releaseDate !== undefined && (typeof json.releaseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(json.releaseDate))) {
    errors.push('releaseDate: YYYY-MM-DD');
  }
  if (json.group !== undefined && !CUSTOM_SET_GROUPS.includes(json.group)) {
    errors.push(`group: one of ${CUSTOM_SET_GROUPS.join(', ')}`);
  }
  if (!Array.isArray(json.cards) || json.cards.length === 0) errors.push('cards: at least one card');
  else if (json.cards.length > MAX_CARDS) errors.push(`cards: at most ${MAX_CARDS}`);
  else if (isCustomSetId(json.id)) {
    const seen = new Set();
    json.cards.forEach((card, i) => checkCard(card, json.id, `cards[${i}]`, errors, seen));
  }
  return { ok: errors.length === 0, errors, set: errors.length === 0 ? json : null };
}
