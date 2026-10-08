// DOM twin of status-loop.mjs: builds and syncs the held-condition loop overlay.
// Only groups whose condition came or went are touched, so a card that gains
// Burn while Poisoned keeps its poison loop running instead of restarting it.
import { STATUS_LOOP_PARTS, loopPartStyle } from './status-loop.mjs';

function div(doc, className) {
  const el = doc.createElement('div');
  el.className = className;
  return el;
}

/** One condition's parts on one layer ('card' or 'sky'), styled from their specs. */
function buildGroup(doc, key, parts) {
  const group = div(doc, `status-fx-loop__group status-fx-loop__group--${key}`);
  for (const spec of parts) {
    const style = loopPartStyle(spec);
    const part = div(doc, `status-fx-loop__part status-fx-part--${spec.sprite}`);
    part.style.cssText = style.part;
    const sheet = div(doc, 'status-fx-loop__sheet');
    sheet.style.cssText = style.sheet;
    part.appendChild(sheet);
    group.appendChild(part);
  }
  return group;
}

/** An empty loop overlay: a card frame (turns with the card) and an upright sky. */
export function createStatusLoop(doc) {
  const loop = div(doc, 'status-fx-loop');
  loop.contentEditable = 'false';
  loop.card = div(doc, 'status-fx-loop__card');
  loop.sky = div(doc, 'status-fx-loop__sky');
  loop.groups = new Map();
  loop.append(loop.card, loop.sky);
  return loop;
}

/** Adds the groups for newly held `keys` and drops those no longer held. */
export function syncStatusLoop(loop, keys, doc) {
  const wanted = new Set(keys);
  for (const [key, groups] of loop.groups) {
    if (wanted.has(key)) continue;
    for (const group of groups) group.parentNode?.removeChild(group);
    loop.groups.delete(key);
  }
  for (const key of keys) {
    const parts = STATUS_LOOP_PARTS[key];
    if (!parts || loop.groups.has(key)) continue;
    const cardGroup = buildGroup(doc, key, parts.filter((p) => p.layer === 'card'));
    const skyGroup = buildGroup(doc, key, parts.filter((p) => p.layer === 'sky'));
    loop.card.appendChild(cardGroup);
    loop.sky.appendChild(skyGroup);
    loop.groups.set(key, [cardGroup, skyGroup]);
  }
}

/**
 * Places the overlay on the footprint from `statusLoopBox`. Part sizes are `em`
 * of the card width, so one font size scales every part.
 */
export function placeStatusLoop(loop, box) {
  loop.style.left = `${box.left}px`;
  loop.style.top = `${box.top}px`;
  loop.style.width = `${box.width}px`;
  loop.style.height = `${box.height}px`;
  loop.style.fontSize = `${box.cardWidth}px`;
  loop.card.style.width = `${box.cardWidth}px`;
  loop.card.style.height = `${box.cardHeight}px`;
  loop.card.style.rotate = `${box.rotation}deg`;
}
