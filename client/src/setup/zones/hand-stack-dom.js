/**
 * @file DOM reconciler for duplicate card stacking in hand.
 * Groups duplicate face-up cards in #hand into .hand-card-stack containers
 * with stepped vertical offsets and circular count badges.
 */

import {
  oppContainerDocument,
  selfContainerDocument,
} from '../../initialization/global-variables/containers.js';
import { adjustAlignment } from '../sizing/adjust-alignment.js';
import {
  computeHandStacks,
  DEFAULT_STACK_STEP_OFFSET_PX,
} from '../../../../shared/engine/zones/hand-stack.mjs';

let isReconciling = false;

/**
 * Checks whether an <img> or its associated card is face-down / hidden.
 *
 * @param {HTMLImageElement} img
 * @param {object} [card]
 * @returns {boolean}
 */
function isImageHidden(img, card) {
  if (!img && !card) return false;
  if (card?.isFaceDown || card?.hidden || card?.isCardHidden) return true;
  const src = img?.currentSrc || img?.src || card?.image?.src || '';
  if (!src) return false;

  const sysState = typeof window !== 'undefined' ? window.systemState : null;
  if (sysState) {
    const user = card?.user ?? img?.user;
    const backSrc =
      user === 'self'
        ? sysState.cardBackSrc
        : sysState.isTwoPlayer
          ? sysState.p2OppCardBackSrc
          : sysState.p1OppCardBackSrc;
    if (backSrc && src === backSrc) return true;
  }

  return (
    src.includes('cardback') ||
    src.includes('card-back') ||
    src.includes('default-card-back') ||
    src.includes('sleeve') ||
    src.endsWith('.svg') ||
    Boolean(img?.classList?.contains?.('hidden-card')) ||
    img?.dataset?.hidden === 'true'
  );
}

/**
 * Resolves the card's printed name from the element or associated Card instance.
 *
 * @param {HTMLImageElement} img
 * @param {object} [card]
 * @returns {string}
 */
function getCardName(img, card) {
  if (card?.name && typeof card.name === 'string') return card.name.trim();
  if (img?.dataset?.cardName) return img.dataset.cardName.trim();
  if (img?.alt && typeof img.alt === 'string') return img.alt.trim();
  return '';
}

/**
 * Collects all card root DOM nodes (bare <img> or .mat-holo wrapper) from #hand,
 * unwrapping cards from any existing .hand-card-stack containers.
 *
 * @param {HTMLElement} handElement
 * @returns {Array<{ rootNode: HTMLElement, img: HTMLImageElement, card: object|null, name: string, isHidden: boolean }>}
 */
function collectHandCardDescriptors(handElement) {
  const descriptors = [];
  const children = Array.from(handElement.children);

  for (const child of children) {
    if (child.classList.contains('hand-card-stack')) {
      // Collect cards nested inside an existing stack
      const stackCards = Array.from(child.children).filter(
        (el) => !el.classList.contains('hand-card-stack__badge')
      );
      for (const cardNode of stackCards) {
        const img =
          cardNode.tagName === 'IMG' ? cardNode : cardNode.querySelector('img');
        if (!img) continue;
        const card = img.card || null;
        const hidden = isImageHidden(img, card);
        const name = hidden ? '' : getCardName(img, card);
        descriptors.push({
          rootNode: cardNode,
          img,
          card,
          name,
          isHidden: hidden,
        });
      }
    } else if (
      child.classList.contains('mat-holo') ||
      child.tagName === 'IMG'
    ) {
      const img = child.tagName === 'IMG' ? child : child.querySelector('img');
      if (!img) continue;
      const card = img.card || null;
      const hidden = isImageHidden(img, card);
      const name = hidden ? '' : getCardName(img, card);
      descriptors.push({
        rootNode: child,
        img,
        card,
        name,
        isHidden: hidden,
      });
    }
  }

  return descriptors;
}

/**
 * Clears stacking inline styles from a card root node.
 *
 * @param {HTMLElement} node
 */
function clearCardStackStyles(node) {
  node.classList.remove('hand-card--stacked-front', 'hand-card--stacked-back');
  node.style.position = '';
  node.style.bottom = '';
  node.style.left = '';
  node.style.width = '';
  node.style.height = '';
  node.style.margin = '';
  node.style.zIndex = '';
  node.style.transform = '';
}

/**
 * Reconciles duplicate card stacks in a player's hand.
 *
 * @param {string} [user='self'] 'self' or 'opp'
 * @param {object} [options]
 * @param {Document} [options.document] Document override for testing or Netcode context
 * @returns {void}
 */
export function reconcileHandStacks(user = 'self', options = {}) {
  if (isReconciling) return;

  const doc =
    options.document ||
    (user === 'self' ? selfContainerDocument : oppContainerDocument) ||
    (typeof document !== 'undefined' ? document : null);

  const handElement = doc?.getElementById?.('hand');
  if (!handElement) return;

  // Do not disrupt layout while an active drag gesture is ongoing
  if (handElement.querySelector?.('.dragging')) return;

  isReconciling = true;
  try {
    const descriptors = collectHandCardDescriptors(handElement);
    if (descriptors.length === 0) {
      // Clean up any stray stack elements
      const existingStacks = handElement.querySelectorAll('.hand-card-stack');
      existingStacks.forEach((stack) => stack.remove());
      adjustAlignment(handElement);
      return;
    }

    // Compute groups using pure engine logic
    const stackGroups = computeHandStacks(descriptors, {
      isHidden: (d) => d.isHidden,
      stepOffsetPx: DEFAULT_STACK_STEP_OFFSET_PX,
    });

    const newTopLevelElements = [];

    for (const group of stackGroups) {
      if (group.isStack) {
        // Find existing stack element or create a new one
        const firstCardNode = group.cards[0].card.rootNode;
        let stackEl = firstCardNode.closest?.('.hand-card-stack');
        if (!stackEl || stackEl.ownerDocument !== doc) {
          stackEl = doc.createElement('div');
        }

        stackEl.className = 'hand-card-stack';
        stackEl.dataset.cardName = group.name;
        stackEl.dataset.stackCount = String(group.count);

        // Position and layer cards: back cards first (highest layerIndex), down to front (layer 0)
        for (let i = group.cards.length - 1; i >= 0; i--) {
          const item = group.cards[i];
          const node = item.card.rootNode;

          node.style.position = 'absolute';
          node.style.bottom = '0';
          node.style.left = '0';
          node.style.width = '100%';
          node.style.height = '100%';
          node.style.margin = '0';
          node.style.zIndex = String(item.zIndex);
          node.style.transform = item.isFront
            ? 'translateY(0)'
            : `translateY(-${item.offsetPx}px)`;

          if (item.isFront) {
            node.classList.add('hand-card--stacked-front');
            node.classList.remove('hand-card--stacked-back');
          } else {
            node.classList.add('hand-card--stacked-back');
            node.classList.remove('hand-card--stacked-front');
          }

          stackEl.appendChild(node);
        }

        // Circular badge at top center with count
        let badge = stackEl.querySelector('.hand-card-stack__badge');
        if (!badge) {
          badge = doc.createElement('div');
          badge.className = 'hand-card-stack__badge';
        }
        badge.textContent = String(group.count);
        stackEl.appendChild(badge);

        newTopLevelElements.push(stackEl);
      } else {
        // Single card (unstacked)
        const node = group.cards[0].card.rootNode;
        clearCardStackStyles(node);
        newTopLevelElements.push(node);
      }
    }

    // Remove any empty or orphaned .hand-card-stack containers
    const existingStacks = handElement.querySelectorAll('.hand-card-stack');
    for (const s of existingStacks) {
      if (!newTopLevelElements.includes(s)) {
        s.remove();
      }
    }

    // Reconcile order of children in #hand
    for (const el of newTopLevelElements) {
      handElement.appendChild(el);
    }

    adjustAlignment(handElement);
  } finally {
    isReconciling = false;
  }
}
