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
  const inScope = (target) => {
    const scope = scopes.get(target?.ownerDocument);
    return !scope || Boolean(target.closest?.(scope));
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
    // The card's own window: an iframe card is observed from inside its realm.
    const Observer = image?.ownerDocument?.defaultView?.MutationObserver;
    const root = image?.ownerDocument?.body;
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

  const onOver = (event) => {
    const source = resolveSource(event.target);
    if (!source) return;
    const eligible = isHoverEligible({
      card: source.card,
      enabled: isEnabled(),
      modalOpen: isModalOpen(),
      buttons: event.buttons,
    });
    if (!eligible) {
      model.suppress(event.buttons ? 'pointerdown' : 'modal');
      return;
    }
    model.enter(source.image, { pointerType: event.pointerType });
  };

  const onOut = (event) => {
    const left = resolveSource(event.target)?.image;
    if (!left) return;
    // Moving between a card's own holo layers, or between members of one stack, is not a leave.
    if (resolveSource(event.relatedTarget)?.image === left) return;
    model.leave(left);
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

  return { install, suppress, revalidate, state: model.state };
}
