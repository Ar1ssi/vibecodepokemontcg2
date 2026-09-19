/**
 * Click-on-the-real-mat picker, extracted from trainer-execution.js so the
 * server-authoritative netcode path (choice-picker-adapter / mat-picker-adapter)
 * can reuse the exact same UI and hit-testing as legacy rules mode (D19).
 *
 * A candidate is an in-play Pokémon whose live `card.image` DOM node is outlined
 * (holo-wrapper aware) and resolved on a capture-phase document click, across the
 * top document and both playmat iframe documents. Resolving reports the picked
 * candidate; it never moves anything (the server/legacy caller owns the move).
 *
 * Single-pick (`max <= 1`) resolves on the first click. Multi-pick (`max > 1`)
 * toggles cards and requires a Confirm click, enforcing `min..max` selections.
 */

import { imageAnchor } from '../deck-constructor/hydrate-holo.js';
import { buildMatPickEntry, findMatPickHit } from './mat-pick.mjs';
import {
  selfContainer,
  oppContainer,
  selfContainerDocument,
  oppContainerDocument,
} from '../../state.js';

let activeMatPick = null;

const OUTLINE_IDLE = '#ffd23f';
const OUTLINE_SELECTED = '#38d66b';

/**
 * Silently tears down any mat pick currently open (idempotent), without invoking
 * its onCancel. Used when a server choice clears or passes to the opponent, or a
 * new pick supersedes the old — the caller must not report a decline there. A
 * real user decline goes through the Cancel button / Escape inside openMatPick.
 */
export function dismissMatPick() {
  activeMatPick?.dismiss();
}

/**
 * Highlights the candidate cards on the mat and reports the picked card(s).
 *
 * @param {object}   params
 * @param {string}   params.title
 * @param {Array<{instanceId:number, name?:string, image:any, wrapper?:any}>} params.candidates
 * @param {(card:any)=>void} [params.onPick] single-pick resolve (`max <= 1`)
 * @param {(cards:any[])=>void} [params.onConfirm] multi-pick resolve (`max > 1`)
 * @param {()=>void} [params.onCancel]
 * @param {boolean}  [params.cancellable=true] false hides Cancel and ignores Escape
 *   (a required server choice cannot be declined).
 * @param {number}   [params.min=1]
 * @param {number}   [params.max=1]
 */
export function openMatPick({
  title,
  candidates,
  onPick,
  onConfirm,
  onCancel,
  cancellable = true,
  min = 1,
  max = 1,
}) {
  dismissMatPick();

  const entries = (candidates || [])
    .map((c) => buildMatPickEntry(c, imageAnchor))
    .filter((e) => e.targetEl || e.img);
  if (!entries.length) {
    onCancel?.();
    return;
  }

  const minCount = Number.isInteger(min) && min > 0 ? min : 1;
  const maxCount =
    Number.isInteger(max) && max >= minCount ? max : minCount;
  const multiSelect = maxCount > 1 && typeof onConfirm === 'function';

  const banner = document.createElement('div');
  banner.className = 'mat-pick-banner';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',
    background: 'rgba(20, 20, 24, 0.92)',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
  });
  const label = document.createElement('span');
  label.textContent = title;
  banner.append(label);

  const countLabel = multiSelect ? document.createElement('span') : null;
  if (countLabel) {
    countLabel.className = 'mat-pick-count';
    Object.assign(countLabel.style, { opacity: '0.85' });
    banner.appendChild(countLabel);
  }

  const buttonStyle = {
    background: '#3a3a42',
    color: '#fff',
    border: '1px solid #55555f',
    borderRadius: '5px',
    padding: '3px 10px',
    cursor: 'pointer',
  };

  let confirmBtn = null;
  if (multiSelect) {
    confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Confirm';
    Object.assign(confirmBtn.style, buttonStyle);
    banner.appendChild(confirmBtn);
  }

  let cancelBtn = null;
  if (cancellable) {
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, buttonStyle);
    banner.appendChild(cancelBtn);
  }
  document.body.appendChild(banner);

  const restoreElements = new Map();
  const getRestore = (el) => {
    if (!restoreElements.has(el)) {
      restoreElements.set(el, {
        outline: el.style?.outline,
        outlineOffset: el.style?.outlineOffset,
        cursor: el.style?.cursor,
        draggable: el.draggable,
        matPick: el.dataset?.matPick,
      });
    }
    return restoreElements.get(el);
  };

  const paint = (entry, selected) => {
    const color = selected ? OUTLINE_SELECTED : OUTLINE_IDLE;
    for (const el of [entry.targetEl, entry.img]) {
      if (!el?.style) continue;
      el.style.outline = `4px solid ${color}`;
      el.style.outlineOffset = '2px';
    }
  };

  for (const entry of entries) {
    const { targetEl, img } = entry;
    if (targetEl) {
      getRestore(targetEl);
      if (targetEl.style) targetEl.style.cursor = 'pointer';
      targetEl.dataset.matPick = '1';
    }
    if (img) {
      getRestore(img);
      if (img.style && img !== targetEl) img.style.cursor = 'pointer';
      img.draggable = false;
      img.dataset.matPick = '1';
    }
    paint(entry, false);
  }

  const selected = new Set();
  const updateCount = () => {
    if (countLabel)
      countLabel.textContent = `(${selected.size}/${maxCount})`;
    if (confirmBtn)
      confirmBtn.disabled = selected.size < minCount || selected.size > maxCount;
  };
  updateCount();

  const toggle = (card) => {
    const entry = entries.find((e) => e.card === card);
    if (!entry) return;
    if (selected.has(card)) {
      selected.delete(card);
      paint(entry, false);
    } else {
      if (selected.size >= maxCount) return;
      selected.add(card);
      paint(entry, true);
    }
    updateCount();
  };

  const targetDocs = new Set();
  if (typeof document !== 'undefined' && document) targetDocs.add(document);
  try {
    if (selfContainerDocument) targetDocs.add(selfContainerDocument);
  } catch {
    /* cross-realm access can throw; skip that document/element */
  }
  try {
    if (oppContainerDocument) targetDocs.add(oppContainerDocument);
  } catch {
    /* cross-realm access can throw; skip that document/element */
  }
  try {
    if (selfContainer?.contentWindow?.document)
      targetDocs.add(selfContainer.contentWindow.document);
  } catch {
    /* cross-realm access can throw; skip that document/element */
  }
  try {
    if (oppContainer?.contentWindow?.document)
      targetDocs.add(oppContainer.contentWindow.document);
  } catch {
    /* cross-realm access can throw; skip that document/element */
  }

  for (const entry of entries) {
    if (entry.targetEl?.ownerDocument)
      targetDocs.add(entry.targetEl.ownerDocument);
    if (entry.img?.ownerDocument) targetDocs.add(entry.img.ownerDocument);
    if (entry.container?.ownerDocument)
      targetDocs.add(entry.container.ownerDocument);
  }

  const directTargets = new Set();
  for (const entry of entries) {
    if (entry.targetEl) directTargets.add(entry.targetEl);
    if (entry.img) directTargets.add(entry.img);
    if (entry.container) directTargets.add(entry.container);
  }

  let resolved = false;
  const finishOne = (card) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    onPick?.(card);
  };
  const confirm = () => {
    if (resolved) return;
    if (selected.size < minCount || selected.size > maxCount) return;
    const cards = entries
      .filter((e) => selected.has(e.card))
      .map((e) => e.card);
    resolved = true;
    cleanup();
    onConfirm(cards);
  };
  const cancel = () => {
    if (resolved) return;
    resolved = true;
    cleanup();
    onCancel?.();
  };
  const dismiss = () => {
    if (resolved) return;
    resolved = true;
    cleanup();
  };

  const handleHit = (hitCard) => {
    if (!hitCard) return;
    if (multiSelect) toggle(hitCard);
    else finishOne(hitCard);
  };

  const onDocClick = (event) => {
    if (banner.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      if (confirmBtn && event.target === confirmBtn) confirm();
      else if (cancelBtn && event.target === cancelBtn) cancel();
      return;
    }
    const hitCard = findMatPickHit(entries, event.target);
    event.preventDefault();
    event.stopPropagation();
    handleHit(hitCard);
  };

  const onDirectClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hitCard =
      findMatPickHit(entries, event.currentTarget) ||
      findMatPickHit(entries, event.target);
    handleHit(hitCard);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && cancellable) {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && multiSelect) {
      event.preventDefault();
      confirm();
    }
  };

  const cleanup = () => {
    if (activeMatPick?.cancel === cancel) activeMatPick = null;
    for (const doc of targetDocs) {
      try {
        doc.removeEventListener('click', onDocClick, true);
        doc.removeEventListener('keydown', onKeyDown, true);
      } catch {
        /* cross-realm access can throw; skip that document/element */
      }
    }
    for (const el of directTargets) {
      try {
        el.removeEventListener('click', onDirectClick, true);
      } catch {
        /* cross-realm access can throw; skip that document/element */
      }
    }
    banner.remove();
    for (const [el, saved] of restoreElements) {
      if (el.style) {
        if (saved.outline !== undefined) el.style.outline = saved.outline;
        if (saved.outlineOffset !== undefined)
          el.style.outlineOffset = saved.outlineOffset;
        if (saved.cursor !== undefined) el.style.cursor = saved.cursor;
      }
      if (saved.draggable !== undefined) {
        el.draggable = saved.draggable;
      }
      if (el.dataset) {
        if (saved.matPick !== undefined) el.dataset.matPick = saved.matPick;
        else delete el.dataset.matPick;
      }
    }
  };

  for (const doc of targetDocs) {
    try {
      doc.addEventListener('click', onDocClick, true);
      doc.addEventListener('keydown', onKeyDown, true);
    } catch {
      /* cross-realm access can throw; skip that document/element */
    }
  }

  for (const el of directTargets) {
    try {
      el.addEventListener('click', onDirectClick, true);
    } catch {
      /* cross-realm access can throw; skip that document/element */
    }
  }

  activeMatPick = { cancel, dismiss };
}
