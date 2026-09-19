/**
 * Click-on-the-real-mat picker, extracted from trainer-execution.js so the
 * server-authoritative netcode path (choice-picker-adapter / mat-picker-adapter)
 * can reuse the exact same UI and hit-testing as legacy rules mode (D19).
 *
 * A candidate is an in-play Pokémon whose live `card.image` DOM node is outlined
 * (holo-wrapper aware) and resolved on a capture-phase document click, across the
 * top document and both playmat iframe documents. Resolving reports the picked
 * candidate; it never moves anything (the server/legacy caller owns the move).
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
 * Highlights the candidate cards on the mat and resolves on the first click.
 *
 * @param {object}   params
 * @param {string}   params.title
 * @param {Array<{instanceId:number, name?:string, image:any, wrapper?:any}>} params.candidates
 * @param {(card:any)=>void} params.onPick
 * @param {()=>void} [params.onCancel]
 * @param {boolean}  [params.cancellable=true] false hides Cancel and ignores Escape
 *   (a required server choice cannot be declined).
 */
export function openMatPick({
  title,
  candidates,
  onPick,
  onCancel,
  cancellable = true,
}) {
  dismissMatPick();

  const entries = (candidates || [])
    .map((c) => buildMatPickEntry(c, imageAnchor))
    .filter((e) => e.targetEl || e.img);
  if (!entries.length) {
    onCancel?.();
    return;
  }

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

  let cancelBtn = null;
  if (cancellable) {
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: '#3a3a42',
      color: '#fff',
      border: '1px solid #55555f',
      borderRadius: '5px',
      padding: '3px 10px',
      cursor: 'pointer',
    });
  }
  banner.append(label);
  if (cancelBtn) banner.appendChild(cancelBtn);
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

  for (const { targetEl, img } of entries) {
    if (targetEl) {
      getRestore(targetEl);
      if (targetEl.style) {
        targetEl.style.outline = '4px solid #ffd23f';
        targetEl.style.outlineOffset = '2px';
        targetEl.style.cursor = 'pointer';
      }
      targetEl.dataset.matPick = '1';
    }
    if (img) {
      getRestore(img);
      if (img.style && img !== targetEl) {
        img.style.outline = '4px solid #ffd23f';
        img.style.outlineOffset = '2px';
        img.style.cursor = 'pointer';
      }
      img.draggable = false;
      img.dataset.matPick = '1';
    }
  }

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
  const finish = (card) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    onPick(card);
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

  const onDocClick = (event) => {
    if (banner.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      if (cancelBtn && event.target === cancelBtn) cancel();
      return;
    }
    const hitCard = findMatPickHit(entries, event.target);
    event.preventDefault();
    event.stopPropagation();
    if (hitCard) finish(hitCard);
  };

  const onDirectClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hitCard =
      findMatPickHit(entries, event.currentTarget) ||
      findMatPickHit(entries, event.target);
    if (hitCard) finish(hitCard);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && cancellable) {
      event.preventDefault();
      cancel();
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
