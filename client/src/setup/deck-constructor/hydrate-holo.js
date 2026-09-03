import {
  resolveHoloEffect,
  buildHoloCard,
  startHoloAnimation,
  stopHoloAnimation,
} from '../deck-builder/core/holo.mjs';
import { ensureCardData } from '../rules/rules-state.mjs';

const hydrated = new WeakSet();

// The node that should be moved around the DOM for a card:
// its holo wrapper if present, otherwise the bare <img>.
export const cardNode = (card) => card?.wrapper ?? card?.image;

export function hydrateHolo(card) {
  if (!card?.image || hydrated.has(card)) return;
  hydrated.add(card);
  ensureCardData({ name: card.name, type: card.type })
    .then((data) => {
      if (!card.image.isConnected) return; // card was removed meanwhile
      const effect = resolveHoloEffect(data);
      if (!effect) return; // common / non-holo → stays plain
      const width = card.image.clientWidth || 0;
      const wrapper = buildHoloCard(card.image.src, effect);
      wrapper.classList.add('mat-holo');
      if (width) wrapper.style.width = `${width}px`;
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
      startHoloAnimation(wrapper);
    })
    .catch(() => {
      /* rarity unresolved → card stays plain; deck never breaks */
    });
}

export function unhydrateHolo(card) {
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
