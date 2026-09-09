/**
 * @file Render-order hook for the authoritative renderer (design 002 slice 3.8),
 * mirroring legacy `sort()`'s deck-list ordering
 * (`client/src/actions/zones/general.js`). Injected via
 * `setDefaultNetcodeContext({ sortZoneCards })` in `socket-event-listeners.js` —
 * `apply-view.js` never statically imports this: it reaches `state.js`
 * (module-scope `io()`/`document`), the same browser-only landmine documented
 * for `getZone`/`cardListeners`.
 *
 * Legacy forces deck-list order for hand/discard/lostZone in 2P regardless of
 * the local "Sort" checkbox, because two independently-mutated legacy DOMs
 * would otherwise diverge in visible card order. That reason doesn't apply to
 * the authoritative renderer — both clients already render from the one
 * server-owned view array — but the *visual* behavior (grouped-by-deck-list
 * card order) is kept for parity: a 2P authoritative hand that ignored the
 * checkbox and rendered in raw arrival order would look different from the
 * same zone in legacy mode.
 */
import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';
import { determineDeckData } from '../general/determine-deckdata.js';
import { sortCardsByDeckList } from '/shared/engine/zones/hand-sort.mjs';

const SORTABLE_ZONES = ['hand', 'deck', 'discard', 'lostZone'];
const FORCED_2P_SORT_ZONES = ['hand', 'discard', 'lostZone'];

const CHECKBOX_ID = {
  hand: 'sortHandCheckbox',
  deck: 'sortDeckCheckbox',
  discard: 'sortDiscardCheckbox',
  lostZone: 'sortLostZoneCheckbox',
};

function isSortChecked(user, zoneId) {
  const doc = user === 'self' ? selfContainerDocument : oppContainerDocument;
  const checkbox = doc?.getElementById?.(CHECKBOX_ID[zoneId]);
  return Boolean(checkbox?.checked);
}

/**
 * Reorders a zone's authoritative card array for rendering, without mutating
 * the view. Returns the input array unchanged for zones the checkbox/2P-force
 * logic doesn't apply to, or when no decklist is available.
 *
 * @param {string} side 'you' | 'them' (apply-view.js terminology)
 * @param {string} zoneId
 * @param {object[]} cards
 * @returns {object[]}
 */
export function sortZoneCardsForRender(side, zoneId, cards) {
  if (!SORTABLE_ZONES.includes(zoneId) || !Array.isArray(cards) || cards.length === 0) {
    return cards;
  }

  const user = side === 'you' ? 'self' : 'opp';
  const deckData = determineDeckData(user);
  if (!deckData) return cards;

  const isForced2P = systemState.isTwoPlayer && FORCED_2P_SORT_ZONES.includes(zoneId);
  if (!isForced2P && !isSortChecked(user, zoneId)) return cards;

  return sortCardsByDeckList(cards, deckData);
}
