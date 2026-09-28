import { buildHoloCard, startHoloAnimation } from '../../../setup/deck-builder/core/holo.mjs';
import {
  BOX_PROPORTIONS,
  boxFaceTexture,
  packArtSrc,
} from '../../../setup/deck-builder/core/build-battle/box-textures.mjs';
import {
  CARDS_PER_PACK,
  DECK_UNWRAP_MS,
  FAN_COLLAPSE_MS,
  LID_OPEN_MS,
  PACK_ARTS,
  PACK_SPILL_MS,
  PACK_TEAR_MS,
  PROMO_LIFT_MS,
  SCENE_BACKSTOP_MS,
  TAP_SLOP_PX,
  TRAY_TOTAL_MS,
  WRAP_TEAR_MS,
  cardRevealPhases,
  cardRevealPose,
  cubicBezier,
  faceMatrix3d,
  fanSlot,
  hitTierFor,
  lidPose,
  nextPackToTear,
  packArtIndexes,
  packSlotKind,
  packSpillPose,
  packTearEdge,
  packTearProgress,
  packTornAt,
  promoLiftPose,
  tearReleaseOutcome,
  trayRisePose,
  unboxingHoloRarity,
  unboxingTimeline,
  unboxingVoiceFor,
  wrapTearPose,
} from '../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { resolveDefaultCardBackSrc } from '../../../setup/deck-constructor/default-card-back.mjs';
import {
  animateFrames,
  fxDisabled,
  motionReduced,
  sampleKeyframes,
  spawnParticles,
} from '../../../setup/image-logic/mat-fx.mjs';
import { playFxSound } from '../../../setup/netcode/mat-fx/fx-audio.js';
import { brighten, fxRgbForCard, rgbCss } from '../../../setup/netcode/mat-fx/fx-colors.mjs';
import { burstParticles } from '../../../setup/netcode/mat-fx/particles.mjs';

/**
 * The Build & Battle unboxing scene (design 052 § DOM twin): a CSS 3D box under shrink-wrap,
 * a hinged lid, the tray (deck, four packs, code card, tip sheet), packs torn by drag or press,
 * and cards revealed one at a time into a fan. Every beat is `dispatch(event)` (reducer + save)
 * first, then sound, then the pose sampled from unboxing.mjs; a beat that is refused does nothing.
 * The DOM re-renders the settled state after each beat, so a reload lands on the same picture.
 */

const BOX_W = 200;
const BOX_H = Math.round(BOX_W * BOX_PROPORTIONS.height);
const BOX_D = Math.round(BOX_W * BOX_PROPORTIONS.depth);
// The reveal row's pack and cards; the tray pack is the same art drawn smaller by CSS.
const PACK_W = 84;
const PACK_H = Math.round(PACK_W * 1.8);
const CARD_W = 76;
const CARD_H = Math.round((CARD_W * 88) / 63);
const FAN_TOP_PX = 14;
const SPRING_BACK_MS = 160;
const SWEEP_MS = 420;
const SPARK_COUNT = 16;
const SPARK_MS = 640;
const COLLAPSE_SCALE = 0.2;
const DEFAULT_FAN_WIDTH_PX = 560;
const SET_LOGO_URL = 'https://assets.tcgdex.net/en/me/me02/logo.webp';
const KEY_ART_URL = 'https://assets.tcgdex.net/en/me/me02/125/high.webp';

const easeSettle = cubicBezier(0.2, 0.8, 0.2, 1);
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (from, to, t) => from + (to - from) * t;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (className, label) => {
  const node = el('button', className);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  return node;
};

const cardImage = (card, size = 'small') =>
  card?.images?.[size] || card?.images?.small || card?.image || '';

const instant = () => motionReduced() || fxDisabled();

// "Sound before sight": every beat calls this before its first frame. playFxSound re-checks the
// mute and the kill switch, and stays silent until the page has had a gesture.
const sound = (effect) => {
  if (effect) playFxSound({ effect });
};

// A hidden tab or a cancelled animation must never park the scene between states.
const withBackstop = (promise) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, SCENE_BACKSTOP_MS))]);

const applyFrame = (node, frame) => {
  for (const [key, value] of Object.entries(frame)) {
    if (key !== 'offset') node.style[key] = String(value);
  }
};

/** Sample `poseFn` into keyframes and play them on `node`; instant scenes jump to the end. */
const playPose = (node, poseFn, toFrame, durationMs, { delay = 0, samples = 24 } = {}) => {
  if (!node) return Promise.resolve();
  const frames = sampleKeyframes(poseFn, toFrame, samples);
  if (instant() || !(durationMs > 0)) {
    applyFrame(node, frames.at(-1));
    return Promise.resolve();
  }
  node.style.willChange = 'transform';
  return animateFrames(node, frames, { duration: durationMs, delay }).then(() => {
    node.style.willChange = '';
  });
};

// CSS y points down: the pose's lid angle (y up, negative = swinging up and back) flips sign here.
const lidTransform = ({ rotateXDeg, translateYPx }) =>
  `translate3d(0, ${-BOX_H / 2 + translateYPx}px, ${-BOX_D / 2}px) rotateX(${-rotateXDeg}deg)`;

const promoTransform = ({ translateYPx, rotateXDeg, rotateYDeg, scale }) =>
  `translateY(${translateYPx}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg) scale(${scale})`;

// The body of a torn pack: everything below the tear line `packTearEdge` cut.
const packBodyClip = (tearEdge) => {
  const points = tearEdge.slice('polygon('.length, -1).split(', ').slice(2);
  return `polygon(${[...points, '0% 100%', '100% 100%'].join(', ')})`;
};

/** Where revealed card `index` sits in a fan `fanWidthPx` wide (fixed ten slots, left to right). */
const fanPosition = (index, fanWidthPx) => {
  const width = fanWidthPx > CARD_W ? fanWidthPx : DEFAULT_FAN_WIDTH_PX;
  const spread = Math.min((width - CARD_W) / 0.9, CARD_W * 1.1 * CARDS_PER_PACK);
  return fanSlot(index, CARDS_PER_PACK, spread);
};

// ── Procedural box faces (design 052 § Box reference) ─────────────────────
const wordmark = (className) => {
  const plate = el('div', `bb-wordmark ${className || ''}`.trim());
  plate.append(el('span', 'bb-wordmark__name', 'Pokémon'), el('span', 'bb-wordmark__sub', 'Trading Card Game'));
  return plate;
};

const playMark = () => {
  const mark = el('span', 'bb-playmark');
  mark.setAttribute('aria-hidden', 'true');
  return mark;
};

const buildBattleTitle = () => {
  const title = el('div', 'bb-bbtitle');
  title.append(playMark(), el('span', '', 'Build & Battle'));
  return title;
};

const setLogo = () => {
  const block = el('div', 'bb-setlogo');
  block.append(el('span', 'bb-setlogo__mega', 'Mega Evolution'), el('span', 'bb-setlogo__name', 'Phantasmal Flames'));
  const logo = el('img', 'bb-setlogo__img');
  logo.alt = '';
  logo.src = SET_LOGO_URL;
  logo.addEventListener('load', () => block.classList.add('has-logo'), { once: true });
  logo.addEventListener('error', () => logo.remove(), { once: true });
  block.append(logo);
  return block;
};

const proceduralFront = () => {
  const face = el('div', 'bb-pf bb-pf--front');
  const top = el('div', 'bb-pf__strip');
  const level = el('div', 'bb-level');
  level.append(el('span', 'bb-level__pill', 'Play level 2'));
  top.append(wordmark(), level, el('span', 'bb-age', '6+'));
  const art = el('div', 'bb-keyart');
  art.append(el('div', 'bb-keyart__slashes'));
  face.append(top, art, setLogo(), buildBattleTitle());
  return face;
};

// The key art only matters when the front texture is missing, so it loads on that failure only.
const mountKeyArt = (face) => {
  const art = face.querySelector('.bb-keyart');
  if (!art || art.querySelector('img')) return;
  const img = el('img', 'bb-keyart__img');
  img.alt = '';
  img.src = KEY_ART_URL;
  img.addEventListener('error', () => img.remove(), { once: true });
  art.prepend(img);
};

const proceduralSide = (name) => el('div', `bb-pf bb-pf--side bb-pf--${name}`);

const proceduralBack = () => {
  const face = el('div', 'bb-pf bb-pf--back');
  const list = el('ul', 'bb-back__list');
  for (const line of [
    '40-card ready-to-play deck including 1 of 4 unique foil promo cards',
    '4 Phantasmal Flames booster packs',
    'A code card for Pokémon TCG Live',
  ]) {
    list.append(el('li', '', line));
  }
  const legal = el('div', 'bb-back__legal');
  for (let line = 0; line < 4; line += 1) legal.append(el('i'));
  face.append(
    buildBattleTitle(),
    el('div', 'bb-back__rule'),
    el('p', 'bb-back__inside', 'Inside, you’ll find:'),
    list,
    el('div', 'bb-back__rule'),
    el('div', 'bb-back__site', 'www.pokemon.com'),
    legal,
    el('p', 'bb-back__motto', 'Gotta catch ’em all!')
  );
  return face;
};

const proceduralTop = (name) => {
  const face = el('div', `bb-pf bb-pf--cap bb-pf--${name}`);
  const band = el('div', 'bb-cap__band');
  band.append(wordmark('bb-wordmark--small'));
  face.append(band);
  return face;
};

const proceduralFace = (name) => {
  if (name === 'front') return proceduralFront();
  if (name === 'back') return proceduralBack();
  if (name === 'top' || name === 'bottom') return proceduralTop(name);
  return proceduralSide(name);
};

const FACE_SIZE = {
  front: [BOX_W, BOX_H],
  back: [BOX_W, BOX_H],
  left: [BOX_D, BOX_H],
  right: [BOX_D, BOX_H],
  top: [BOX_W, BOX_D],
  bottom: [BOX_W, BOX_D],
};

/**
 * A vendored face photo, squared onto the face by `faceMatrix3d`; any failure keeps the CSS face.
 * A loaded photo is kept in `cache` and moved into the next render's face, so a re-render never
 * flashes the CSS face while the new image decodes.
 */
const mountTexture = (face, name, cache) => {
  const texture = boxFaceTexture(name);
  if (!texture) return;
  const cached = cache.get(name);
  if (cached) {
    face.classList.add('has-texture');
    face.append(cached);
    return;
  }
  const [width, height] = FACE_SIZE[name];
  let matrix;
  try {
    matrix = faceMatrix3d(texture.quad, width, height);
  } catch {
    if (name === 'front') mountKeyArt(face);
    return;
  }
  const img = el('img', 'bb-box__texture');
  img.alt = '';
  img.draggable = false;
  img.style.width = `${texture.cropInRender.width}px`;
  img.style.height = `${texture.cropInRender.height}px`;
  img.style.transform = matrix;
  img.addEventListener(
    'load',
    () => {
      cache.set(name, img);
      img.closest('.bb-box__face')?.classList.add('has-texture');
    },
    { once: true }
  );
  img.addEventListener(
    'error',
    () => {
      img.remove();
      if (name === 'front') mountKeyArt(face);
    },
    { once: true }
  );
  img.src = `/${texture.src}`;
  face.append(img);
};

const boxFace = (name, { wrapped, textures }) => {
  const face = el('div', `bb-box__face bb-box__face--${name}`);
  face.append(proceduralFace(name));
  mountTexture(face, name, textures);
  if (wrapped) face.append(el('div', 'bb-face__wrap'));
  return face;
};

// ── Cards ─────────────────────────────────────────────────────────────────
const cardBackImg = (className) => {
  const img = el('img', className);
  img.alt = '';
  img.draggable = false;
  img.src = resolveDefaultCardBackSrc();
  return img;
};

// A card whose image 404s shows the card back with its name (row 10).
const cardFallback = (card) => {
  const node = el('div', 'bb-card-fallback');
  node.append(cardBackImg('bb-card-fallback__back'), el('span', 'bb-card-fallback__name', card?.name || 'Card'));
  return node;
};

// ── Scene ─────────────────────────────────────────────────────────────────
/**
 * @param {object} options
 * @param {HTMLElement} options.root `#bbUnboxing`
 * @param {() => import('../../../setup/deck-builder/core/build-battle/unboxing.mjs').Unboxing} options.getUnboxing
 * @param {(event: {type: string, packIndex?: number}) => object|null} options.dispatch reduces and
 *   saves; null when the event was refused
 * @param {(object|null)[][]} options.packs the session's packs as card rows, in slot order
 * @param {object} options.packModel the box's pack model (reverse-slot lookup)
 * @param {number} options.seed the box seed (pack art, tear edges)
 * @param {object|null} options.promo the deck's foil promo card row
 * @param {() => void} options.onBuildDeck ends the opening: closes the stage, shows the Pool tab
 * @returns {{unmount: () => void}}
 */
export const mountUnboxingScene = ({
  root,
  getUnboxing,
  dispatch,
  packs,
  packModel,
  seed,
  promo,
  onBuildDeck,
}) => {
  const artIndexes = packArtIndexes(seed);
  const textures = new Map();
  const tearEdges = packs.map((_, index) => packTearEdge(seed, index));
  const slotOf = (packIndex, cardIndex) =>
    packSlotKind(packModel, cardIndex, packs[packIndex]?.[cardIndex]);
  const tierOf = (packIndex, cardIndex) =>
    hitTierFor(packs[packIndex]?.[cardIndex], slotOf(packIndex, cardIndex));

  // Bumped by every render: async beat continuations from an older picture stop touching the DOM.
  let generation = 0;
  let holoStops = [];
  let observers = [];
  let timers = new Set();
  let lanes = new Map();
  let beatRunning = false;
  let collapsing = false;

  const laneOf = (packIndex) => {
    if (!lanes.has(packIndex)) {
      lanes.set(packIndex, { busy: false, queued: false, revealAll: false, current: null });
    }
    return lanes.get(packIndex);
  };
  const anyLaneBusy = () =>
    [...lanes.values()].some((lane) => lane.busy || lane.revealAll);

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  const teardown = () => {
    generation += 1;
    holoStops.forEach((stop) => stop());
    holoStops = [];
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    timers.forEach((id) => clearTimeout(id));
    timers = new Set();
    lanes = new Map();
    beatRunning = false;
  };

  /**
   * The revealed card's face in a holder: a holo node when it wears foil, a plain image otherwise.
   * A failed image swaps for the fallback inside the holder, so whoever moves the holder (the
   * flyer landing in the fan) moves whichever one is showing.
   */
  const cardFace = (card, slot) => {
    const holder = el('div', 'bb-card-holder');
    holder.append(cardFaceNode(card, slot));
    return holder;
  };

  const cardFaceNode = (card, slot) => {
    const rarity = unboxingHoloRarity(card, slot);
    const src = cardImage(card, 'small');
    if (!card || !src) return cardFallback(card);
    if (!rarity) {
      const img = el('img', 'bb-card-face');
      img.alt = card.name;
      img.draggable = false;
      img.addEventListener('error', () => img.replaceWith(cardFallback(card)), { once: true });
      img.src = src;
      return img;
    }
    const holo = buildHoloCard(src, rarity);
    holo.classList.add('bb-card-face');
    holo.querySelector('img')?.addEventListener(
      'error',
      () => holo.replaceWith(cardFallback(card)),
      { once: true }
    );
    holoStops.push(startHoloAnimation(holo));
    return holo;
  };

  const fanCard = (packIndex, cardIndex, face) => {
    const card = packs[packIndex]?.[cardIndex];
    const node = el('div', 'bb-fan__card');
    node.dataset.cardIndex = String(cardIndex);
    if (card?.id) node.dataset.previewCardId = card.id;
    node.title = card?.name || '';
    node.append(face || cardFace(card, slotOf(packIndex, cardIndex)));
    return node;
  };

  const layoutFan = (fan) => {
    const width = fan.clientWidth;
    fan.querySelectorAll('.bb-fan__card').forEach((node) => {
      const { xPx, rotateZDeg } = fanPosition(Number(node.dataset.cardIndex), width);
      node.style.setProperty('--bb-fan-x', `${xPx.toFixed(1)}px`);
      node.style.setProperty('--bb-fan-rot', `${rotateZDeg.toFixed(2)}deg`);
    });
  };

  // ── Box ───────────────────────────────────────────────────────────────
  const renderBox = (u) => {
    const host = el('div', 'bb-box');
    host.style.setProperty('--bb-w', `${BOX_W}px`);
    host.style.setProperty('--bb-h', `${BOX_H}px`);
    host.style.setProperty('--bb-d', `${BOX_D}px`);
    const body = el('div', 'bb-box__body');
    const wrapped = !u.wrapTorn;
    const faceOptions = { wrapped, textures };
    for (const name of ['back', 'left', 'right', 'bottom']) body.append(boxFace(name, faceOptions));
    for (const name of ['back', 'left', 'right', 'front']) {
      body.append(el('div', `bb-box__inner bb-box__inner--${name}`));
    }
    body.append(el('div', 'bb-box__floor'), boxFace('front', faceOptions));

    const lid = el('div', 'bb-box__lid');
    const lidOuter = boxFace('top', faceOptions);
    lidOuter.classList.add('bb-box__lid-outer');
    lid.append(lidOuter, el('div', 'bb-box__lid-inner'));
    lid.style.transform = lidTransform(lidPose(u.stage === 'sealed' ? 0 : 1));
    body.append(lid);
    host.append(body);

    if (wrapped) {
      const wrapButton = button('bb-box__wrap', 'Tear off the shrink-wrap');
      bindTear(wrapButton, {
        widthOf: () => wrapButton.clientWidth || BOX_W,
        onProgress: (progress) => setWrapClip(wrapTearPose(progress).clipPath),
        onSpring: (progress) => springWrap(progress),
        onTear: (progress) => beatTearWrap(progress),
      });
      host.append(wrapButton);
    } else if (u.stage === 'sealed') {
      const lidButton = button('bb-box__open', 'Open the lid');
      lidButton.addEventListener('click', beatOpenLid);
      host.append(lidButton);
    }
    return host;
  };

  const wrapLayers = () => [...root.querySelectorAll('.bb-face__wrap')];
  const setWrapClip = (clipPath) => {
    wrapLayers().forEach((layer) => {
      layer.style.clipPath = clipPath;
    });
  };
  const springWrap = (progress) =>
    Promise.all(
      wrapLayers().map((layer) =>
        playPose(
          layer,
          (t) => wrapTearPose(lerp(progress, 0, easeOut(t))),
          (pose) => ({ clipPath: pose.clipPath }),
          SPRING_BACK_MS,
          { samples: 8 }
        )
      )
    );

  // ── Tray ──────────────────────────────────────────────────────────────
  const trayItem = (index, child) => {
    const item = el('div', 'bb-tray__item');
    item.dataset.trayIndex = String(index);
    item.append(child);
    return item;
  };

  const renderDeck = (u) => {
    const deck = button('bb-deck', 'Unwrap the deck');
    deck.disabled = u.stage !== 'opened';
    const stack = el('div', 'bb-deck__stack');
    stack.append(cardBackImg('bb-deck__back'));
    deck.append(stack);
    if (u.stage === 'opened') {
      const windowEl = el('div', 'bb-deck__window');
      const img = el('img', 'bb-deck__promo');
      img.alt = promo?.name || '';
      img.draggable = false;
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = cardImage(promo, 'small');
      windowEl.append(img);
      deck.append(windowEl, el('div', 'bb-deck__wrap'));
    }
    deck.append(el('span', 'bb-tray__label', '40-card deck'));
    deck.addEventListener('click', beatUnwrapDeck);
    return deck;
  };

  const renderPromo = () => {
    const host = el('div', 'bb-promo');
    const lift = el('div', 'bb-promo__lift');
    lift.style.transform = promoTransform(promoLiftPose(1));
    if (promo?.id) lift.dataset.previewCardId = promo.id;
    lift.title = promo?.name || '';
    lift.append(cardFace(promo, 'normal'));
    host.append(lift, el('span', 'bb-tray__label', 'Foil promo'));
    return host;
  };

  const packArt = (className, packIndex) => {
    const img = el('img', className);
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = `/${packArtSrc(PACK_ARTS[artIndexes[packIndex]])}`;
    return img;
  };

  const renderTrayPack = (u, packIndex) => {
    const pack = el('div', 'bb-pack');
    pack.dataset.pack = String(packIndex);
    const torn = u.packsTorn[packIndex];
    const isNext = packIndex === nextPackToTear(u);
    pack.classList.toggle('is-torn', torn);
    pack.classList.toggle('is-next', isNext);
    const bodyEl = el('div', 'bb-pack__body');
    bodyEl.append(packArt('bb-pack__art', packIndex), el('div', 'bb-pack__foil'));
    if (torn) bodyEl.style.clipPath = packBodyClip(tearEdges[packIndex]);
    pack.append(bodyEl);
    if (!torn) {
      const strip = el('div', 'bb-pack__strip');
      strip.style.clipPath = tearEdges[packIndex];
      strip.append(packArt('bb-pack__art', packIndex));
      const top = button('bb-pack__top', `Tear open pack ${packIndex + 1}`);
      // Packs open one after the other: only the next one tears.
      top.disabled = !isNext;
      const stripShift = (progress) => (top.clientWidth || PACK_W) * progress * 0.5;
      bindTear(top, {
        widthOf: () => top.clientWidth || PACK_W,
        onProgress: (progress) => {
          strip.style.transform = `translateX(${stripShift(progress)}px) rotate(${progress * 6}deg)`;
        },
        onSpring: (progress) =>
          playPose(
            strip,
            (t) => lerp(stripShift(progress), 0, easeOut(t)),
            (x) => ({ transform: `translateX(${x}px)` }),
            SPRING_BACK_MS,
            { samples: 8 }
          ),
        onTear: (progress) => beatTearPack(packIndex, stripShift(progress)),
      });
      pack.append(strip, top);
    }
    pack.append(el('span', 'bb-tray__label', torn ? 'Opened' : `Pack ${packIndex + 1}`));
    return pack;
  };

  const renderProp = (kind, title, sub) => {
    const prop = el('div', `bb-prop bb-prop--${kind}`);
    prop.append(el('strong', '', title), el('span', '', sub));
    return prop;
  };

  const renderTray = (u) => {
    const tray = el('div', 'bb-tray');
    tray.append(trayItem(0, renderDeck(u)));
    if (u.stage !== 'opened') tray.append(renderPromo());
    packs.forEach((_, packIndex) => tray.append(trayItem(packIndex + 1, renderTrayPack(u, packIndex))));
    tray.append(
      trayItem(5, renderProp('code', 'Code card', 'Pokémon TCG Live')),
      trayItem(6, renderProp('tips', 'How to play', 'Quick-start sheet'))
    );
    return tray;
  };

  // ── Reveal rows ───────────────────────────────────────────────────────
  const stackCardAt = (depth) => {
    const node = cardBackImg('bb-stack__card');
    const pose = packSpillPose(1, depth, { packWidthPx: PACK_W, packHeightPx: PACK_H });
    node.style.transform = `translate(${pose.translateXPx}px, ${pose.translateYPx}px) rotate(${pose.rotateZDeg}deg)`;
    return node;
  };

  const renderReveal = (u, packIndex) => {
    const row = el('section', 'bb-reveal');
    row.dataset.pack = String(packIndex);
    const src = el('div', 'bb-reveal__src');
    const packEl = el('div', 'bb-reveal__pack');
    packEl.style.clipPath = packBodyClip(tearEdges[packIndex]);
    packEl.append(packArt('bb-pack__art', packIndex), el('div', 'bb-pack__foil'));
    const stack = button('bb-stack', `Flip the next card of pack ${packIndex + 1}`);
    const remaining = CARDS_PER_PACK - u.revealed[packIndex];
    for (let depth = 0; depth < remaining; depth += 1) stack.append(stackCardAt(depth));
    stack.disabled = remaining === 0;
    stack.addEventListener('click', () => requestReveal(packIndex));
    src.append(stack, packEl);

    const fan = el('div', 'bb-fan');
    for (let cardIndex = 0; cardIndex < u.revealed[packIndex]; cardIndex += 1) {
      fan.append(fanCard(packIndex, cardIndex));
    }
    const count = el('p', 'bb-reveal__count', `Pack ${packIndex + 1} · ${u.revealed[packIndex]} / ${CARDS_PER_PACK}`);
    row.append(count, src, fan);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => layoutFan(fan));
      observer.observe(fan);
      observers.push(observer);
    }
    return row;
  };

  // Counts the cards that have landed; the state already holds the ones still in flight.
  const updateRevealRow = (packIndex) => {
    const row = root.querySelector(`.bb-reveal[data-pack="${packIndex}"]`);
    if (!row) return;
    const landed = row.querySelectorAll('.bb-fan__card').length;
    row.querySelector('.bb-reveal__count').textContent =
      `Pack ${packIndex + 1} · ${landed} / ${CARDS_PER_PACK}`;
    const stack = row.querySelector('.bb-stack');
    stack.disabled = !stack.querySelector('.bb-stack__card');
  };

  // ── Controls and hint ────────────────────────────────────────────────
  const midRevealPack = (u) =>
    u.packsTorn.findIndex((torn, index) => torn && u.revealed[index] < CARDS_PER_PACK);

  const hintFor = (u) => {
    if (u.stage === 'sealed') {
      return u.wrapTorn ? 'Open the lid.' : 'Drag across the shrink-wrap to tear it off, or press it.';
    }
    if (u.stage === 'opened') return 'Unwrap the deck to see its foil promo.';
    if (u.stage === 'deckShown') return 'Tear open pack 1: drag across its top, or press it.';
    if (u.stage === 'packs') {
      return midRevealPack(u) >= 0
        ? 'Tap the stack to flip the next card.'
        : `Tear open pack ${nextPackToTear(u) + 1}.`;
    }
    return 'All four packs are open. Build your deck from your pool.';
  };

  const renderControls = (u) => {
    const controls = el('div', 'bb-controls');
    const revealAll = el('button', 'bb-secondary', 'Reveal all');
    revealAll.type = 'button';
    revealAll.dataset.control = 'reveal-all';
    revealAll.addEventListener('click', () => {
      const packIndex = midRevealPack(getUnboxing());
      if (packIndex >= 0) revealAllPack(packIndex);
    });
    const skip = el('button', 'bb-secondary', 'Skip scene');
    skip.type = 'button';
    skip.dataset.control = 'skip';
    skip.addEventListener('click', skipScene);
    controls.append(revealAll, skip);
    if (u.stage === 'done') {
      const build = el('button', 'bb-primary', 'Build your deck');
      build.type = 'button';
      build.addEventListener('click', onBuildDeck);
      controls.append(build);
    }
    return controls;
  };

  const updateControls = () => {
    const u = getUnboxing();
    const packIndex = midRevealPack(u);
    const revealAll = root.querySelector('[data-control="reveal-all"]');
    if (revealAll) revealAll.disabled = packIndex < 0 || laneOf(packIndex).revealAll;
    const skip = root.querySelector('[data-control="skip"]');
    if (skip) skip.disabled = u.stage === 'done';
    const hint = root.querySelector('.bb-hint');
    if (hint) hint.textContent = hintFor(u);
  };

  // ── Render (the settled picture of the state) ────────────────────────
  const playEntrance = (entrance) => {
    if (entrance === 'tray') {
      root.querySelectorAll('.bb-tray__item').forEach((item) => {
        const index = Number(item.dataset.trayIndex);
        playPose(
          item,
          (t) => trayRisePose(t, index),
          (pose) => ({ transform: `translateY(${pose.translateYPx}px)`, opacity: pose.opacity }),
          TRAY_TOTAL_MS
        );
      });
    }
    if (entrance === 'promo') {
      playPose(
        root.querySelector('.bb-promo__lift'),
        promoLiftPose,
        (pose) => ({ transform: promoTransform(pose) }),
        PROMO_LIFT_MS
      );
    }
    if (entrance?.spill !== undefined) playSpill(entrance.spill);
  };

  const render = ({ entrance = null } = {}) => {
    teardown();
    const u = getUnboxing();
    root.replaceChildren();
    root.dataset.stage = u.stage;
    root.dataset.wrap = u.wrapTorn ? 'off' : 'on';

    const top = el('div', 'bb-scene__top');
    top.append(renderBox(u));
    if (u.stage !== 'sealed') top.append(renderTray(u));
    const hint = el('p', 'bb-hint', hintFor(u));
    hint.setAttribute('role', 'status');
    const reveals = el('div', 'bb-scene__reveals');
    // One pack at a time: the latest torn pack holds the reveal row until the next one tears.
    const shownPack = u.packsTorn.lastIndexOf(true);
    if (u.stage === 'packs' && shownPack >= 0) reveals.append(renderReveal(u, shownPack));
    root.append(top, hint, reveals, renderControls(u));
    root.querySelectorAll('.bb-fan').forEach(layoutFan);
    updateControls();
    playEntrance(entrance);
  };

  // ── Beats ─────────────────────────────────────────────────────────────
  const runBeat = async (event, effect, animate, entrance) => {
    if (beatRunning || collapsing) return;
    if (!dispatch(event)) return;
    beatRunning = true;
    const gen = generation;
    sound(effect);
    await withBackstop(animate());
    if (gen !== generation) return;
    render({ entrance });
  };

  const beatTearWrap = (fromProgress = 0) =>
    runBeat(
      { type: 'tearWrap' },
      unboxingVoiceFor('tearWrap'),
      () =>
        Promise.all(
          wrapLayers().map((layer) =>
            playPose(
              layer,
              (t) => wrapTearPose(lerp(fromProgress, 1, t)),
              (pose) => ({ clipPath: pose.clipPath }),
              WRAP_TEAR_MS
            )
          )
        ),
      null
    );

  const beatOpenLid = () =>
    runBeat(
      { type: 'openLid' },
      unboxingVoiceFor('openLid'),
      () =>
        playPose(
          root.querySelector('.bb-box__lid'),
          lidPose,
          (pose) => ({ transform: lidTransform(pose) }),
          LID_OPEN_MS
        ),
      'tray'
    );

  const beatUnwrapDeck = () =>
    runBeat(
      { type: 'unwrapDeck' },
      unboxingVoiceFor('unwrapDeck'),
      () =>
        playPose(
          root.querySelector('.bb-deck__wrap'),
          wrapTearPose,
          (pose) => ({ clipPath: pose.clipPath }),
          DECK_UNWRAP_MS
        ),
      'promo'
    );

  const beatTearPack = (packIndex, fromShiftPx = 0) => {
    // A new reveal row re-renders the scene; never pull cards out from under a flip in flight.
    if (anyLaneBusy()) return;
    const strip = root.querySelector(`.bb-pack[data-pack="${packIndex}"] .bb-pack__strip`);
    const travel = (strip?.clientWidth || PACK_W) * 1.2;
    const previousRow = root.querySelector('.bb-reveal');
    runBeat(
      { type: 'tearPack', packIndex },
      unboxingVoiceFor('tearPack'),
      () =>
        Promise.all([
          playPose(
            strip,
            (t) => ({ x: lerp(fromShiftPx, travel, easeOut(t)), rotate: lerp(4, 16, t), opacity: 1 - t }),
            ({ x, rotate, opacity }) => ({ transform: `translateX(${x}px) rotate(${rotate}deg)`, opacity }),
            PACK_TEAR_MS
          ),
          // The finished pack's fan clears away as the next pack opens.
          collapseRow(previousRow, PACK_TEAR_MS),
        ]),
      { spill: packIndex }
    );
  };

  const playSpill = (packIndex) => {
    const row = root.querySelector(`.bb-reveal[data-pack="${packIndex}"]`);
    if (!row || instant()) return;
    const lane = laneOf(packIndex);
    const gen = generation;
    lane.busy = true;
    const cards = [...row.querySelectorAll('.bb-stack__card')];
    const spills = cards.map((node, depth) =>
      playPose(
        node,
        (t) => packSpillPose(t, depth, { packWidthPx: PACK_W, packHeightPx: PACK_H }),
        (pose) => ({
          transform: `translate(${pose.translateXPx}px, ${pose.translateYPx}px) rotate(${pose.rotateZDeg}deg)`,
        }),
        PACK_SPILL_MS
      )
    );
    lane.current = withBackstop(Promise.all(spills)).then(() => {
      if (gen !== generation) return;
      lane.busy = false;
      lane.current = null;
      if (lane.queued) {
        lane.queued = false;
        requestReveal(packIndex);
      }
    });
  };

  // ── Card reveals ─────────────────────────────────────────────────────
  const flareFor = (card) => {
    const flare = el('div', 'bb-flare');
    flare.style.setProperty('--bb-flare-rgb', rgbCss(brighten(fxRgbForCard(card), 0.45), 0.95));
    return flare;
  };

  /** Lift, flip and settle one card from the stack into its fan slot (design 052 § Reveal). */
  const animateReveal = async (packIndex, cardIndex) => {
    const gen = generation;
    const row = root.querySelector(`.bb-reveal[data-pack="${packIndex}"]`);
    if (!row) return;
    const card = packs[packIndex]?.[cardIndex];
    const slot = slotOf(packIndex, cardIndex);
    const tier = tierOf(packIndex, cardIndex);
    const fan = row.querySelector('.bb-fan');
    const stack = row.querySelector('.bb-stack');
    const stackCards = stack.querySelectorAll('.bb-stack__card');
    const topCard = stackCards[stackCards.length - 1];
    sound(unboxingVoiceFor('revealCard', tier));

    if (instant()) {
      topCard?.remove();
      fan.append(fanCard(packIndex, cardIndex));
      layoutFan(fan);
      updateRevealRow(packIndex);
      return;
    }

    const rowRect = row.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const fanRect = fan.getBoundingClientRect();
    const depth = Math.max(0, stackCards.length - 1);
    const from = packSpillPose(1, depth, { packWidthPx: PACK_W, packHeightPx: PACK_H });
    const fromX = stackRect.left - rowRect.left + from.translateXPx;
    const fromY = stackRect.top - rowRect.top + from.translateYPx;
    const slotPose = fanPosition(cardIndex, fan.clientWidth);
    const toX = fanRect.left - rowRect.left + fanRect.width / 2 - CARD_W / 2 + slotPose.xPx;
    const toY = fanRect.top - rowRect.top + FAN_TOP_PX;
    topCard?.remove();

    const flyer = el('div', 'bb-flyer');
    flyer.style.left = `${fromX}px`;
    flyer.style.top = `${fromY}px`;
    const back = el('div', 'bb-flyer__back');
    back.append(cardBackImg('bb-flyer__back-img'));
    const front = el('div', 'bb-flyer__front');
    flyer.append(back, front);
    row.append(flyer);

    const phases = cardRevealPhases(tier);
    const pose = (t) => {
      const reveal = cardRevealPose(t, { tier });
      const settle = easeSettle(clamp01((t - phases.flipEnd) / (1 - phases.flipEnd)));
      return {
        ...reveal,
        x: (toX - fromX) * settle,
        y: (toY - fromY) * settle,
        rotate: lerp(from.rotateZDeg, slotPose.rotateZDeg, settle),
      };
    };
    const flight = playPose(
      flyer,
      pose,
      (p) => ({
        transform: `translate(${p.x}px, ${p.y + p.translateYPx}px) rotate(${p.rotate}deg) rotateY(${p.rotateYDeg}deg) scale(${p.scale})`,
      }),
      phases.totalMs,
      { samples: 36 }
    );

    // The face exists only from the flip midpoint on, when the card is edge-on (row 14).
    let face = null;
    later(() => {
      if (gen !== generation) return;
      face = cardFace(card, slot);
      front.append(face);
      if (tier >= 1) {
        const sweep = el('div', 'bb-sweep');
        front.append(sweep);
        playPose(
          sweep,
          (t) => lerp(-120, 120, t),
          (x) => ({ transform: `translateX(${x}%) skewX(-18deg)` }),
          SWEEP_MS,
          { delay: phases.flipMs / 2, samples: 8 }
        );
      }
      if (tier >= 2) playHitFlare(front, card, tier, phases);
    }, phases.liftMs + phases.flipMs / 2);

    await withBackstop(flight);
    if (gen !== generation || !flyer.isConnected) return;
    const node = fanCard(packIndex, cardIndex, face || cardFace(card, slot));
    flyer.remove();
    fan.append(node);
    layoutFan(fan);
    updateRevealRow(packIndex);
  };

  // A local flare and sparks, both inside the card's own clipped layer (rows 2, 12).
  const playHitFlare = (front, card, tier, phases) => {
    if (fxDisabled()) return;
    const flare = flareFor(card);
    const sparks = el('div', 'bb-sparks');
    front.append(flare, sparks);
    const startT = phases.flipMid;
    const remainingMs = phases.totalMs * (1 - startT);
    playPose(
      flare,
      (t) => cardRevealPose(lerp(startT, 1, t), { tier }).flare,
      (value) => ({ opacity: value }),
      remainingMs
    );
    const peakDelay = Math.max(0, phases.totalMs * (0.55 - startT));
    later(() => {
      if (!sparks.isConnected) return;
      spawnParticles(
        sparks,
        burstParticles({
          count: SPARK_COUNT,
          distance: CARD_W * 0.42,
          size: [3, 6],
          maxDelay: 0.2,
          seed: Math.round(fxRgbForCard(card)[0]) + tier,
        }),
        { color: rgbCss(brighten(fxRgbForCard(card), 0.5)), duration: SPARK_MS }
      );
    }, peakDelay);
  };

  // The last card of a pack unlocks the next pack in the tray without a re-render.
  const updateTrayPacks = () => {
    const next = nextPackToTear(getUnboxing());
    root.querySelectorAll('.bb-tray .bb-pack').forEach((pack) => {
      const isNext = Number(pack.dataset.pack) === next;
      pack.classList.toggle('is-next', isNext);
      const top = pack.querySelector('.bb-pack__top');
      if (top) top.disabled = !isNext;
    });
  };

  const afterReveal = (packIndex) => {
    updateRevealRow(packIndex);
    updateTrayPacks();
    updateControls();
    if (getUnboxing().stage === 'done') collapseScene();
  };

  const revealNext = async (packIndex) => {
    const lane = laneOf(packIndex);
    const gen = generation;
    const cardIndex = getUnboxing().revealed[packIndex];
    if (!dispatch({ type: 'revealCard', packIndex })) return;
    lane.busy = true;
    lane.current = animateReveal(packIndex, cardIndex);
    await lane.current;
    if (gen !== generation) return;
    lane.busy = false;
    lane.current = null;
    afterReveal(packIndex);
    if (lane.queued) {
      lane.queued = false;
      requestReveal(packIndex);
    }
  };

  // One reveal per completed flip; a press during a flip queues at most one more (row 6).
  const requestReveal = (packIndex) => {
    if (beatRunning || collapsing) return;
    const lane = laneOf(packIndex);
    if (lane.revealAll) return;
    if (lane.busy) {
      lane.queued = true;
      return;
    }
    revealNext(packIndex);
  };

  const revealAllPack = async (packIndex) => {
    const lane = laneOf(packIndex);
    if (lane.revealAll || beatRunning || collapsing) return;
    lane.revealAll = true;
    lane.queued = false;
    updateControls();
    const gen = generation;
    if (lane.current) await lane.current;
    if (gen !== generation) return;
    lane.busy = false;

    if (instant()) {
      const from = getUnboxing().revealed[packIndex];
      if (!dispatch({ type: 'revealAll', packIndex })) return;
      for (let cardIndex = from; cardIndex < CARDS_PER_PACK; cardIndex += 1) {
        await animateReveal(packIndex, cardIndex);
      }
      lane.revealAll = false;
      afterReveal(packIndex);
      return;
    }

    const tiers = packs[packIndex].map((_, cardIndex) => tierOf(packIndex, cardIndex));
    const beats = unboxingTimeline(getUnboxing(), { packIndex, tiers }).filter(
      (beat) => beat.kind !== 'collapse'
    );
    const flights = beats.map(
      (beat) =>
        new Promise((resolve) => {
          later(() => {
            if (gen !== generation) return resolve();
            if (getUnboxing().revealed[packIndex] !== beat.cardIndex) return resolve();
            if (!dispatch({ type: 'revealCard', packIndex })) return resolve();
            updateRevealRow(packIndex);
            animateReveal(packIndex, beat.cardIndex).then(resolve);
          }, beat.at);
        })
    );
    await Promise.all(flights);
    if (gen !== generation) return;
    lane.revealAll = false;
    afterReveal(packIndex);
  };

  // ── End of the scene ─────────────────────────────────────────────────
  const collapseRow = (row, durationMs = FAN_COLLAPSE_MS) =>
    playPose(
      row,
      (t) => ({ scale: lerp(1, COLLAPSE_SCALE, easeOut(t)), opacity: 1 - t }),
      ({ scale, opacity }) => ({ transform: `scale(${scale})`, opacity }),
      durationMs,
      { samples: 12 }
    );

  const collapseScene = async () => {
    if (collapsing) return;
    collapsing = true;
    const gen = generation;
    sound(unboxingVoiceFor('finish'));
    const rows = [...root.querySelectorAll('.bb-reveal')];
    await withBackstop(Promise.all(rows.map((row) => collapseRow(row))));
    collapsing = false;
    if (gen !== generation) return;
    render();
    onBuildDeck();
  };

  // Skip scene: a pack mid-reveal is revealed first, since `finish` refuses mid-pack.
  const skipScene = () => {
    if (collapsing) return;
    let u = getUnboxing();
    if (u.stage === 'done') return;
    u.packsTorn.forEach((torn, packIndex) => {
      if (torn && u.revealed[packIndex] < CARDS_PER_PACK) {
        dispatch({ type: 'revealAll', packIndex });
      }
    });
    u = getUnboxing();
    if (u.stage !== 'done' && !dispatch({ type: 'finish' })) return;
    sound(unboxingVoiceFor('finish'));
    render();
    onBuildDeck();
  };

  // ── Tear input: drag ≥ 40 % across, or press (row 5); Enter/Space on the button ─
  function bindTear(target, { widthOf, onProgress, onSpring, onTear }) {
    let drag = null;
    target.addEventListener('pointerdown', (event) => {
      if (target.disabled || event.button !== 0) return;
      drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, moved: 0, fired: false };
      target.setPointerCapture?.(event.pointerId);
    });
    target.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || drag.fired) return;
      drag.dx = Math.abs(event.clientX - drag.x0);
      drag.moved = Math.max(drag.moved, Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0));
      if (drag.moved < TAP_SLOP_PX) return;
      const progress = packTearProgress(drag.dx, widthOf());
      if (packTornAt(progress)) {
        drag.fired = true;
        onTear(progress);
        return;
      }
      onProgress(progress);
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { dx, moved, fired } = drag;
      drag = null;
      if (fired) return;
      const progress = packTearProgress(dx, widthOf());
      const outcome =
        event.type === 'pointercancel'
          ? 'spring'
          : tearReleaseOutcome({ dxPx: dx, movedPx: moved, widthPx: widthOf() });
      if (outcome === 'tear') onTear(progress);
      else onSpring(progress);
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
    // Pointer presses are handled on release; `detail === 0` is Enter/Space or a scripted click.
    target.addEventListener('click', (event) => {
      if (event.detail === 0 && !target.disabled) onTear(0);
    });
  }

  render();

  return {
    unmount: () => {
      teardown();
      root.replaceChildren();
    },
  };
};
