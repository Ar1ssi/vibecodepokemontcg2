import { systemState } from '../../front-end.js';
import { isShowingCardBack } from '../deck-builder/core/card-compare.mjs';
import {
  resolveHoloEffect,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { ensureCardData } from '/shared/engine/rules/rules-state.mjs';

const hydrated = new WeakSet();
const pendingHydrations = new WeakMap();

export function cardBackSrcForUser(user) {
  return user === 'self'
    ? systemState.cardBackSrc
    : systemState.isTwoPlayer
      ? systemState.p2OppCardBackSrc
      : systemState.p1OppCardBackSrc;
}

export function isCardHidden(card) {
  if (!card?.image?.src) return false;
  const user = card.user ?? card.image.user;
  return isShowingCardBack(card.image.src, cardBackSrcForUser(user));
}

// Kill-switch: set to false to re-enable mat holofoil rendering.
const HOLO_DISABLED = false;

// The node that should be moved around the DOM for a card:
// its holo wrapper if present, otherwise the bare <img>.
export const cardNode = (card) => card?.wrapper ?? card?.image;

// The node that owns a card's <img> in the zone DOM: the `.mat-holo` wrapper
// if the <img> is nested inside one, otherwise the bare <img> itself. The
// parent of this node is the element to insert sibling cards into (e.g.
// `.play-container`), which keeps attached energies/tools OUTSIDE the
// overflow-hidden `.card__rotator`. Degrades to the bare <img> when the card
// isn't hydrated yet (hydration is async), so this is always safe to call.
export const imageAnchor = (image) =>
  image?.parentElement?.closest?.('.mat-holo') ?? image;

// The element that becomes `.full-view` when a mat card is double-clicked: the
// card's slot in the zone (`.play-container`), which holds the Pokémon plus its
// attached energies/tools. Always go through `imageAnchor` — for a holo card the
// <img>'s own parent is the overflow-hidden `.card__rotator`, and sizing THAT as
// the enlarged view shrinks the card instead of growing it.
export const fullViewHost = (image) => imageAnchor(image)?.parentElement ?? null;

export const isInFullView = (image) =>
  !!fullViewHost(image)?.classList.contains('full-view');

export function hydrateHolo(card) {
  if (HOLO_DISABLED) return Promise.resolve(null);
  if (!card?.image || isCardHidden(card)) return Promise.resolve(null);
  if (card.wrapper) return Promise.resolve(card.wrapper);

  const pending = pendingHydrations.get(card);
  if (pending) {
    // Re-arm a hydration that unhydrateHolo cancelled while it was in flight.
    hydrated.add(card);
    return pending;
  }

  const promise = ensureCardData({
    id: card.id,
    name: card.name,
    type: card.type,
    set: card.set,
    number: card.number,
    image: card.image,
  })
    .then((data) => {
      // unhydrateHolo ran while card data was loading (e.g. the card went
      // under an evolution): the card no longer wants a foil.
      if (!hydrated.has(card)) return null;
      if (!card.image.isConnected || isCardHidden(card)) {
        hydrated.delete(card);
        return null;
      }
      if (card.wrapper) return card.wrapper;

      const effect = resolveHoloEffect(data);
      if (!effect) {
        hydrated.delete(card);
        return null;
      }

      const wrapper = buildHoloCard(card.image.src, effect);
      // No inline px size: every zone sizes `.mat-holo` in CSS. A px snapshot
      // taken in the hand (1x) is wrong inside the zoom:2 #playfield, and
      // inline styles outrank those zone rules.
      wrapper.classList.add('mat-holo');
      const rotator = wrapper.querySelector('.card__rotator');
      // Where the <img> currently sits in its zone (captured BEFORE moving it).
      const { parentElement, nextSibling } = card.image;
      // Move the REAL <img> (all listeners/props intact) into the rotator,
      // then drop buildHoloCard's duplicate <img>.
      rotator.insertBefore(card.image, rotator.firstChild);
      rotator
        .querySelectorAll('img')
        .forEach((el) => {
          if (el !== card.image) el.remove();
        });
      // Place the wrapper where the <img> used to sit in its zone.
      if (nextSibling) parentElement.insertBefore(wrapper, nextSibling);
      else parentElement.appendChild(wrapper);
      card.wrapper = wrapper;
      // Hand/mat cards have no reliable real cursor to track (native drag
      // suppresses pointermove, and cards often just sit still) — auto-play
      // a continuous left-to-right sweep without tilting the card.
      startHoloAnimation(wrapper, { auto: true, tilt: false });
      return wrapper;
    })
    .catch(() => {
      hydrated.delete(card);
      return null;
    })
    .finally(() => {
      pendingHydrations.delete(card);
    });

  hydrated.add(card);
  pendingHydrations.set(card, promise);
  return promise;
}

export function unhydrateHolo(card) {
  if (card) hydrated.delete(card);
  const wrapper = card?.wrapper;
  if (!wrapper) return;
  stopHoloAnimation(wrapper);
  const img = card.image;
  if (img.isConnected && img.parentElement === wrapper.querySelector('.card__rotator')) {
    const { parentElement, nextSibling } = wrapper;
    if (nextSibling) parentElement.insertBefore(img, nextSibling);
    else parentElement.appendChild(img);
  }
  wrapper.remove();
  card.wrapper = undefined;
  hydrated.delete(card);
}
