/**
 * @file Maps a server PendingChoice whose options are all in-play Pokémon, all face-down Prize
 * cards, or the hand cards of a Prize swap (Peonia), onto the mat picker (the legacy
 * click-the-card UI, D19).
 *
 * Pure and DOM-free so it runs under `node --test`; the browser adapter
 * (`mat-picker-adapter.js`) only forwards the result to `openMatPick`. The
 * registry is apply-view.js's `cardRegistry` (instanceId -> rendered record),
 * passed in so this module never touches the DOM itself.
 */

import { getPrintingKey } from '../../../../shared/engine/zones/hand-stack.mjs';

const PLAY_ZONES = new Set(['active', 'bench']);

const clampCount = (value, fallback) =>
  Number.isInteger(value) && value >= 0 ? value : fallback;

// An in-play Pokémon root: a board-zone card that is not attached under another
// card. Attached Energy/Tools share the zone array but are not mat targets (the
// hit-test would resolve an attachment click to its host, i.e. the wrong id).
function isInPlayPokemon(record) {
  if (!record?.element || !PLAY_ZONES.has(record.zone)) return false;
  return record.card?.attachedTo == null;
}

// A blind Prize pick (Peonia, Gladion): the options are face-down Prize cards, so the player clicks
// the Prize card itself rather than choosing among identical card backs in a menu. A Prize option
// the owner has looked at carries its name and art, and keeps the menu that shows what it is.
function isBlindPrize(record, option) {
  return option?.faceDown === true && Boolean(record?.element) && record.zone === 'prizes';
}

// The Prize swap step (Peonia, Gladion) asks twice: Prize cards into the hand, then hand cards set
// back as Prizes. Both picks carry that step in the resume token.
function isPrizeSwapChoice(choice) {
  const token = choice?.resumeToken;
  return token?.steps?.[token.stepIndex]?.type === 'prizeToHand';
}

// A hand card on the mat. Only the Prize swap's hand pick is made there: every other hand pick
// keeps the card carousel.
function isHandCard(record) {
  return Boolean(record?.element) && record.zone === 'hand';
}

/**
 * @param {object} choice PendingChoice from the authoritative view
 * @param {Map<number, {instanceId:number, element:any, zone:string, card?:object, holoCard?:object}>} registry
 * @returns {{title:string, candidates:Array, cancellable:boolean, min:number, max:number}|null}
 *   mat-picker args, or null when the choice is not an in-play-Pokémon pick.
 */
export function buildMatPickerRequest(choice, registry) {
  const options = Array.isArray(choice?.options) ? choice.options : [];
  if (options.length === 0) return null;

  const records = options.map((opt) => registry?.get?.(opt.instanceId));
  // All in-play Pokémon, all blind Prize cards, or the Prize swap's hand cards: a mixed set has no
  // single thing to click.
  const pickingPrizes = options.every((opt, i) => isBlindPrize(records[i], opt));
  const pickingSwapHand = !pickingPrizes && isPrizeSwapChoice(choice) && records.every(isHandCard);
  if (!pickingPrizes && !pickingSwapHand && !records.every(isInPlayPokemon)) {
    return null;
  }

  const minRaw = clampCount(choice.min, 1);
  const maxRaw = clampCount(choice.max, 1);
  const min = Math.min(minRaw, options.length);
  // The mat picker toggles cards and confirms; a multi-pick is allowed here, so
  // the same request shape covers both single-click and choose-N choices.
  const max = Math.max(min, Math.min(Math.max(maxRaw, 1), options.length));

  return {
    title: choice.prompt || (pickingPrizes ? 'Choose a Prize card' : pickingSwapHand ? 'Choose a card from your hand' : 'Choose a Pokémon'),
    candidates: records.map((record, i) => ({
      instanceId: record.instanceId ?? options[i].instanceId,
      name: record.card?.name || options[i].name || '',
      image: record.element,
      wrapper: record.holoCard?.wrapper,
      // Copies of one printing stack in the hand on a shared click target (planMatToggle).
      ...(pickingSwapHand ? { stackKey: `${record.card?.name || options[i].name || ''}|${getPrintingKey(record.card)}` } : {}),
    })),
    // A required pick (min ≥ 1) cannot be declined; only an optional choice gets
    // the Cancel affordance and reports an empty selection.
    cancellable: min === 0,
    min,
    max,
  };
}
