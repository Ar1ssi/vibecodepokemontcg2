/**
 * @file The whole pile a pick is made from, for the card picker's VALID / ALL tabs.
 *
 * A PendingChoice offers only the cards that can be picked. Searching your deck lets you look
 * at all of it, and a discard pile is public, so the chooser may see the rest of that pile
 * too. A "look at the top N" pick also offers deck cards but must not reveal the rest, so the
 * deck is only shown for a choice that comes from a deck search.
 */

const toViewCard = (card) => ({
  instanceId: card.instanceId,
  name: card.name || '',
  src: card.src || '',
  type: card.type || '',
});

const SEARCH_STEP = /search/i;
const LOOK_STEP = /look/i;

/**
 * Whether the step that asked searches the whole deck (trainer, ability and attack steps run by
 * the executor, an attack's search stages, or a Special Energy's search plan).
 *
 * @param {object} [token] the choice's resumeToken
 */
export function isDeckSearchToken(token) {
  if (!token) return false;
  if (Array.isArray(token.searchStages)) return true;
  if (token.queue?.[token.index]?.plan?.action === 'search') return true;
  const type = String(token.steps?.[token.stepIndex]?.type || '');
  return SEARCH_STEP.test(type) && !LOOK_STEP.test(type);
}

const holdsAll = (zone, ids) => ids.every((id) => zone.some((card) => card?.instanceId === id));

/**
 * `{ zone: 'deck' | 'discard', cards }` — the pile every option of `choice` comes from, in pile
 * order — or null when the options span piles, are face down, already are the whole pile, or
 * come from a deck the chooser is not searching.
 *
 * @param {object} state GameState
 * @param {object} choice PendingChoice
 * @returns {{ zone: string, cards: object[] } | null}
 */
export function choiceZoneView(state, choice) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  if (options.length === 0 || options.some((opt) => opt?.faceDown)) return null;
  const ids = options.map((opt) => opt.instanceId);
  const chooser = state?.players?.[choice.player];
  if (!chooser) return null;

  const deck = chooser.zones?.deck || [];
  if (deck.length > ids.length && holdsAll(deck, ids) && isDeckSearchToken(choice.resumeToken)) {
    return { zone: 'deck', cards: deck.map(toViewCard) };
  }

  for (const player of Object.values(state.players)) {
    const discard = player?.zones?.discard || [];
    if (discard.length > ids.length && holdsAll(discard, ids)) {
      return { zone: 'discard', cards: discard.map(toViewCard) };
    }
  }
  return null;
}

/** A copy of `choice` for its chooser, carrying `zoneView` when there is one. */
export function choiceForChooser(state, choice) {
  const copy = JSON.parse(JSON.stringify(choice));
  const zoneView = choiceZoneView(state, choice);
  if (zoneView) copy.zoneView = zoneView;
  return copy;
}
