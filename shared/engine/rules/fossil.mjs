// Fossil Items played as Basic Pokémon: Unidentified / Rare / Antique Fossils and the legacy
// Mysterious, Claw, Root, Helix, Dome, Skull, Armor Fossils and Old Amber. In play the card is a
// Pokémon (so it can evolve and be targeted as one); anywhere else it is the Item again.

// "Play this card as if it were a 60-HP Basic {C} Pokémon" / "… a 60-HP Colorless Basic Pokémon"
// (TCGdex) / "Play Skull Fossil as if it were a Colorless Basic Pokémon" / "… a Basic Pokémon".
const PLAY_AS_POKEMON =
  /play (?:this card|[^.]{1,40}?) as if it were an? (?:(\d+)[- ]hp )?(?:(?:\{c\}|colorless) )?basic (?:(?:\{c\}|colorless) )?pok[eé]mon/i;
const NO_CONDITIONS = /can[’']t be (?:affected by (?:any )?special conditions|asleep, confused, paralyzed, or poisoned)/i;

const DEFAULT_FOSSIL_HP = 60;

// Fields the Item-to-Pokémon change overwrites; restored when the card leaves play. The Item's
// play text is set aside too: the engine reads `text` ahead of `abilities` as a Pokémon's
// Ability text, which hid the Antique Fossils' printed Abilities (Domed Armor, Protective Cover).
const ORIGIN_FIELDS = ['type', 'supertype', 'stage', 'hp', 'types', 'retreatCost', 'text', 'effect'];

const IN_PLAY_ZONES = new Set(['active', 'bench']);

function cardText(card) {
  const source = card?.fossilOrigin || card;
  return [source?.text, source?.effect].flat().filter(Boolean).join(' ');
}

/** The printed "play as a Basic Pokémon" clause: `{ hp }` (hp null when unprinted), or null. */
export function parseFossilPlay(text) {
  const match = String(text || '').match(PLAY_AS_POKEMON);
  if (!match) return null;
  return { hp: match[1] ? Number(match[1]) : null };
}

/**
 * Items that fetch Fossil cards by name (normalized lowercase text):
 *   Fossil Excavation Map FLI 107 — deck mode only; its discard mode needs Choose 1 (I190).
 *   Fossil Excavation Kit FCO 101 — "Put 2 in any combination of Helix Fossil Omanyte, …".
 */
export function parseNamedFossilSearch(lower) {
  const map = String(lower || '').match(
    /^choose 1: search your deck for an? ([a-z' ]+? fossil) card, reveal it, and put it into your hand/
  );
  if (map) return { type: 'searchDeck', what: map[1], count: 1, destination: 'hand', reveal: true };
  const kit = String(lower || '').match(
    /^put (\d+) in any combination of ([^.]*fossil[^.]*?) cards from your discard pile into your hand/
  );
  if (kit) {
    const names = kit[2].replace(/,\s*(?:or\s+)?/g, ' or ');
    return { type: 'recursion', what: names, count: Number(kit[1]), from: 'discard' };
  }
  return null;
}

/** True for a Trainer card whose own text says it is played as a Basic Pokémon. */
export function isFossilItem(card) {
  if (!card) return false;
  if (card.fossilOrigin) return true;
  const trainer = card.supertype === 'Trainer' || /trainer|item/i.test(String(card.type || ''));
  return trainer && parseFossilPlay(cardText(card)) != null;
}

/**
 * Turns a Fossil Item into the Basic {C} Pokémon it is played as. HP: the printed "N-HP"
 * clause, else the card's own printed HP (TCGdex carries it for every fossil), else 60.
 */
export function becomeFossilPokemon(card, { hp = null, turnNumber = null } = {}) {
  if (!card) return card;
  if (!card.fossilOrigin) {
    card.fossilOrigin = Object.fromEntries(ORIGIN_FIELDS.map((f) => [f, card[f] ?? null]));
  }
  const printedHp = parseFossilPlay(cardText(card))?.hp;
  Object.assign(card, {
    type: 'Pokémon',
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: hp || printedHp || Number(card.fossilOrigin.hp) || DEFAULT_FOSSIL_HP,
    types: ['Colorless'],
    retreatCost: [],
    text: null,
    effect: null,
    playedAsPokemon: true,
    fossilCantRetreat: true,
  });
  if (NO_CONDITIONS.test(cardText(card))) card.fossilNoConditions = true;
  if (turnNumber != null) card.enteredPlayTurn = turnNumber;
  return card;
}

/** Restores the Item a fossil was before it was played. */
export function revertFossilPokemon(card) {
  if (!card?.fossilOrigin) return card;
  for (const field of ORIGIN_FIELDS) card[field] = card.fossilOrigin[field];
  delete card.fossilOrigin;
  delete card.playedAsPokemon;
  delete card.fossilCantRetreat;
  delete card.fossilNoConditions;
  return card;
}

/**
 * Post-command sweep: a fossil that left play (discarded, Knocked Out, returned to hand or
 * deck) is the Item again, and its own "can't retreat / no Special Conditions" clauses only
 * bind while nothing has evolved from it.
 */
export function settleFossilCards(state) {
  for (const player of Object.values(state?.players || {})) {
    for (const [zoneId, zone] of Object.entries(player?.zones || {})) {
      if (!Array.isArray(zone)) continue;
      for (const card of zone) {
        if (!card?.fossilOrigin) continue;
        if (!IN_PLAY_ZONES.has(zoneId) || card.attachedTo != null) {
          revertFossilPokemon(card);
          continue;
        }
        // A printed-stats resync (room.mjs cardStats) can write the Item text back.
        if (card.text && !card.fossilOrigin.text) card.fossilOrigin.text = card.text;
        card.text = null;
        card.effect = null;
        const evolved = zone.some(
          (c) => c !== card && c.attachedTo === card.instanceId && (c.stage || c.evolvesFrom)
        );
        card.fossilCantRetreat = !evolved;
        if (evolved) delete card.fossilNoConditions;
        else if (NO_CONDITIONS.test(cardText(card))) card.fossilNoConditions = true;
      }
    }
  }
}
