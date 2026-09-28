import { buildHoloCard, startHoloAnimation } from '../../../setup/deck-builder/core/holo.mjs';
import {
  BOX_PROPORTIONS,
  boxFaceTexture,
  packArtSrc,
} from '../../../setup/deck-builder/core/build-battle/box-textures.mjs';
import { packFlyParams, peelSide } from '../../../setup/deck-builder/core/build-battle/pack3d.mjs';
import {
  CARDS_PER_PACK,
  DECK_UNWRAP_MS,
  FAN_COLLAPSE_MS,
  HIT_FLIP_MS,
  HIT_HOLD_MS,
  LID_OPEN_MS,
  PACK_ARTS,
  PACK_FLY_MS,
  PACK_FLY_STAGGER_MS,
  PACK_TEAR_MS,
  PACK_TORN_AT,
  POCKET_CUT_MS,
  PROMO_HOLD_MS,
  PROMO_LIFT_MS,
  REVEAL_STAGGER_MS,
  SCENE_BACKSTOP_MS,
  SUMMARY_STAGGER_MS,
  SWIPE_AWAY_MS,
  TAP_SLOP_PX,
  TRAY_TOTAL_MS,
  WRAP_TEAR_MS,
  faceMatrix3d,
  hitFlipPose,
  hitTierFor,
  lidPose,
  nextPackToTear,
  packArtIndexes,
  packFlyPose,
  packSlotKind,
  packSpreadSlot,
  packTearEdge,
  packTearProgress,
  packTornAt,
  promoLiftPose,
  swipeAwayPose,
  swipeOutcome,
  tearReleaseOutcome,
  trayRisePose,
  unboxingHoloRarity,
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
 * The Build & Battle unboxing scene (design 052 § DOM twin, Pocket-style rework in § Deviations):
 * a CSS 3D box under shrink-wrap, a hinged lid, the tray (deck, promo, code card, tip sheet); the
 * four packs then fly out of the box and fill the screen, each is swiped open in turn, and its
 * cards are swiped off one at a time (hits turn over first), ending on a ten-card summary. Every beat is `dispatch(event)` (reducer + save)
 * first, then sound, then the pose sampled from unboxing.mjs; a beat that is refused does nothing.
 * The DOM re-renders the settled state after each beat, so a reload lands on the same picture.
 */

const BOX_W = 200;
const BOX_H = Math.round(BOX_W * BOX_PROPORTIONS.height);
const BOX_D = Math.round(BOX_W * BOX_PROPORTIONS.depth);
const SPRING_BACK_MS = 160;
const FADE_TOP_MS = 320;
// The WebGL pack stage (design 054), loaded only when a box is opened.
const PACK_STAGE_MODULE = './native-deck-builder-pack3d.js';
const DRAG_TILT = 0.06;
const SWEEP_MS = 420;
const SPARK_COUNT = 16;
const SPARK_MS = 640;
const COLLAPSE_SCALE = 0.2;
const SET_LOGO_URL = 'https://assets.tcgdex.net/en/me/me02/logo.webp';
const KEY_ART_URL = 'https://assets.tcgdex.net/en/me/me02/125/high.webp';

const easeOut = (t) => 1 - (1 - t) ** 3;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A drag writes inline transforms; a pose that finished earlier still fills and would win.
const dropPoses = (node) =>
  node
    ?.getAnimations?.()
    .filter((animation) => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition))
    .forEach((animation) => animation.cancel());

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

  // Bumped by every render: async continuations from an older picture stop touching the DOM.
  let generation = 0;
  let holoStops = [];
  let timers = new Set();
  // A beat or a card move is playing; input waits, and one tap made meanwhile plays after it.
  let busy = false;
  let queuedTap = false;
  // Bumped to stop "Reveal all"; a render does not stop it, since every swipe re-renders.
  let autoToken = 0;
  let autoRevealing = false;
  let collapsing = false;
  // View state that is never saved, so a reload lands on the settled picture of the state: the
  // packs have left the box, the pack whose ten cards are laid out, the hits already turned over.
  const initialStage = getUnboxing().stage;
  let packsOut = initialStage === 'deckShown' || initialStage === 'packs';
  let summaryPack = null;
  const flippedHits = new Set();
  // The 3D pack stage: `packStage` draws the spread (`data-render='3d'`); a stage that became ready
  // mid-beat waits in `pendingStage` for the next settled picture. Null → the DOM scene (row 1).
  let packStage = null;
  let pendingStage = null;
  let unmounted = false;

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  const onResize = () => root.querySelectorAll('.bb-spread').forEach(layoutSpread);
  window.addEventListener('resize', onResize);

  const teardown = () => {
    generation += 1;
    holoStops.forEach((stop) => stop());
    holoStops = [];
    timers.forEach((id) => clearTimeout(id));
    timers = new Set();
    busy = false;
  };

  /**
   * The card's face in a holder: a holo node when it wears foil, a plain image otherwise. A failed
   * image swaps for the fallback inside the holder.
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

  // ── Which picture the state shows ────────────────────────────────────
  const lastTorn = (u) => u.packsTorn.lastIndexOf(true);

  const viewOf = (u) => {
    if (summaryPack !== null) return 'summary';
    if (u.stage === 'packs') {
      return u.revealed[lastTorn(u)] < CARDS_PER_PACK ? 'pocket' : 'spread';
    }
    if (u.stage === 'deckShown' && packsOut) return 'spread';
    return 'box';
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

  // ── Tray: the deck, its promo and the paper; the packs stay in the box until they fly ──
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

  const renderProp = (kind, title, sub) => {
    const prop = el('div', `bb-prop bb-prop--${kind}`);
    prop.append(el('strong', '', title), el('span', '', sub));
    return prop;
  };

  const renderTray = (u) => {
    const tray = el('div', 'bb-tray');
    tray.append(trayItem(0, renderDeck(u)));
    if (u.stage !== 'opened') tray.append(renderPromo());
    tray.append(
      trayItem(1, renderProp('code', 'Code card', 'Pokémon TCG Live')),
      trayItem(2, renderProp('tips', 'How to play', 'Quick-start sheet'))
    );
    return tray;
  };

  // ── Spread: the sealed packs fill the screen, the next one centred ────
  const renderBigPack = (u, packIndex, focus) => {
    const pack = el('div', 'bb-bigpack');
    pack.dataset.pack = String(packIndex);
    const fly = el('div', 'bb-bigpack__fly');
    const bodyEl = el('div', 'bb-pack__body');
    bodyEl.append(packArt('bb-pack__art', packIndex), el('div', 'bb-pack__foil'));
    fly.append(bodyEl);
    if (packIndex === focus) {
      pack.classList.add('is-focus');
      const strip = el('div', 'bb-pack__strip');
      strip.style.clipPath = tearEdges[packIndex];
      strip.append(packArt('bb-pack__art', packIndex));
      const cut = el('div', 'bb-cutline');
      const top = button('bb-pack__top', `Swipe across pack ${packIndex + 1} to open it`);
      top.disabled = packIndex !== nextPackToTear(u);
      const widthOf = () => top.clientWidth || 200;
      const stripShift = (progress) => widthOf() * progress * 0.5;
      bindTear(top, {
        widthOf,
        // With the 3D stage the finger peels the WebGL strip; the cut line runs from the grabbed end.
        onStart: (event) => {
          if (!packStage) return;
          const side = peelSide(event.clientX, pack.getBoundingClientRect());
          cut.style.transformOrigin = side === 1 ? '0 50%' : '100% 50%';
          packStage.beginTear({ packIndex, side });
        },
        onProgress: (progress) => {
          cut.style.transform = `scaleX(${Math.min(1, progress / PACK_TORN_AT)})`;
          if (packStage) {
            packStage.setTearProgress(progress);
            return;
          }
          strip.style.transform = `translateX(${stripShift(progress)}px) rotate(${progress * 6}deg)`;
        },
        onSpring: (progress) => {
          cut.style.transform = 'scaleX(0)';
          if (packStage) return packStage.springBack(progress);
          return playPose(
            strip,
            (t) => lerp(stripShift(progress), 0, easeOut(t)),
            (x) => ({ transform: `translateX(${x}px)` }),
            SPRING_BACK_MS,
            { samples: 8 }
          );
        },
        onTear: (progress) => beatTearPack(packIndex, stripShift(progress), progress),
      });
      fly.append(strip, cut, top);
    }
    pack.append(fly);
    return pack;
  };

  const renderSpread = (u) => {
    const spread = el('div', 'bb-spread');
    const focus = nextPackToTear(u);
    spread.dataset.focus = String(focus);
    packs.forEach((_, packIndex) => {
      if (!u.packsTorn[packIndex]) spread.append(renderBigPack(u, packIndex, focus));
    });
    return spread;
  };

  const spreadSlotOf = (node, spread) => {
    const focusEl = spread.querySelector('.bb-bigpack.is-focus');
    return packSpreadSlot(Number(node.dataset.pack), Number(spread.dataset.focus), focusEl?.offsetWidth || 200);
  };

  function layoutSpread(spread) {
    spread.querySelectorAll('.bb-bigpack').forEach((node) => {
      const slot = spreadSlotOf(node, spread);
      node.style.transform = `translate(-50%, -50%) translateX(${slot.xPx.toFixed(1)}px) scale(${slot.scale})`;
      node.style.filter = slot.brightness < 1 ? `brightness(${slot.brightness})` : '';
      node.style.zIndex = String(slot.zIndex);
    });
  }

  // ── Pocket: the opened pack's cards, one at a time ────────────────────
  const hitKey = (packIndex, cardIndex) => `${packIndex}:${cardIndex}`;
  const isHiddenHit = (packIndex, cardIndex) =>
    tierOf(packIndex, cardIndex) >= 2 && !flippedHits.has(hitKey(packIndex, cardIndex));

  // Two faces back to back; a hit starts turned over and shows its glowing back until tapped.
  const renderPocketCard = (packIndex, cardIndex, { top }) => {
    const card = packs[packIndex]?.[cardIndex];
    const node = top ? button('bb-pcard is-top', 'Swipe the card away') : el('div', 'bb-pcard is-under');
    node.dataset.cardIndex = String(cardIndex);
    if (card?.id) node.dataset.previewCardId = card.id;
    const flip = el('div', 'bb-pcard__flip');
    const front = el('div', 'bb-pcard__front');
    front.append(cardFace(card, slotOf(packIndex, cardIndex)));
    const back = el('div', 'bb-pcard__back');
    back.append(cardBackImg('bb-pcard__back-img'));
    flip.append(front, back);
    node.append(flip);
    if (isHiddenHit(packIndex, cardIndex)) {
      node.classList.add('is-hit');
      node.dataset.tier = String(tierOf(packIndex, cardIndex));
      flip.style.transform = 'rotateY(180deg)';
      if (top) node.setAttribute('aria-label', 'A rare card: tap to turn it over');
    }
    if (top) bindSwipe(node, packIndex);
    return node;
  };

  const renderPocket = (u, packIndex) => {
    const pocket = el('div', 'bb-pocket');
    pocket.dataset.pack = String(packIndex);
    const shown = u.revealed[packIndex];
    const count = el('p', 'bb-pocket__count', `Pack ${packIndex + 1} · ${shown + 1} / ${CARDS_PER_PACK}`);
    const stack = el('div', 'bb-pocket__stack');
    const beneath = CARDS_PER_PACK - shown - 1;
    for (let depth = Math.min(beneath - 1, 4); depth >= 1; depth -= 1) {
      const edge = el('div', 'bb-pocket__edge');
      edge.style.setProperty('--bb-depth', String(depth));
      stack.append(edge);
    }
    if (beneath > 0) stack.append(renderPocketCard(packIndex, shown + 1, { top: false }));
    stack.append(renderPocketCard(packIndex, shown, { top: true }));
    const seen = el('div', 'bb-pocket__seen');
    for (let cardIndex = 0; cardIndex < shown; cardIndex += 1) {
      const card = packs[packIndex]?.[cardIndex];
      const thumb = el('div', 'bb-pocket__thumb');
      if (card?.id) thumb.dataset.previewCardId = card.id;
      thumb.title = card?.name || '';
      thumb.append(cardFace(card, slotOf(packIndex, cardIndex)));
      seen.append(thumb);
    }
    pocket.append(count, stack, seen);
    return pocket;
  };

  const renderSummary = (packIndex) => {
    const pocket = el('div', 'bb-pocket is-summary');
    pocket.dataset.pack = String(packIndex);
    const grid = el('div', 'bb-summary');
    packs[packIndex].forEach((card, cardIndex) => {
      const cell = el('div', 'bb-summary__card');
      cell.dataset.cardIndex = String(cardIndex);
      if (card?.id) cell.dataset.previewCardId = card.id;
      cell.title = card?.name || '';
      cell.append(cardFace(card, slotOf(packIndex, cardIndex)));
      grid.append(cell);
    });
    pocket.append(el('p', 'bb-pocket__count', `Pack ${packIndex + 1}`), grid);
    return pocket;
  };

  // ── Dock: hint and controls ──────────────────────────────────────────
  const hintFor = (u, view) => {
    if (view === 'summary') {
      return u.stage === 'done'
        ? 'All four packs are open. Your deck is ready to build.'
        : `Pack ${summaryPack + 1} done. On to pack ${nextPackToTear(u) + 1}.`;
    }
    if (view === 'pocket') {
      const packIndex = lastTorn(u);
      return isHiddenHit(packIndex, u.revealed[packIndex])
        ? 'Something rare! Tap the card to turn it over.'
        : 'Swipe the card away to see the next one.';
    }
    if (view === 'spread') return `Swipe across the top of pack ${nextPackToTear(u) + 1} to open it.`;
    if (u.stage === 'sealed') {
      return u.wrapTorn ? 'Open the lid.' : 'Drag across the shrink-wrap to tear it off, or press it.';
    }
    if (u.stage === 'opened') return 'Unwrap the deck to see its foil promo.';
    if (u.stage === 'deckShown') return 'Here come your packs…';
    return 'All four packs are open. Build your deck from your pool.';
  };

  const control = (label, name, onClick, primary = false) => {
    const node = el('button', primary ? 'bb-primary' : 'bb-secondary', label);
    node.type = 'button';
    node.dataset.control = name;
    node.addEventListener('click', onClick);
    return node;
  };

  const renderDock = (u, view) => {
    const dock = el('div', 'bb-dock');
    const hint = el('p', 'bb-hint', hintFor(u, view));
    hint.setAttribute('role', 'status');
    const controls = el('div', 'bb-controls');
    if (view === 'pocket') {
      controls.append(control('Reveal all', 'reveal-all', () => revealAllPack(lastTorn(getUnboxing()))));
    }
    if (view === 'summary' && u.stage === 'done') {
      controls.append(control('Build your deck', 'build', finishScene, true));
    } else if (view === 'summary') {
      controls.append(control('Next pack', 'next-pack', showNextPack, true));
    } else if (u.stage === 'done') {
      controls.append(control('Build your deck', 'build', onBuildDeck, true));
    }
    if (u.stage !== 'done') controls.append(control('Skip scene', 'skip', skipScene));
    dock.append(hint, controls);
    return dock;
  };

  const updateDock = () => {
    const u = getUnboxing();
    const hint = root.querySelector('.bb-hint');
    if (hint) hint.textContent = hintFor(u, viewOf(u));
    const revealAll = root.querySelector('[data-control="reveal-all"]');
    if (revealAll) revealAll.disabled = autoRevealing;
  };

  // ── Render (the settled picture of the state) ────────────────────────
  const render = ({ entrance = null } = {}) => {
    teardown();
    const u = getUnboxing();
    const view = viewOf(u);
    // A new picture lands every 3D animation, except the rip's own hand-off to the pocket.
    if (entrance?.cut3d === undefined) {
      packStage?.jumpToEnd();
      packStage?.clearCards();
    }
    root.replaceChildren();
    adoptPackStage();
    if (packStage) root.append(packStage.canvas);
    root.dataset.render = packStage ? '3d' : 'dom';
    root.dataset.stage = u.stage;
    root.dataset.view = view;
    root.dataset.wrap = u.wrapTorn ? 'off' : 'on';

    // The box stays on screen while the packs fly out of it, then fades.
    if (view === 'box' || entrance?.fly) {
      const top = el('div', 'bb-scene__top');
      top.append(renderBox(u));
      if (u.stage !== 'sealed') top.append(renderTray(u));
      root.append(top);
    }
    if (view === 'spread') root.append(renderSpread(u));
    if (view === 'pocket') root.append(renderPocket(u, lastTorn(u)));
    if (view === 'summary') root.append(renderSummary(summaryPack));
    root.append(renderDock(u, view));
    root.querySelectorAll('.bb-spread').forEach(layoutSpread);
    // A fly entrance hands the packs to the stage itself, from the box mouth.
    if (!entrance?.fly) syncPackStage(view);
    updateDock();
    playEntrance(entrance);
  };

  // ── 3D pack stage (design 054 § Scene integration) ───────────────────
  const spreadAnchors = () => [...root.querySelectorAll('.bb-spread .bb-bigpack')];
  const spreadFocus = () => Number(root.querySelector('.bb-spread')?.dataset.focus) || 0;

  // The top card the stack shows when pack `packIndex` is ripped: a hit stays face down (row 16).
  const topCardOf = (packIndex) => ({
    imageUrl: cardImage(packs[packIndex]?.[0], 'small') || null,
    faceDown: isHiddenHit(packIndex, 0),
  });

  function syncPackStage(view) {
    if (!packStage) return;
    if (view === 'spread') {
      const focus = spreadFocus();
      packStage.showSpread({ anchors: spreadAnchors(), focus, topCard: topCardOf(focus) });
    } else packStage.hide();
  }

  function adoptPackStage() {
    if (!pendingStage) return;
    packStage = pendingStage;
    pendingStage = null;
  }

  // Context lost or FX switched off: the DOM scene takes over at the same state (row 12).
  const dropPackStage = () => {
    pendingStage?.dispose();
    pendingStage = null;
    const live = packStage;
    packStage = null;
    if (!live) return;
    live.dispose();
    if (!unmounted) render();
  };

  // Any failure (no WebGL, a 404 on three or the pack art) leaves the DOM scene as it is, quietly.
  const loadPackStage = () => {
    if (initialStage === 'done' || fxDisabled()) return;
    import(PACK_STAGE_MODULE)
      .then((module) =>
        module.createPackStage({
          host: root,
          seed,
          packArtUrls: packs.map((_, packIndex) => `/${packArtSrc(PACK_ARTS[artIndexes[packIndex]])}`),
          cardBackUrl: resolveDefaultCardBackSrc(),
          onLost: dropPackStage,
        })
      )
      .catch(() => null)
      .then((stage) => {
        if (!stage) return;
        if (unmounted || fxDisabled()) {
          stage.dispose();
          return;
        }
        pendingStage = stage;
        if (busy) return;
        // Idle: take over the current picture now (a box is not drawn in 3D, so only a spread changes).
        adoptPackStage();
        root.append(packStage.canvas);
        root.dataset.render = '3d';
        syncPackStage(viewOf(getUnboxing()));
      });
  };

  // ── Entrances (played on the freshly rendered picture) ───────────────
  const holdWhile = (promise) => {
    const gen = generation;
    busy = true;
    return withBackstop(promise).then(() => {
      if (gen !== generation) return false;
      busy = false;
      if (queuedTap) {
        queuedTap = false;
        tapTop();
      }
      return true;
    });
  };

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
      later(flyOut, instant() ? 0 : PROMO_LIFT_MS + PROMO_HOLD_MS);
    }
    if (entrance?.fly) playFly(entrance.fly);
    if (entrance?.cut !== undefined) playCut();
    if (entrance?.cut3d !== undefined) playCut3d();
    if (entrance === 'summary') playDeal();
    if (entrance === 'spread') playSpreadIn();
    if (entrance === 'sweep') playSweep();
  };

  // The four packs leave the box mouth one after another and land in the spread.
  const playFly = (boxRect) => {
    const top = root.querySelector('.bb-scene__top');
    const fade = playPose(top, (t) => 1 - t, (opacity) => ({ opacity }), FADE_TOP_MS, { samples: 8 }).then(
      () => top?.remove()
    );
    const spread = root.querySelector('.bb-spread');
    if (!spread || !boxRect) {
      syncPackStage(viewOf(getUnboxing()));
      holdWhile(fade);
      return;
    }
    if (packStage) {
      playFly3d(spread, boxRect, fade);
      return;
    }
    const flights = [...spread.querySelectorAll('.bb-bigpack')].map((node, order) => {
      const slot = spreadSlotOf(node, spread);
      const params = packFlyParams(boxRect, node.getBoundingClientRect(), slot.scale);
      if (!params) return Promise.resolve();
      const delay = order * PACK_FLY_STAGGER_MS;
      later(() => sound('unbox-unwrap'), instant() ? 0 : delay);
      return playPose(
        node.querySelector('.bb-bigpack__fly'),
        (t) => packFlyPose(t, params),
        (pose) => ({
          transform: `translate(${pose.translateXPx}px, ${pose.translateYPx}px) rotate(${pose.rotateZDeg}deg) scale(${pose.scale})`,
        }),
        PACK_FLY_MS,
        { delay, samples: 28 }
      );
    });
    holdWhile(Promise.all([fade, ...flights]));
  };

  // The same flight in WebGL: the stage turns each pack in from its silver back as it lands. The
  // anchors' tear buttons (and their glint) stay hidden until the packs are down.
  const playFly3d = (spread, boxRect, fade) => {
    spread.classList.add('is-landing');
    const focus = spreadFocus();
    const flights = packStage.showSpread({
      anchors: spreadAnchors(),
      focus,
      fromBoxRect: boxRect,
      topCard: topCardOf(focus),
    });
    holdWhile(Promise.all([fade, flights])).then((current) => {
      if (!current) return;
      packStage?.jumpToEnd();
      spread.classList.remove('is-landing');
    });
  };

  // The 3D stack glides onto the pocket's top card, then in one frame the DOM stack shows and the
  // WebGL stack goes (the pocket renders hidden, layout kept, until then).
  const playCut3d = () => {
    const pocket = root.querySelector('.bb-pocket');
    const top = root.querySelector('.bb-pcard.is-top');
    if (!packStage || !pocket || !top) {
      packStage?.jumpToEnd();
      packStage?.clearCards();
      return;
    }
    pocket.classList.add('is-awaiting-3d');
    const gen = generation;
    holdWhile(packStage.settleStackTo(top.getBoundingClientRect())).then(() => {
      if (gen !== generation) return;
      // A backstop that won (hidden tab) lands whatever is still playing.
      packStage?.jumpToEnd();
      requestAnimationFrame(() => {
        if (gen !== generation) return;
        pocket.classList.remove('is-awaiting-3d');
        packStage?.clearCards();
      });
    });
  };

  // The torn pack drops away as its cards rise into the centre.
  const playCut = () => {
    const stack = root.querySelector('.bb-pocket__stack');
    if (!stack || instant()) return;
    const u = getUnboxing();
    const packIndex = lastTorn(u);
    const packEl = el('div', 'bb-pocket__pack');
    packEl.style.clipPath = packBodyClip(tearEdges[packIndex]);
    packEl.append(packArt('bb-pack__art', packIndex), el('div', 'bb-pack__foil'));
    stack.after(packEl);
    const drop = playPose(
      packEl,
      (t) => ({ y: 70 * easeOut(t), opacity: 1 - Math.max(0, (t - 0.35) / 0.65) }),
      ({ y, opacity }) => ({ transform: `translate(-50%, -50%) translateY(${y}vh)`, opacity }),
      POCKET_CUT_MS * 1.6,
      { samples: 12 }
    ).then(() => packEl.remove());
    const rise = playPose(
      stack,
      (t) => ({ y: lerp(140, 0, easeOut(t)), scale: lerp(0.8, 1, easeOut(t)), opacity: Math.min(1, t * 2) }),
      ({ y, scale, opacity }) => ({ transform: `translateY(${y}px) scale(${scale})`, opacity }),
      POCKET_CUT_MS,
      { delay: 120, samples: 12 }
    );
    holdWhile(Promise.all([drop, rise]));
  };

  const playDeal = () => {
    root.querySelectorAll('.bb-summary__card').forEach((cell, index) =>
      playPose(
        cell,
        (t) => ({ y: lerp(28, 0, easeOut(t)), scale: lerp(0.86, 1, easeOut(t)), opacity: t }),
        ({ y, scale, opacity }) => ({ transform: `translateY(${y}px) scale(${scale})`, opacity }),
        SWIPE_AWAY_MS,
        { delay: index * SUMMARY_STAGGER_MS, samples: 8 }
      )
    );
  };

  const playSpreadIn = () => {
    root.querySelectorAll('.bb-bigpack__fly').forEach((fly, index) =>
      playPose(
        fly,
        (t) => ({ x: lerp(160, 0, easeOut(t)), opacity: t }),
        ({ x, opacity }) => ({ transform: `translateX(${x}px)`, opacity }),
        PACK_FLY_MS / 2,
        { delay: index * PACK_FLY_STAGGER_MS * 0.5, samples: 10 }
      )
    );
  };

  // A reverse-holo slot catches the light as it comes to the top.
  const playSweep = () => {
    const front = root.querySelector('.bb-pcard.is-top .bb-pcard__front');
    if (!front || fxDisabled()) return;
    sound(unboxingVoiceFor('revealCard', 1));
    const sweep = el('div', 'bb-sweep');
    front.append(sweep);
    playPose(
      sweep,
      (t) => lerp(-120, 120, t),
      (x) => ({ transform: `translateX(${x}%) skewX(-18deg)` }),
      SWEEP_MS,
      { samples: 8 }
    ).then(() => sweep.remove());
  };

  // ── Beats ─────────────────────────────────────────────────────────────
  const runBeat = async (event, effect, animate, entrance) => {
    if (busy || collapsing) return;
    if (!dispatch(event)) return;
    busy = true;
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

  function flyOut() {
    if (packsOut) return;
    const boxRect = root.querySelector('.bb-box')?.getBoundingClientRect() || null;
    packsOut = true;
    render({ entrance: { fly: boxRect } });
  }

  const beatTearPack = (packIndex, fromShiftPx = 0, fromProgress = 0) => {
    if (packStage) {
      beatTearPack3d(packIndex, fromProgress);
      return;
    }
    const focus = root.querySelector(`.bb-bigpack[data-pack="${packIndex}"]`);
    const strip = focus?.querySelector('.bb-pack__strip');
    const cut = focus?.querySelector('.bb-cutline');
    if (cut) cut.style.transform = 'scaleX(1)';
    const travel = (strip?.clientWidth || 200) * 1.2;
    runBeat(
      { type: 'tearPack', packIndex },
      unboxingVoiceFor('tearPack'),
      () =>
        playPose(
          strip,
          (t) => ({ x: lerp(fromShiftPx, travel, easeOut(t)), y: -60 * t, rotate: lerp(4, 24, t), opacity: 1 - t }),
          ({ x, y, rotate, opacity }) => ({ transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`, opacity }),
          PACK_TEAR_MS
        ),
      { cut: packIndex }
    );
  };

  // The WebGL rip: the strip finishes tearing and flies, the cards rise out of the mouth and the
  // pack drops away; the pocket then takes over (`cut3d`). The cut line gives way to the torn edge.
  const beatTearPack3d = (packIndex, fromProgress) => {
    const focus = root.querySelector(`.bb-bigpack[data-pack="${packIndex}"]`);
    const cut = focus?.querySelector('.bb-cutline');
    runBeat(
      { type: 'tearPack', packIndex },
      unboxingVoiceFor('tearPack'),
      () => {
        if (cut) cut.style.transform = 'scaleX(0)';
        // The tear button's hint, glint and focus ring would float over the flying strip.
        focus?.classList.add('is-ripping');
        return packStage ? packStage.rip({ fromProgress, topCard: topCardOf(packIndex) }) : Promise.resolve();
      },
      { cut3d: packIndex }
    );
  };

  // ── Card moves: swipe the top card away, or turn a hit over ──────────
  const topCard = () => root.querySelector('.bb-pcard.is-top');

  function tapTop() {
    const node = topCard();
    if (!node) return Promise.resolve();
    const packIndex = lastTorn(getUnboxing());
    const cardIndex = Number(node.dataset.cardIndex);
    return isHiddenHit(packIndex, cardIndex) ? flipHit(node, packIndex, cardIndex) : swipeAway(1, 0);
  }

  const flareFor = (card) => {
    const flare = el('div', 'bb-flare');
    flare.style.setProperty('--bb-flare-rgb', rgbCss(brighten(fxRgbForCard(card), 0.45), 0.95));
    return flare;
  };

  // A local flare and sparks, inside the card's own clipped face (rows 2, 12).
  const playHitFlare = (front, card, tier) => {
    if (fxDisabled()) return;
    const flare = flareFor(card);
    const sparks = el('div', 'bb-sparks');
    front.append(flare, sparks);
    playPose(flare, (t) => hitFlipPose(t, { tier }).flare, (value) => ({ opacity: value }), HIT_FLIP_MS);
    later(() => {
      if (!sparks.isConnected) return;
      spawnParticles(
        sparks,
        burstParticles({
          count: SPARK_COUNT,
          distance: (front.clientWidth || 200) * 0.42,
          size: [3, 7],
          maxDelay: 0.2,
          seed: Math.round(fxRgbForCard(card)[0]) + tier,
        }),
        { color: rgbCss(brighten(fxRgbForCard(card), 0.5)), duration: SPARK_MS }
      );
    }, instant() ? 0 : HIT_FLIP_MS * 0.5);
  };

  // Turning over a hit: the face is on the far side from the start (backface-visibility), so it
  // can only be seen once the card passes edge-on (row 14).
  const flipHit = async (node, packIndex, cardIndex) => {
    if (busy || collapsing) return;
    const tier = tierOf(packIndex, cardIndex);
    const card = packs[packIndex]?.[cardIndex];
    const flip = node.querySelector('.bb-pcard__flip');
    sound(unboxingVoiceFor('revealCard', tier));
    node.classList.add('is-turning');
    playHitFlare(node.querySelector('.bb-pcard__front'), card, tier);
    const turned = playPose(
      flip,
      (t) => hitFlipPose(t, { tier }),
      (pose) => ({ transform: `rotateY(${pose.rotateYDeg}deg) scale(${pose.scale})` }),
      HIT_FLIP_MS,
      { samples: 32 }
    );
    flippedHits.add(hitKey(packIndex, cardIndex));
    const current = await holdWhile(turned);
    if (!current) return;
    node.classList.remove('is-hit', 'is-turning');
    node.classList.add('is-flipped');
    node.setAttribute('aria-label', 'Swipe the card away');
    updateDock();
  };

  const swipeAway = async (direction, fromPx) => {
    const node = topCard();
    if (!node || busy || collapsing) return;
    const u = getUnboxing();
    const packIndex = lastTorn(u);
    const cardIndex = u.revealed[packIndex];
    if (!dispatch({ type: 'revealCard', packIndex })) return;
    sound(unboxingVoiceFor('revealCard', 0));
    const distancePx = Math.max(window.innerWidth * 0.6, 360);
    dropPoses(node);
    const gone = playPose(
      node,
      (t) => swipeAwayPose(t, { direction, fromPx, distancePx }),
      (pose) => ({
        transform: `translate(${pose.translateXPx}px, ${pose.translateYPx}px) rotate(${pose.rotateZDeg}deg)`,
        opacity: pose.opacity,
      }),
      SWIPE_AWAY_MS,
      { samples: 16 }
    );
    const gen = generation;
    busy = true;
    await withBackstop(gone);
    if (gen !== generation) return;
    const next = getUnboxing();
    if (next.revealed[packIndex] >= CARDS_PER_PACK) {
      summaryPack = packIndex;
      if (next.stage === 'done') sound(unboxingVoiceFor('finish'));
      render({ entrance: 'summary' });
      return;
    }
    render({ entrance: tierOf(packIndex, cardIndex + 1) === 1 ? 'sweep' : null });
    if (queuedTap) {
      queuedTap = false;
      tapTop();
    }
  };

  // Drag the top card sideways; release past SWIPE_AT sends it off that side. A hit that is still
  // face down turns over instead, whatever the gesture.
  function bindSwipe(node, packIndex) {
    let drag = null;
    const widthOf = () => node.clientWidth || 200;
    const hidden = () => isHiddenHit(packIndex, Number(node.dataset.cardIndex));
    const follow = (dx) => {
      node.style.transform = `translateX(${dx}px) rotate(${dx * DRAG_TILT}deg)`;
    };
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (busy) {
        queuedTap = true;
        return;
      }
      dropPoses(node);
      drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, moved: 0 };
      node.setPointerCapture?.(event.pointerId);
    });
    node.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.dx = event.clientX - drag.x0;
      drag.moved = Math.max(drag.moved, Math.hypot(drag.dx, event.clientY - drag.y0));
      if (drag.moved >= TAP_SLOP_PX && !hidden()) follow(drag.dx);
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { dx, moved } = drag;
      drag = null;
      const outcome =
        event.type === 'pointercancel' ? 'spring' : swipeOutcome({ dxPx: dx, movedPx: moved, widthPx: widthOf() });
      if (hidden()) {
        if (outcome !== 'spring') tapTop();
        return;
      }
      if (outcome === 'tap') tapTop();
      else if (outcome === 'swipe') swipeAway(Math.sign(dx) || 1, dx);
      else {
        playPose(
          node,
          (t) => lerp(dx, 0, easeOut(t)),
          (x) => ({ transform: `translateX(${x}px) rotate(${x * DRAG_TILT}deg)` }),
          SPRING_BACK_MS,
          { samples: 8 }
        );
      }
    };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    // Pointer presses are handled on release; `detail === 0` is Enter/Space or a scripted click.
    node.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      if (busy) queuedTap = true;
      else tapTop();
    });
  }

  const waitIdle = async (token) => {
    while (busy && token === autoToken) await sleep(30);
  };

  // Reveal all: the same moves, played for the player; a hit still turns over and holds a beat.
  const revealAllPack = async (packIndex) => {
    if (autoRevealing || collapsing || packIndex < 0) return;
    autoRevealing = true;
    const token = (autoToken += 1);
    updateDock();
    const running = () =>
      token === autoToken && summaryPack === null && getUnboxing().revealed[packIndex] < CARDS_PER_PACK;
    while (running()) {
      await waitIdle(token);
      if (!running()) break;
      const node = topCard();
      if (!node) break;
      const cardIndex = Number(node.dataset.cardIndex);
      if (isHiddenHit(packIndex, cardIndex)) {
        await flipHit(node, packIndex, cardIndex);
        await sleep(instant() ? 0 : HIT_HOLD_MS);
      } else {
        await swipeAway(1, 0);
        await sleep(instant() ? 0 : REVEAL_STAGGER_MS);
      }
    }
    autoRevealing = false;
    updateDock();
  };

  function showNextPack() {
    if (busy || collapsing) return;
    summaryPack = null;
    render({ entrance: 'spread' });
  }

  // ── End of the scene ─────────────────────────────────────────────────
  const finishScene = async () => {
    if (collapsing) return;
    collapsing = true;
    await withBackstop(
      playPose(
        root.querySelector('.bb-pocket'),
        (t) => ({ scale: lerp(1, COLLAPSE_SCALE, easeOut(t)), opacity: 1 - t }),
        ({ scale, opacity }) => ({ transform: `scale(${scale})`, opacity }),
        FAN_COLLAPSE_MS,
        { samples: 12 }
      )
    );
    onBuildDeck();
  };

  // Skip scene: a pack mid-reveal is revealed first, since `finish` refuses mid-pack.
  function skipScene() {
    if (collapsing) return;
    autoToken += 1;
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
    summaryPack = null;
    render();
    onBuildDeck();
  }

  // ── Tear input: drag ≥ 40 % across, or press (row 5); Enter/Space on the button ─
  function bindTear(target, { widthOf, onStart, onProgress, onSpring, onTear }) {
    let drag = null;
    target.addEventListener('pointerdown', (event) => {
      if (target.disabled || busy || event.button !== 0) return;
      drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, moved: 0, fired: false };
      target.setPointerCapture?.(event.pointerId);
      onStart?.(event);
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
      if (event.detail === 0 && !target.disabled && !busy) onTear(0);
    });
  }

  render();
  loadPackStage();

  return {
    unmount: () => {
      unmounted = true;
      autoToken += 1;
      teardown();
      packStage?.jumpToEnd();
      packStage?.dispose();
      packStage = null;
      pendingStage?.dispose();
      pendingStage = null;
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
};
