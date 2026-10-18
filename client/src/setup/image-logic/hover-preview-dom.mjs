// Design 069: the hover preview's DOM half. Delegated pointer listeners on the main document and both
// playmat iframes feed the pure model (hover-preview-model.mjs); one non-interactive host in the main
// document renders whatever the model says is shown. Browser-only collaborators (modal flags, the
// setting, card backs, holo) are injected so this module runs under jsdom.
import { isShowingCardBack } from '../deck-builder/core/card-compare.mjs';
import { viewportRectOf } from './card-pop.mjs';
import { toHighResCardImageUrl } from './card-image-url.mjs';
import { resolvePreviewCard } from './preview-card.mjs';
import {
  HOVER_FADE_OUT_MS,
  createHoverModel,
  gutterBox,
  isHoverEligible,
  previewPlacement,
  stackTopCard,
} from './hover-preview-model.mjs';

export const HOVER_HOST_ID = 'hoverPreview';
export const HOVER_SHOWN_CLASS = 'is-shown';
export const GUTTER_PROBE_CLASS = 'hover-gutter-probe';

/** The card <img> under a pointer target: the image itself, or the real <img> inside its holo layers. */
export const cardImageOf = (target) => {
  if (!target || target.nodeType !== 1) return null;
  if (target.tagName === 'IMG' && target.card) return target;
  const image = target.closest?.('.mat-holo')?.querySelector?.('img');
  return image?.card ? image : null;
};

/** The image a hovered card previews: the top Pokémon of its in-play stack, else itself (A5). */
export const previewImageOf = (image) => {
  const container = image?.closest?.('.play-container');
  if (!container) return image ?? null;
  const members = [...container.querySelectorAll('img')].filter((member) => member.card);
  const top = stackTopCard(image.card, members.map((member) => member.card));
  return members.find((member) => member.card === top) ?? image;
};

const isInShadowRoot = (node) => {
  const root = node?.getRootNode?.();
  return Boolean(root && root !== node.ownerDocument && root.host);
};

const imageSrcOf = (image) => image.getAttribute?.('src') || image.currentSrc || image.src || '';

/**
 * @param {{
 *   doc: Document,
 *   isModalOpen?: () => boolean,
 *   isEnabled?: () => boolean,
 *   cardBackSrc?: (user: string) => string | undefined,
 *   holo?: { build: Function, start: Function, stop: Function } | null,
 * }} deps
 */
export function createHoverPreview({
  doc,
  isModalOpen = () => false,
  isEnabled = () => true,
  cardBackSrc = () => undefined,
  holo = null,
}) {
  const view = doc.defaultView;
  const model = createHoverModel({
    now: () => view.performance?.now?.() ?? Date.now(),
    setTimer: (fn, ms) => view.setTimeout(fn, ms),
    clearTimer: (id) => view.clearTimeout(id),
  });
  const installed = new WeakSet();
  // Per-document selector a hover must fall inside (the main document only previews the Stadium).
  const scopes = new WeakMap();
  const probes = [];
  let host = null;
  let clearTimer = null;
  let observer = null;

  // Face-down cards never preview (C3): the server redacts them, and a card drawn with its back up is
  // treated the same even when it is not redacted (legacy mode).
  // A document's scope guards its own tree; the 3D board's mirror cards (design 074 D4) sit in
  // shadow roots inside the main document and are the board, not a stray legacy `.card`.
  const inScope = (target) => {
    const scope = scopes.get(target?.ownerDocument);
    if (!scope || isInShadowRoot(target)) return true;
    return Boolean(target.closest?.(scope));
  };

  const resolveSource = (target) => {
    if (!target || !inScope(target)) return null;
    const hovered = cardImageOf(target);
    if (!hovered) return null;
    const image = previewImageOf(hovered);
    const card = resolvePreviewCard(null, image);
    if (!card) return null;
    const src = imageSrcOf(image);
    if (!src || /cardback/i.test(src)) return null;
    if (isShowingCardBack(src, cardBackSrc(card.user ?? image.user))) return null;
    return { image, card };
  };

  const ensureHost = () => {
    if (host?.isConnected) return host;
    host = doc.createElement('div');
    host.id = HOVER_HOST_ID;
    host.className = 'hover-preview';
    host.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(host);
    return host;
  };

  const releaseContent = () => {
    if (!host) return;
    const wrapper = host.querySelector('.card');
    if (wrapper && holo) holo.stop(wrapper);
    host.replaceChildren();
  };

  // Board art first so the preview is never blank, then the high-res scan once it has loaded.
  const upgradeToHighRes = (img, src) => {
    const hiRes = toHighResCardImageUrl(src);
    if (!hiRes || hiRes === src) return;
    const probe = new view.Image();
    probe.onload = () => {
      if (img.isConnected) img.src = hiRes;
    };
    probe.src = hiRes;
  };

  const buildContent = ({ image, card }) => {
    const src = card.src || imageSrcOf(image);
    const wrapper = image.closest?.('.mat-holo');
    const rarity = wrapper?.dataset?.rarity;
    if (holo && rarity) {
      const node = holo.build(toHighResCardImageUrl(src), rarity, {
        trainer: wrapper.dataset.cardKind === 'trainer',
      });
      const inner = node.querySelector('img');
      if (inner) {
        inner.src = src;
        upgradeToHighRes(inner, src);
      }
      return node;
    }
    const img = doc.createElement('img');
    img.className = 'hover-preview-card';
    img.alt = card.name || '';
    img.draggable = false;
    img.src = src;
    upgradeToHighRes(img, src);
    return img;
  };

  const measure = (source) => {
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const boardRect = doc.getElementById('battleMat')?.getBoundingClientRect() ?? null;
    const probeRects = probes.filter((probe) => probe.isConnected).map(viewportRectOf);
    const gutter = gutterBox({ boardRect, probeRects, viewport });
    return previewPlacement({ gutter, boardRect, sourceRect: viewportRectOf(source), viewport });
  };

  // A board re-render can detach, flip or re-stack the shown card without a pointerout.
  const stillValid = (image) =>
    image.isConnected && previewImageOf(image) === image && resolveSource(image)?.image === image;
  const watch = (image) => {
    observer?.disconnect();
    observer = null;
    // The card's own window: an iframe card is observed from inside its realm. A mirror card's
    // mutations stay inside its shadow root, so that root is what is observed.
    const Observer = image?.ownerDocument?.defaultView?.MutationObserver;
    const root = isInShadowRoot(image) ? image.getRootNode() : image?.ownerDocument?.body;
    if (!Observer || !root) return;
    observer = new Observer(() => revalidate());
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  };

  const show = (image) => {
    const source = resolveSource(image);
    if (!source || source.image !== image) {
      model.suppress('detached');
      return;
    }
    if (clearTimer !== null) {
      view.clearTimeout(clearTimer);
      clearTimer = null;
    }
    const el = ensureHost();
    releaseContent();
    const content = buildContent(source);
    el.appendChild(content);
    const box = measure(image);
    Object.assign(el.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    el.dataset.mode = box.mode;
    if (holo && content.classList?.contains('card')) holo.start(content);
    el.classList.add(HOVER_SHOWN_CLASS);
  };

  const hide = () => {
    if (!host) return;
    host.classList.remove(HOVER_SHOWN_CLASS);
    if (clearTimer !== null) view.clearTimeout(clearTimer);
    clearTimer = view.setTimeout(() => {
      clearTimer = null;
      releaseContent();
    }, HOVER_FADE_OUT_MS);
  };

  model.onChange(({ phase, key }) => {
    if (phase === 'shown') show(key);
    else if (phase === 'idle') hide();
    // show() may have suppressed a stale card re-entrantly; watch what the model holds now.
    const now = model.state();
    watch(now.phase === 'idle' ? null : now.key);
  });

  const suppress = (reason) => model.suppress(reason);

  function revalidate() {
    const { phase, key } = model.state();
    if (phase === 'idle' || !key) return;
    if (!stillValid(key)) model.suppress('detached');
  }

  /**
   * The one path every hover change takes: the pointer left `from` and is over `to` (either may
   * be null). Moving between a card's own holo layers, or between members of one stack, is
   * neither a leave nor a new enter.
   */
  const targetChanged = (from, to, { pointerType, buttons = 0 } = {}) => {
    const left = resolveSource(from)?.image ?? null;
    const entered = resolveSource(to);
    if (left && left === entered?.image) return;
    if (left) model.leave(left);
    if (!entered) return;
    const eligible = isHoverEligible({
      card: entered.card,
      enabled: isEnabled(),
      modalOpen: isModalOpen(),
      buttons,
    });
    if (!eligible) {
      model.suppress(buttons ? 'pointerdown' : 'modal');
      return;
    }
    model.enter(entered.image, { pointerType });
  };

  const onOver = (event) =>
    targetChanged(null, event.target, { pointerType: event.pointerType, buttons: event.buttons });

  // The enter half of an out/over pair is the `pointerover` that follows.
  const onOut = (event) => {
    if (resolveSource(event.target)?.image === resolveSource(event.relatedTarget)?.image) return;
    targetChanged(event.target, null);
  };

  // The element a non-DOM hover source (the 3D board's raycast, board-input.js) last named.
  let setTargetEl = null;
  /**
   * Hover from outside the DOM's own pointer events: `el` is now under the pointer (null = none).
   * Same dwell, eligibility and suppression as a native `pointerover`/`pointerout`.
   * @param {Element|null} el
   * @param {{ pointerType?: string, buttons?: number }} [pointer]
   */
  const setTarget = (el, { pointerType = 'mouse', buttons = 0 } = {}) => {
    const from = setTargetEl;
    setTargetEl = el ?? null;
    targetChanged(from, setTargetEl, { pointerType, buttons });
  };

  const suppressFor = (reason) => () => model.suppress(reason);

  const appendProbe = (targetDoc) => {
    const playfield = targetDoc.getElementById?.('playfield');
    if (!playfield || playfield.querySelector(`.${GUTTER_PROBE_CLASS}`)) return;
    const probe = targetDoc.createElement('div');
    probe.className = GUTTER_PROBE_CLASS;
    probe.setAttribute('aria-hidden', 'true');
    playfield.appendChild(probe);
    probes.push(probe);
  };

  /**
   * Idempotent per document. `within` limits hovers to one subtree (legacy Card objects stamp
   * `.card` on images outside the board too). Iframe documents also get the gutter probe.
   */
  const install = (targetDoc, { within = null } = {}) => {
    if (!targetDoc || installed.has(targetDoc)) return;
    installed.add(targetDoc);
    if (within) scopes.set(targetDoc, within);
    targetDoc.addEventListener('pointerover', onOver);
    targetDoc.addEventListener('pointerout', onOut);
    targetDoc.addEventListener('pointerdown', suppressFor('pointerdown'), true);
    targetDoc.addEventListener('dragstart', suppressFor('drag'), true);
    targetDoc.addEventListener('contextmenu', suppressFor('contextmenu'), true);
    targetDoc.addEventListener('wheel', suppressFor('wheel'), { capture: true, passive: true });
    targetDoc.defaultView?.addEventListener('blur', suppressFor('blur'));
    if (targetDoc !== doc) appendProbe(targetDoc);
  };

  return { install, suppress, revalidate, setTarget, state: model.state };
}
