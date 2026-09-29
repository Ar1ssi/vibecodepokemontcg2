// Design 059: whether an effect shows the cards it takes from the deck to the opponent, and the
// art a public reveal carries so both seats can draw it. Events reach both sockets unfiltered
// (I153), so a hand pick is named only when its printed text reveals it (design 038's rule).
// Pure: no state access; the caller passes the card lookup.

const REVEAL_WORD = /\breveal/i;
// Older printings: "show it to your opponent", "Show both cards to his or her opponent".
const SHOW_TO_OPPONENT = /\bshow\b[^.]*?\bto (?:your|their|his or her) opponent\b/i;

/**
 * @param {string} text printed effect text
 * @returns {boolean} true when the text reveals (or shows the opponent) the cards it takes
 */
export function textRevealsPicks(text) {
  const printed = typeof text === 'string' ? text : '';
  return REVEAL_WORD.test(printed) || SHOW_TO_OPPONENT.test(printed);
}

const abilityTextsOf = (card) =>
  [
    ...(Array.isArray(card?.abilities) ? card.abilities : []).map((ability) =>
      typeof ability === 'string' ? ability : ability?.text || ''
    ),
    typeof card?.abilityText === 'string' ? card.abilityText : '',
  ].filter(Boolean);

/**
 * The printed text behind the executor steps being run: the text the entry point threaded into
 * the context (an Ability's own text), else the Pokémon's Ability texts, else the Trainer or
 * Stadium card's text.
 * @param {{effectType?: string, sourceCard?: object|null, context?: object|null}} source
 * @returns {string}
 */
export function effectTextFor({ effectType, sourceCard, context } = {}) {
  if (typeof context?.effectText === 'string') return context.effectText;
  if (effectType === 'ability') {
    const abilities = abilityTextsOf(sourceCard);
    if (abilities.length > 0) return abilities.join(' ');
  }
  return sourceCard?.text || sourceCard?.effect || sourceCard?.cardText || '';
}

/**
 * A parser that read the step's own sentence (the Ability search) sets `reveal`; that wins.
 * Otherwise the whole effect text decides.
 * @param {object|null} step
 * @param {string} effectText
 * @returns {boolean}
 */
export function stepRevealsPicks(step, effectText) {
  if (typeof step?.reveal === 'boolean') return step.reveal;
  return textRevealsPicks(effectText);
}

/**
 * Adds each revealed card's `src` to the public `cardsRevealed` events, in place. A `peek`
 * (only the player looked) or a `revealedTo` reveal (one player saw it) stays names-only.
 * @param {object[]} events one command's events
 * @param {(instanceId: number) => string|null|undefined} srcOf the card's art, if known
 */
export function stampRevealedArt(events, srcOf) {
  if (!Array.isArray(events) || typeof srcOf !== 'function') return;
  for (const event of events) {
    if (event?.type !== 'cardsRevealed' || event.peek || event.revealedTo != null) continue;
    if (!Array.isArray(event.cards)) continue;
    event.cards = event.cards.map((entry) => {
      if (!entry || typeof entry !== 'object' || entry.src || entry.instanceId == null) return entry;
      const src = srcOf(entry.instanceId);
      return src ? { ...entry, src } : entry;
    });
  }
}
