// Design 037: the persistent Tera crystal skin. Every Tera Pokémon in play wears
// a crystal overlay (blue tint, facet mesh, drifting sheen, rim glow, glints)
// until it leaves play. Reconciled from the last applied view on
// `board-view-applied` (apply-view.js) and `holo-wrapper-changed`
// (hydrate-holo.js); a Tera entry holds the skin back until its reveal so the
// card comes out of the burst already crystal. A card without a holo wrapper
// gets only the CSS rim glow (an <img> cannot hold the layers).
// Styles: css/mat-ambient.css (the cards live in the playmat iframes).
import { fxDisabled } from '../../image-logic/mat-fx.mjs';
import {
  getAuthoritativeZoneArray,
  getCardRegistry,
  hasAuthoritativeView,
} from '../apply-view.js';
import { svgDataUrl } from './entry-art.mjs';
import {
  createSkinReconciler,
  teraSkinFacets,
  teraSkinGlints,
  teraSkinTargets,
} from './tera-skin.mjs';

const SKIN_CLASS = 'fx-tera-crystal';
const LAYER_CLASS = 'fx-tera-crystal__layer';

const skinNodeFor = (record) => {
  const wrapper = record?.holoCard?.wrapper;
  if (wrapper?.isConnected) return wrapper;
  return record?.element?.isConnected ? record.element : null;
};

function layer(doc, name) {
  const el = doc.createElement('div');
  el.className = `${LAYER_CLASS} fx-tera-crystal__${name}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function addWrapperLayers(wrapper, instanceId) {
  const doc = wrapper.ownerDocument;
  const rotator = wrapper.querySelector('.card__rotator');
  if (rotator) {
    const facets = layer(doc, 'facets');
    facets.style.backgroundImage = svgDataUrl(teraSkinFacets(instanceId).svg);
    rotator.append(layer(doc, 'tint'), facets, layer(doc, 'sheen'));
  }
  const aura = layer(doc, 'aura');
  for (const glint of teraSkinGlints(instanceId)) {
    const star = doc.createElement('span');
    star.className = 'fx-tera-crystal__glint';
    star.style.left = `${glint.x}%`;
    star.style.top = `${glint.y}%`;
    star.style.setProperty('--fx-glint-size', String(glint.size));
    star.style.animationDelay = `${glint.delay}s`;
    aura.append(star);
  }
  wrapper.append(aura);
}

function applySkin(node, instanceId) {
  node.classList.add(SKIN_CLASS);
  if (node.classList.contains('mat-holo')) addWrapperLayers(node, instanceId);
}

function removeSkin(node) {
  node.classList.remove(SKIN_CLASS);
  node.querySelectorAll?.(`.${LAYER_CLASS}`).forEach((el) => el.remove());
}

const skins = createSkinReconciler({
  targetIds: (held) =>
    !fxDisabled() && hasAuthoritativeView()
      ? teraSkinTargets(getAuthoritativeZoneArray, held)
      : [],
  nodeFor: (id) => skinNodeFor(getCardRegistry().get(id)),
  apply: applySkin,
  remove: removeSkin,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle),
});

/** Brings every skin in line with the last applied view. */
export const refreshTeraSkins = skins.refresh;

/**
 * Keeps one Pokémon's skin off for `ms` (its entry animation is still hiding
 * the card), then lets the next refresh put it on.
 *
 * @param {unknown} instanceId
 * @param {number} ms
 */
export const holdTeraSkin = skins.hold;

let installed = false;

/** Starts reconciling skins; safe to call more than once. */
export function installTeraSkins() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  for (const name of ['board-view-applied', 'holo-wrapper-changed'])
    document.addEventListener(name, refreshTeraSkins);
  refreshTeraSkins();
}
