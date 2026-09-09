/**
 * @file Shared <img> element factory for card visuals (design 002 slice 3.6).
 * The legacy `Card` class and the authoritative renderer (`apply-view.js`)
 * both build through this one function so identity and interaction handlers
 * never drift into two, subtly-different factories — that drift is exactly
 * how the card-identity bug (design 002 N1) happened.
 *
 * Pure DOM construction only: no game state, no `document`/`window` at
 * module scope, so it stays safe to import from Node-testable modules.
 */

/**
 * Builds an <img> element and applies an attribute table to it.
 * Function-valued entries become event listeners; 'user'/'type' become
 * plain element properties; everything else becomes a DOM attribute.
 *
 * @param {Document} doc
 * @param {object} imageAttributes
 * @returns {HTMLImageElement}
 */
export function buildCardImage(doc, imageAttributes) {
  const image = doc.createElement('img');
  for (const attr in imageAttributes) {
    const value = imageAttributes[attr];
    if (typeof value === 'function') {
      image.addEventListener(attr, value);
    } else if (attr === 'user') {
      image.user = value;
    } else if (attr === 'type') {
      image.type = value;
    } else {
      image.setAttribute(attr, value);
    }
  }
  return image;
}
