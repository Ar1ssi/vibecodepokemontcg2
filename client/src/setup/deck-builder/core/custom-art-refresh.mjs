// Live custom-set art in the deck builder (design 075 live sets). A browser reuses an image this page already
// showed for the same URL, so after the server reloads a set its cards keep their old faces until a reload. Once a
// set changes, every <img> of that set under the builder's roots, shown now or drawn later, points at
// versionedCustomArtUrl (`?v=`), which the browser fetches anew. The game board is left alone: its image URLs travel
// through netcode, and a card in play keeps the face it was dealt with.
import { onCustomSetsChanged, versionedCustomArtUrl } from '../../../../../shared/tcgdex/custom-sets.mjs';

/** Points one image at its set's latest art. @returns {boolean} whether its src changed */
export function versionCustomArtImage(img) {
  const src = img?.getAttribute?.('src');
  if (!src) return false;
  const next = versionedCustomArtUrl(src);
  if (next === src) return false;
  img.setAttribute('src', next);
  return true;
}

/** Every image at or under `node`. @returns {number} how many changed */
export function versionCustomArtIn(node) {
  if (!node || node.nodeType !== 1) return 0;
  let changed = 0;
  if (node.tagName === 'IMG' && versionCustomArtImage(node)) changed += 1;
  for (const img of node.querySelectorAll?.('img') ?? []) {
    if (versionCustomArtImage(img)) changed += 1;
  }
  return changed;
}

/**
 * Keeps custom-set art under `roots` current from the first change notice on. Until a set changes nothing is
 * observed: the plain URLs are already current.
 * @param {(Element|null)[]} roots
 * @param {{ MutationObserverImpl?: typeof MutationObserver, subscribe?: typeof onCustomSetsChanged }} [options]
 * @returns {() => void} stop
 */
export function watchCustomArt(roots, { MutationObserverImpl = globalThis.MutationObserver, subscribe = onCustomSetsChanged } = {}) {
  const targets = roots.filter(Boolean);
  let observer = null;
  const observe = () => {
    if (observer || typeof MutationObserverImpl !== 'function') return;
    observer = new MutationObserverImpl((records) => {
      for (const record of records) {
        if (record.type === 'attributes') versionCustomArtImage(record.target);
        else record.addedNodes.forEach(versionCustomArtIn);
      }
    });
    for (const root of targets) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  };
  const unsubscribe = subscribe(() => {
    targets.forEach(versionCustomArtIn);
    observe();
  });
  return () => {
    unsubscribe();
    observer?.disconnect();
    observer = null;
  };
}
