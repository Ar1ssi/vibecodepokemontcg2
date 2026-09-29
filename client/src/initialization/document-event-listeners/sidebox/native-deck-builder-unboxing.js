import { getEnergyTokenFront } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { buildHoloCard, startHoloAnimation } from '../../../setup/deck-builder/core/holo.mjs';
import { productArt } from '../../../setup/deck-builder/core/build-battle/box-textures.mjs';
import { getCoinById } from '../../../setup/deck-builder/core/coins.mjs';
import { getSleeveById } from '../../../setup/deck-builder/core/sleeves.mjs';
import {
  CARDS_PER_PACK,
  COIN_FLIP_MS,
  DECK_UNWRAP_MS,
  DICE_MS,
  FAN_COLLAPSE_MS,
  HIT_FLIP_MS,
  HIT_HOLD_MS,
  LID_LIFT_MS,
  LID_OPEN_MS,
  PACK_COUNT,
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
  TRAY_ITEM_COUNT,
  WRAP_TEAR_MS,
  coinFlipPose,
  dicePose,
  faceMatrix3d,
  hitFlipPose,
  hitTierFor,
  liftLidPose,
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
  trayRiseMs,
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
 * cards are swiped off one at a time (hits turn over first), ending on a ten-card summary. An Elite
 * Trainer Box (design 055, `contents` set) lies flat under a lift-off lid; its tray holds the promo
 * pouch, tappable props and nine fanned packs that fly out when tapped. Every beat is `dispatch(event)` (reducer + save)
 * first, then sound, then the pose sampled from unboxing.mjs; a beat that is refused does nothing.
 * The DOM re-renders the settled state after each beat, so a reload lands on the same picture.
 */

const BOX_W = 200;
const SPRING_BACK_MS = 160;
const FADE_TOP_MS = 320;
// Where the flying packs start: the box's open mouth, as shares of the box host's rect.
const BOX_MOUTH_Y = 0.42;
const FLY_FROM_WIDTH = 0.4;
const DRAG_TILT = 0.06;
const SWEEP_MS = 420;
const SPARK_COUNT = 16;
const SPARK_MS = 640;
const COLLAPSE_SCALE = 0.2;
// Elite Trainer Box (design 055): the tray holds seven things before the packs (§ Scene beat 3).
const ETB_PROP_COUNT = 7;
const PROMO_SETTLE_MS = 360;
// The nine-pack spread keeps this much stage on either side of its outermost packs.
const SPREAD_MARGIN_PX = 16;
// A scene mounted without product art (row 9) draws the Build & Battle box with CSS faces only.
const PROCEDURAL_ONLY_ART = Object.freeze({ ...productArt('phantasmal-flames'), faces: Object.freeze({}) });

/** The box's pixel size: width fixed at BOX_W, height and depth from the product's proportions. */
const boxSizeFor = ({ height, depth }) => ({
  width: BOX_W,
  height: Math.round(BOX_W * height),
  depth: Math.round(BOX_W * depth),
});

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
const lidTransform = ({ rotateXDeg, translateYPx }, size) =>
  `translate3d(0, ${-size.height / 2 + translateYPx}px, ${-size.depth / 2}px) rotateX(${-rotateXDeg}deg)`;

// The lift-off lid rises toward the camera (+z) and slides back up the screen (−y); its tilt flips
// sign for CSS as lidTransform's does.
const liftLidTransform = ({ translateZPx, translateYPx, rotateXDeg }) =>
  `translate3d(0, ${translateYPx}px, ${translateZPx}px) rotateX(${-rotateXDeg}deg)`;

const dieTransform = ({ translateXPx, translateYPx, rotateXDeg, rotateYDeg, rotateZDeg }) =>
  `translate(${translateXPx}px, ${translateYPx}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg) rotateZ(${rotateZDeg}deg)`;

const coinTransform = ({ rotateXDeg, translateYPx }) => `translateY(${translateYPx}px) rotateX(${rotateXDeg}deg)`;

// Catalog art paths are relative to the client root (`src/assets/...`).
const assetSrc = (path) => (/^(https?:)?\//.test(path) ? path : `/${path}`);

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

const setLogo = (logoUrl) => {
  const block = el('div', 'bb-setlogo');
  block.append(el('span', 'bb-setlogo__mega', 'Mega Evolution'), el('span', 'bb-setlogo__name', 'Phantasmal Flames'));
  const logo = el('img', 'bb-setlogo__img');
  logo.alt = '';
  logo.src = logoUrl;
  logo.addEventListener('load', () => block.classList.add('has-logo'), { once: true });
  logo.addEventListener('error', () => logo.remove(), { once: true });
  block.append(logo);
  return block;
};

const proceduralFront = (art) => {
  const face = el('div', 'bb-pf bb-pf--front');
  const top = el('div', 'bb-pf__strip');
  const level = el('div', 'bb-level');
  level.append(el('span', 'bb-level__pill', 'Play level 2'));
  top.append(wordmark(), level, el('span', 'bb-age', '6+'));
  const keyArt = el('div', 'bb-keyart');
  keyArt.append(el('div', 'bb-keyart__slashes'));
  face.append(top, keyArt, setLogo(art.logoUrl), buildBattleTitle());
  return face;
};

// The key art only matters when the front texture is missing, so it loads on that failure only.
const mountKeyArt = (face, keyArtUrl) => {
  const art = face.querySelector('.bb-keyart');
  if (!art || art.querySelector('img')) return;
  const img = el('img', 'bb-keyart__img');
  img.alt = '';
  img.src = keyArtUrl;
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

const proceduralFace = (name, art) => {
  if (name === 'front') return proceduralFront(art);
  if (name === 'back') return proceduralBack();
  if (name === 'top' || name === 'bottom') return proceduralTop(name);
  return proceduralSide(name);
};

const faceSize = (name, size) => {
  if (name === 'left' || name === 'right') return [size.depth, size.height];
  if (name === 'top' || name === 'bottom') return [size.width, size.depth];
  return [size.width, size.height];
};

const faceTexture = (art, name) => (Object.hasOwn(art.faces, name) ? art.faces[name] : null);

/**
 * A vendored face photo, squared onto the face by `faceMatrix3d`; any failure keeps the CSS face.
 * A loaded photo is kept in `cache` and moved into the next render's face, so a re-render never
 * flashes the CSS face while the new image decodes.
 */
const mountTexture = (face, name, { art, size, textures: cache }) => {
  const texture = faceTexture(art, name);
  if (!texture) return;
  const cached = cache.get(name);
  if (cached) {
    face.classList.add('has-texture');
    face.append(cached);
    return;
  }
  const [width, height] = faceSize(name, size);
  let matrix;
  try {
    matrix = faceMatrix3d(texture.quad, width, height);
  } catch {
    if (name === 'front') mountKeyArt(face, art.keyArtUrl);
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
      if (name === 'front') mountKeyArt(face, art.keyArtUrl);
    },
    { once: true }
  );
  img.src = `/${texture.src}`;
  face.append(img);
};

const boxFace = (name, { wrapped, ...product }) => {
  const face = el('div', `bb-box__face bb-box__face--${name}`);
  face.append(proceduralFace(name, product.art));
  mountTexture(face, name, product);
  if (wrapped) face.append(el('div', 'bb-face__wrap'));
  return face;
};

// ── Elite Trainer Box faces (design 055 § Product art): lying flat, lid up ─
const energyTotal = (contents) => contents.energy.reduce((sum, [, count]) => sum + count, 0);

const etbPlate = () => el('div', 'etb-plate', 'Elite Trainer Box');

const etbLidFace = (art) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--lid');
  const keyArt = el('div', 'etb-keyart');
  const img = el('img', 'etb-keyart__img');
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => img.remove(), { once: true });
  img.src = art.keyArtUrl;
  keyArt.append(img, el('div', 'bb-keyart__slashes'));
  face.append(keyArt, etbPlate(), setLogo(art.logoUrl));
  return face;
};

const etbNearFace = ({ packCount }) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--near');
  face.append(etbPlate(), el('span', 'etb-pill', `${packCount} booster packs`));
  return face;
};

const etbInsideLines = ({ packCount, contents }) => {
  const { damageDice = 0, flipDie = 0, coin = 0, dividers = 0, guide = 0, codeCard = 0 } = contents.props || {};
  return [
    `${packCount} booster packs`,
    contents.promo ? `1 foil promo card featuring ${contents.promo.name}` : null,
    `${contents.sleeveCount} card sleeves`,
    `${energyTotal(contents)} Pokémon TCG Energy cards`,
    damageDice ? `${damageDice} damage-counter dice` : null,
    flipDie ? `${flipDie} competition-legal coin-flip die` : null,
    coin ? `${coin} plastic coin` : null,
    dividers ? `${dividers} card dividers` : null,
    guide ? 'A player’s guide to the expansion' : null,
    codeCard ? 'A code card for Pokémon TCG Live' : null,
  ].filter(Boolean);
};

const etbFarFace = (info) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--far');
  const list = el('ul', 'etb-far__list');
  for (const line of etbInsideLines(info)) list.append(el('li', '', line));
  const legal = el('div', 'bb-back__legal');
  for (let line = 0; line < 3; line += 1) legal.append(el('i'));
  face.append(el('p', 'bb-back__inside', 'Inside, you’ll find:'), list, legal);
  return face;
};

// `lid` is the key-art cover, `near`/`far` the long sides, `under` the base; the sides and the
// lid's rim strips are black with the slashes running on.
const proceduralEtbFace = (name, info) => {
  if (name === 'lid') return etbLidFace(info.art);
  if (name === 'near') return etbNearFace(info);
  if (name === 'far') return etbFarFace(info);
  if (name === 'under') return el('div', 'bb-pf etb-pf etb-pf--under');
  return el('div', 'bb-pf etb-pf etb-pf--side');
};

const etbFace = (name, { wrapped, ...info }, extraClass = '') => {
  const face = el('div', `bb-box__face etb-face etb-face--${name} ${extraClass}`.trim());
  face.append(proceduralEtbFace(name, info));
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

// The end of an Elite Trainer Box opening: everything it held is already in the collection.
const etbDoneText = (packs, contents) => {
  const cards = packs.reduce((sum, pack) => sum + pack.length, 0) + (contents.promo ? 1 : 0);
  return `Everything is in your collection: ${cards} cards · ${energyTotal(contents)} Energy · sleeves · coin`;
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
 * @param {object|null} options.product the box's art descriptor (`productArt(key)`); null draws
 *   the Build & Battle box with CSS faces only
 * @param {object|null} [options.contents] an Elite Trainer Box's non-pack contents (`etbContents`,
 *   design 055); null for a Build & Battle box. With contents the tray holds the promo pouch, the
 *   props (sleeves, Energy, dice and coin, dividers, guide, code card) and the packs, which leave
 *   when tapped, and the end of the scene points at the collection.
 * @param {(destination: 'collection'|'shelf', extra: {wantsGuide: boolean}) => void} options.onFinish
 *   ends the opening: the last summary's button asks for 'collection', Skip scene and Open another
 *   for 'shelf' (Build & Battle ignores both and shows its Pool tab); `wantsGuide` is whether the
 *   guide prop was picked
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
  product,
  contents = null,
  onFinish,
}) => {
  const art = product || PROCEDURAL_ONLY_ART;
  const size = boxSizeFor(art.proportions);
  const artIndexes = packArtIndexes(seed, packs.length);
  const isEtb = Boolean(contents);
  const isLift = art.lid === 'lift';
  const lidSize = { heightPx: size.height, depthPx: size.depth };
  const trayCount = isEtb ? ETB_PROP_COUNT + packs.length : TRAY_ITEM_COUNT;
  const flipDieIndex = isEtb ? contents.props?.damageDice ?? 6 : 6;
  const dieCount = isEtb ? flipDieIndex + (contents.props?.flipDie ?? 1) : 0;
  const doneText = isEtb ? etbDoneText(packs, contents) : 'All four packs are open.';
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
  // An Elite Trainer Box keeps its tray (and props) after the promo until its packs are tapped.
  const initialStage = getUnboxing().stage;
  let packsOut = initialStage === 'packs' || (!isEtb && initialStage === 'deckShown');
  let summaryPack = null;
  const flippedHits = new Set();
  // The props of an Elite Trainer Box (design 055 beat 5): cosmetic, never saved. `guide` is the
  // wantsGuide the scene ends with; `rolls` counts dice throws (each lands on its own seeded faces).
  const propState = { sleeves: false, code: false, guide: false, rolls: 0 };
  const perPack = () => getUnboxing().cardsPerPack || CARDS_PER_PACK;
  const finishWith = (destination) => onFinish(destination, { wantsGuide: propState.guide });

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
      return u.revealed[lastTorn(u)] < perPack() ? 'pocket' : 'spread';
    }
    if (u.stage === 'deckShown' && packsOut) return 'spread';
    return 'box';
  };

  // ── Box ───────────────────────────────────────────────────────────────
  const renderBox = (u) => {
    const host = el('div', 'bb-box');
    host.style.setProperty('--bb-w', `${size.width}px`);
    host.style.setProperty('--bb-h', `${size.height}px`);
    host.style.setProperty('--bb-d', `${size.depth}px`);
    const body = el('div', 'bb-box__body');
    const wrapped = !u.wrapTorn;
    if (isLift) appendLiftBox(body, u, wrapped);
    else appendHingedBox(body, u, wrapped);
    host.append(body);

    if (wrapped) {
      const wrapButton = button('bb-box__wrap', 'Tear off the shrink-wrap');
      bindTear(wrapButton, {
        widthOf: () => wrapButton.clientWidth || size.width,
        onProgress: (progress) => setWrapClip(wrapTearPose(progress).clipPath),
        onSpring: (progress) => springWrap(progress),
        onTear: (progress) => beatTearWrap(progress),
      });
      host.append(wrapButton);
    } else if (u.stage === 'sealed') {
      const lidButton = button('bb-box__open', isLift ? 'Lift the lid' : 'Open the lid');
      lidButton.addEventListener('click', beatOpenLid);
      host.append(lidButton);
    }
    return host;
  };

  // Build & Battle: a tall box, the lid hinged on the back edge of its top.
  const appendHingedBox = (body, u, wrapped) => {
    const faceOptions = { wrapped, art, size, textures };
    for (const name of ['back', 'left', 'right', 'bottom']) body.append(boxFace(name, faceOptions));
    for (const name of ['back', 'left', 'right', 'front']) {
      body.append(el('div', `bb-box__inner bb-box__inner--${name}`));
    }
    body.append(el('div', 'bb-box__floor'), boxFace('front', faceOptions));

    const lid = el('div', 'bb-box__lid');
    const lidOuter = boxFace('top', faceOptions);
    lidOuter.classList.add('bb-box__lid-outer');
    lid.append(lidOuter, el('div', 'bb-box__lid-inner'));
    lid.style.transform = lidTransform(lidPose(u.stage === 'sealed' ? 0 : 1), size);
    body.append(lid);
  };

  // Elite Trainer Box: the box lies flat with the key-art lid toward the camera (+z). The lid is
  // a host carrying its cover and four rim strips; once lifted it is gone and the well shows.
  const appendLiftBox = (body, u, wrapped) => {
    const faceOptions = { wrapped, art, packCount: packs.length, contents };
    for (const name of ['under', 'left', 'right', 'far', 'near']) body.append(etbFace(name, faceOptions));
    body.append(el('div', 'etb-box__floor'));
    for (const name of ['near', 'far', 'left', 'right']) body.append(el('div', `etb-box__wall etb-box__wall--${name}`));
    if (u.stage !== 'sealed') return;
    const lid = el('div', 'bb-box__lid etb-lid');
    lid.append(etbFace('lid', faceOptions, 'etb-lid__face'));
    for (const name of ['near', 'far', 'left', 'right']) {
      lid.append(etbFace('rim', faceOptions, `etb-lid__face etb-lid__rim etb-lid__rim--${name}`));
    }
    lid.style.transform = liftLidTransform(liftLidPose(0, lidSize));
    body.append(lid);
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

  const promoWindowImg = () => {
    const img = el('img', 'bb-deck__promo');
    img.alt = promo?.name || '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = cardImage(promo, 'small');
    return img;
  };

  const renderDeck = (u) => {
    const deck = button('bb-deck', 'Unwrap the deck');
    deck.disabled = u.stage !== 'opened';
    const stack = el('div', 'bb-deck__stack');
    stack.append(cardBackImg('bb-deck__back'));
    deck.append(stack);
    if (u.stage === 'opened') {
      const windowEl = el('div', 'bb-deck__window');
      windowEl.append(promoWindowImg());
      deck.append(windowEl, el('div', 'bb-deck__wrap'));
    }
    deck.append(el('span', 'bb-tray__label', '40-card deck'));
    deck.addEventListener('click', beatUnwrapDeck);
    return deck;
  };

  // The Elite Trainer Box promo sealed in its clear pouch; the card back shows if the art fails.
  const renderPouch = () => {
    const pouch = button('bb-deck etb-pouch', 'Open the promo pouch');
    const windowEl = el('div', 'bb-deck__window etb-pouch__card');
    windowEl.append(cardBackImg('bb-deck__back'), promoWindowImg());
    pouch.append(windowEl, el('div', 'bb-deck__wrap'), el('span', 'bb-tray__label', 'Promo pouch'));
    pouch.addEventListener('click', beatUnwrapDeck);
    return pouch;
  };

  const renderPromo = () => {
    const host = el('div', 'bb-promo');
    const lift = el('div', 'bb-promo__lift');
    // Build & Battle holds the promo up until the packs fly; an ETB promo settles into the tray.
    lift.style.transform = isEtb ? 'none' : promoTransform(promoLiftPose(1));
    if (promo?.id) lift.dataset.previewCardId = promo.id;
    lift.title = promo?.name || '';
    lift.append(cardFace(promo, 'normal'));
    if (isEtb) lift.append(el('div', 'bb-promo__fx'));
    host.append(lift, el('span', 'bb-tray__label', 'Foil promo'));
    return host;
  };

  const packArt = (className, packIndex) => {
    const img = el('img', className);
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = `/${art.packArtSrc(art.packArts[artIndexes[packIndex]])}`;
    return img;
  };

  const renderProp = (kind, title, sub) => {
    const prop = el('div', `bb-prop bb-prop--${kind}`);
    prop.append(el('strong', '', title), el('span', '', sub));
    return prop;
  };

  const renderTray = (u) => {
    if (isEtb) return renderEtbTray(u);
    const tray = el('div', 'bb-tray');
    tray.append(trayItem(0, renderDeck(u)));
    if (u.stage !== 'opened') tray.append(renderPromo());
    tray.append(
      trayItem(1, renderProp('code', 'Code card', 'Pokémon TCG Live')),
      trayItem(2, renderProp('tips', 'How to play', 'Quick-start sheet'))
    );
    return tray;
  };

  // ── Elite Trainer Box props (design 055 beat 5): tapped any time after the tray, no state ──
  const caption = (text) => el('span', 'bb-tray__label', text);

  const propImage = (className, src) => {
    const img = el('img', className);
    img.alt = '';
    img.draggable = false;
    // A missing sleeve or coin scan leaves the prop drawn without its art (055 row 8).
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = src;
    return img;
  };

  // A prop with two sides that turns over when tapped, and back again on the next tap.
  const flipProp = ({ kind, key, ariaLabel, front, back, label, shownLabel, voice }) => {
    const prop = button(`etb-prop etb-prop--${kind}`, ariaLabel);
    prop.setAttribute('aria-pressed', String(propState[key]));
    const flip = el('div', 'etb-flip');
    const frontFace = el('div', 'etb-flip__face etb-flip__front');
    const backFace = el('div', 'etb-flip__face etb-flip__back');
    frontFace.append(front);
    backFace.append(back);
    flip.append(frontFace, backFace);
    flip.style.transform = `rotateY(${propState[key] ? 180 : 0}deg)`;
    const line = caption(propState[key] ? shownLabel : label);
    prop.append(flip, line);
    prop.addEventListener('click', () => {
      if (collapsing) return;
      const showing = !propState[key];
      propState[key] = showing;
      prop.setAttribute('aria-pressed', String(showing));
      sound(voice);
      dropPoses(flip);
      // hitFlipPose turns 180° → 0° with a pop; showing the far side runs it the other way.
      playPose(
        flip,
        (t) => hitFlipPose(t, { tier: 0 }),
        (pose) => ({
          transform: `rotateY(${showing ? 180 - pose.rotateYDeg : pose.rotateYDeg}deg) scale(${pose.scale})`,
        }),
        HIT_FLIP_MS
      );
      later(() => {
        line.textContent = showing ? shownLabel : label;
      }, instant() ? 0 : HIT_FLIP_MS / 2);
    });
    return prop;
  };

  const renderSleeves = () => {
    const pack = el('div', 'etb-sleevepack');
    pack.append(el('span', 'etb-sleevepack__count', String(contents.sleeveCount)), el('span', 'etb-sleevepack__kind', 'Card sleeves'));
    const sleeve = el('div', 'etb-sleeve');
    const src = getSleeveById(contents.sleeveId)?.image;
    if (src) sleeve.append(propImage('etb-sleeve__art', src));
    return flipProp({
      kind: 'sleeves',
      key: 'sleeves',
      ariaLabel: 'Open the sleeves',
      front: pack,
      back: sleeve,
      label: `${contents.sleeveCount} sleeves`,
      shownLabel: `${contents.sleeveCount} sleeves · in your sleeves now`,
      voice: unboxingVoiceFor('sleeves'),
    });
  };

  const renderCodeCard = () => {
    const front = el('div', 'etb-code');
    front.append(el('span', 'etb-code__brand', 'Pokémon TCG Live'), el('span', 'etb-code__kind', 'Code card'));
    // The back never carries a readable code: a blurred strip only.
    const back = el('div', 'etb-code etb-code--back');
    back.append(el('span', 'etb-code__strip'), el('span', 'etb-code__kind', 'Redeem in Pokémon TCG Live'));
    return flipProp({
      kind: 'code',
      key: 'code',
      ariaLabel: 'Turn the code card over',
      front,
      back,
      label: 'Code card',
      shownLabel: 'Code card',
      voice: unboxingVoiceFor('revealCard', 0),
    });
  };

  const renderEnergy = () => {
    const total = energyTotal(contents);
    const prop = el('div', 'etb-prop etb-prop--energy');
    prop.setAttribute('role', 'img');
    prop.setAttribute('aria-label', `${total} Basic Energy cards`);
    const fan = el('div', 'etb-energy');
    const middle = (contents.energy.length - 1) / 2;
    contents.energy.forEach(([label], index) => {
      const card = el('div', 'etb-energy__card');
      card.style.setProperty('--etb-fan', String(index - middle));
      card.style.setProperty('--etb-energy-rgb', rgbCss(fxRgbForCard({ name: label })));
      const token = getEnergyTokenFront({ name: label });
      if (token) card.append(propImage('etb-energy__token', token));
      fan.append(card);
    });
    prop.append(fan, caption(`${total} Energy`));
    return prop;
  };

  const renderDividers = () => {
    const prop = el('div', 'etb-prop etb-prop--dividers');
    const count = contents.props?.dividers ?? 0;
    prop.setAttribute('role', 'img');
    prop.setAttribute('aria-label', `${count} card dividers`);
    const stack = el('div', 'etb-dividers');
    for (let index = 0; index < count; index += 1) {
      const divider = el('i', 'etb-dividers__card');
      divider.style.setProperty('--etb-i', String(index));
      stack.append(divider);
    }
    prop.append(stack, caption(`${count} dividers`));
    return prop;
  };

  const renderGuide = () => {
    const prop = button('etb-prop etb-prop--guide', 'Show the set list after the box');
    prop.setAttribute('aria-pressed', String(propState.guide));
    const book = el('div', 'etb-guide');
    book.append(el('span', 'etb-guide__kicker', 'Player’s guide'), el('span', 'etb-guide__set', 'Phantasmal Flames'));
    const line = caption(propState.guide ? 'Opens after the box' : 'Player’s guide');
    prop.append(book, line);
    prop.addEventListener('click', () => {
      if (collapsing) return;
      propState.guide = !propState.guide;
      sound(unboxingVoiceFor('revealCard', 0));
      prop.setAttribute('aria-pressed', String(propState.guide));
      line.textContent = propState.guide ? 'Opens after the box' : 'Player’s guide';
    });
    return prop;
  };

  // Each throw lands on its own seeded faces: the box seed, stepped per throw.
  const diceSeed = () => (seed + Math.max(0, propState.rolls - 1)) >>> 0;

  const renderDice = () => {
    const prop = button('etb-prop etb-prop--dice', 'Roll the dice and flip the coin');
    const pouch = el('div', 'etb-dice');
    const pile = el('div', 'etb-dice__pile');
    const rest = propState.rolls > 0 ? 1 : 0;
    for (let index = 0; index < dieCount; index += 1) {
      const die = el('div', `etb-die${index === flipDieIndex ? ' etb-die--flip' : ''}`);
      die.style.setProperty('--etb-i', String(index));
      for (let face = 1; face <= 6; face += 1) die.append(el('i', `etb-die__face etb-die__face--${face}`));
      die.style.transform = dieTransform(dicePose(rest, index, diceSeed()));
      pile.append(die);
    }
    const coin = el('div', 'etb-coin');
    const coinSrc = getCoinById(contents.coinId)?.url;
    for (const side of ['front', 'back']) {
      const face = el('div', `etb-coin__face etb-coin__face--${side}`);
      if (coinSrc) face.append(propImage('etb-coin__art', assetSrc(coinSrc)));
      coin.append(face);
    }
    coin.style.transform = coinTransform(coinFlipPose(rest));
    pouch.append(pile, coin, el('div', 'etb-dice__bag'));
    prop.append(pouch, caption('Dice & coin'));
    prop.addEventListener('click', () => rollDice(prop));
    return prop;
  };

  function rollDice(prop) {
    if (collapsing) return;
    propState.rolls += 1;
    sound(unboxingVoiceFor('dice'));
    sound(unboxingVoiceFor('coin'));
    const rollSeed = diceSeed();
    prop.querySelectorAll('.etb-die').forEach((die, index) => {
      dropPoses(die);
      playPose(die, (t) => dicePose(t, index, rollSeed), (pose) => ({ transform: dieTransform(pose) }), DICE_MS);
    });
    const coin = prop.querySelector('.etb-coin');
    dropPoses(coin);
    playPose(coin, coinFlipPose, (pose) => ({ transform: coinTransform(pose) }), COIN_FLIP_MS, { samples: 36 });
  }

  // The nine packs stand fanned in the box until tapped; then they fly into the spread.
  const renderPackFan = (u) => {
    const ready = u.stage === 'deckShown' && !packsOut;
    const fan = button('etb-packs', ready ? 'Take out the booster packs' : `${packs.length} booster packs`);
    fan.disabled = !ready;
    const pile = el('div', 'etb-packs__fan');
    const middle = (packs.length - 1) / 2;
    if (!packsOut) {
      packs.forEach((_, packIndex) => {
        const pack = el('div', 'etb-packs__pack');
        pack.append(packArt('bb-pack__art', packIndex));
        const item = trayItem(ETB_PROP_COUNT + packIndex, pack);
        item.dataset.pack = String(packIndex);
        item.style.setProperty('--etb-fan', String(packIndex - middle));
        pile.append(item);
      });
    }
    fan.append(pile, caption(`${packs.length} booster packs`));
    fan.addEventListener('click', () => {
      if (!busy && !collapsing && getUnboxing().stage === 'deckShown') flyOut();
    });
    return fan;
  };

  // Tray order (§ Scene beat 3): pouch, sleeves, Energy, dice, dividers, guide, code card, packs.
  const renderEtbTray = (u) => {
    const tray = el('div', 'bb-tray etb-tray');
    tray.append(
      trayItem(0, u.stage === 'opened' ? renderPouch() : renderPromo()),
      trayItem(1, renderSleeves()),
      trayItem(2, renderEnergy()),
      trayItem(3, renderDice()),
      trayItem(4, renderDividers()),
      trayItem(5, renderGuide()),
      trayItem(6, renderCodeCard()),
      renderPackFan(u)
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
        onProgress: (progress) => {
          cut.style.transform = `scaleX(${Math.min(1, progress / PACK_TORN_AT)})`;
          strip.style.transform = `translateX(${stripShift(progress)}px) rotate(${progress * 6}deg)`;
        },
        onSpring: (progress) => {
          cut.style.transform = 'scaleX(0)';
          return playPose(
            strip,
            (t) => lerp(stripShift(progress), 0, easeOut(t)),
            (x) => ({ transform: `translateX(${x}px)` }),
            SPRING_BACK_MS,
            { samples: 8 }
          );
        },
        onTear: (progress) => beatTearPack(packIndex, stripShift(progress)),
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

  // How far the last pack of a full queue sits from a focused pack `focusWidth` wide.
  const queueReach = (focusWidth, availableWidthPx) =>
    packSpreadSlot(packs.length - 1, 0, { spacingPx: focusWidth, availableWidthPx }, packs.length).xPx;

  /**
   * The side packs' share of the stage (design 055 pin: stage width less the focused pack). On a
   * narrow stage the share shrinks until a full queue fits beside the focused pack; `xPx` grows
   * linearly with it, so two samples find the width.
   */
  const spreadWidthFor = (stageWidth, focusWidth) => {
    const pinned = Math.max(0, stageWidth - focusWidth);
    const room = stageWidth - focusWidth - 2 * SPREAD_MARGIN_PX;
    const full = queueReach(focusWidth, pinned);
    if (full <= room || pinned === 0) return pinned;
    const base = queueReach(focusWidth, 0);
    const slope = (full - base) / pinned;
    return slope > 0 ? Math.min(pinned, Math.max(0, (room - base) / slope)) : 0;
  };

  const spreadSlotOf = (node, spread) => {
    const index = Number(node.dataset.pack);
    const focus = Number(spread.dataset.focus);
    const focusWidth = spread.querySelector('.bb-bigpack.is-focus')?.offsetWidth || 200;
    if (packs.length <= PACK_COUNT) return packSpreadSlot(index, focus, focusWidth);
    // More packs than a Build & Battle box: the focused pack and its queue are centred as a group.
    const spacing = {
      spacingPx: focusWidth,
      availableWidthPx: spreadWidthFor(spread.clientWidth || window.innerWidth, focusWidth),
    };
    const slot = packSpreadSlot(index, focus, spacing, packs.length);
    const last = packSpreadSlot(packs.length - 1, focus, spacing, packs.length);
    return { ...slot, xPx: slot.xPx - last.xPx / 2 };
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
    const count = el('p', 'bb-pocket__count', `Pack ${packIndex + 1} · ${shown + 1} / ${perPack()}`);
    const stack = el('div', 'bb-pocket__stack');
    const beneath = perPack() - shown - 1;
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
        ? `${doneText}${isEtb ? '' : ' Your deck is ready to build.'}`
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
      if (!u.wrapTorn) return 'Drag across the shrink-wrap to tear it off, or press it.';
      return isLift ? 'Lift the lid.' : 'Open the lid.';
    }
    if (u.stage === 'opened') {
      return isEtb
        ? 'Open the promo pouch. The sleeves, dice, guide and code card can be tapped too.'
        : 'Unwrap the deck to see its foil promo.';
    }
    if (u.stage === 'deckShown') return isEtb ? 'Tap the booster packs to take them out.' : 'Here come your packs…';
    return isEtb ? doneText : `${doneText} Build your deck from your pool.`;
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
    const finishLabel = isEtb ? 'See collection' : 'Build your deck';
    if (view === 'summary' && u.stage === 'done') {
      controls.append(control(finishLabel, 'build', () => finishScene('collection'), true));
    } else if (view === 'summary') {
      controls.append(control('Next pack', 'next-pack', showNextPack, true));
    } else if (u.stage === 'done') {
      controls.append(control(finishLabel, 'build', () => finishWith('collection'), true));
    }
    if (isEtb && u.stage === 'done') {
      controls.append(control('Open another', 'open-another', () => finishWith('shelf')));
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
    root.replaceChildren();
    root.dataset.stage = u.stage;
    root.dataset.view = view;
    root.dataset.wrap = u.wrapTorn ? 'off' : 'on';
    root.dataset.lid = isLift ? 'lift' : 'hinged';

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
    updateDock();
    playEntrance(entrance);
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
          (t) => trayRisePose(t, index, trayCount),
          (pose) => ({ transform: `translateY(${pose.translateYPx}px)`, opacity: pose.opacity }),
          trayRiseMs(trayCount)
        );
      });
    }
    if (entrance === 'promo' && isEtb) playEtbPromo();
    else if (entrance === 'promo') {
      playPose(
        root.querySelector('.bb-promo__lift'),
        promoLiftPose,
        (pose) => ({ transform: promoTransform(pose) }),
        PROMO_LIFT_MS
      );
      later(flyOut, instant() ? 0 : PROMO_LIFT_MS + PROMO_HOLD_MS);
    }
    if (entrance?.fly) playFly(entrance.fly, entrance.from);
    if (entrance?.cut !== undefined) playCut();
    if (entrance === 'summary') playDeal();
    if (entrance === 'spread') playSpreadIn();
    if (entrance === 'sweep') playSweep();
  };

  // An Elite Trainer Box promo (design 055 beat 4): it lifts out of the torn pouch, a tier ≥ 2
  // promo flares at the lift's peak inside its own bounds, holds, then settles into the tray.
  const playEtbPromo = () => {
    const lift = root.querySelector('.bb-promo__lift');
    if (!lift) return;
    const tier = contents.promoTier || 0;
    if (tier >= 1) sound(unboxingVoiceFor('revealCard', tier));
    const rise = playPose(lift, promoLiftPose, (pose) => ({ transform: promoTransform(pose) }), PROMO_LIFT_MS);
    if (tier >= 2) playHitFlare(lift.querySelector('.bb-promo__fx'), promo, tier);
    holdWhile(rise);
    const lifted = promoLiftPose(1);
    later(
      () =>
        playPose(
          lift,
          (t) => ({
            ...lifted,
            translateYPx: lerp(lifted.translateYPx, 0, easeOut(t)),
            scale: lerp(lifted.scale, 1, easeOut(t)),
          }),
          (pose) => ({ transform: promoTransform(pose) }),
          PROMO_SETTLE_MS,
          { samples: 12 }
        ),
      instant() ? 0 : PROMO_LIFT_MS + PROMO_HOLD_MS
    );
  };

  // The packs leave the box one after another and land in the spread: a Build & Battle box's
  // from its mouth, an Elite Trainer Box's each from its place in the tray fan (`fromRects`).
  const playFly = (boxRect, fromRects = null) => {
    const top = root.querySelector('.bb-scene__top');
    const fade = playPose(top, (t) => 1 - t, (opacity) => ({ opacity }), FADE_TOP_MS, { samples: 8 }).then(
      () => top?.remove()
    );
    const spread = root.querySelector('.bb-spread');
    if (!spread || !boxRect) {
      holdWhile(fade);
      return;
    }
    const mouth = {
      x: boxRect.left + boxRect.width / 2,
      y: boxRect.top + boxRect.height * BOX_MOUTH_Y,
      width: boxRect.width * FLY_FROM_WIDTH,
    };
    const originOf = (packIndex) => {
      const rect = fromRects?.[packIndex];
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width } : mouth;
    };
    const flights = [...spread.querySelectorAll('.bb-bigpack')].map((node, order) => {
      const slot = spreadSlotOf(node, spread);
      const rect = node.getBoundingClientRect();
      const width = node.offsetWidth || rect.width || 1;
      const from = originOf(Number(node.dataset.pack));
      const params = {
        dxPx: (from.x - (rect.left + rect.width / 2)) / slot.scale,
        dyPx: (from.y - (rect.top + rect.height / 2)) / slot.scale,
        fromScale: from.width / width / slot.scale,
      };
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

  const swingLid = () =>
    playPose(root.querySelector('.bb-box__lid'), lidPose, (pose) => ({ transform: lidTransform(pose, size) }), LID_OPEN_MS);

  // The lid host is preserve-3d, so it carries the transform only; its faces fade (house rule).
  const liftLid = () => {
    const lid = root.querySelector('.bb-box__lid');
    const pose = (t) => liftLidPose(t, lidSize);
    return Promise.all([
      playPose(lid, pose, (p) => ({ transform: liftLidTransform(p) }), LID_LIFT_MS),
      ...[...(lid?.querySelectorAll('.etb-lid__face') || [])].map((face) =>
        playPose(face, pose, (p) => ({ opacity: p.opacity }), LID_LIFT_MS)
      ),
    ]);
  };

  const beatOpenLid = () =>
    runBeat({ type: 'openLid' }, unboxingVoiceFor('openLid'), isLift ? liftLid : swingLid, 'tray');

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
    const fromRects = {};
    root.querySelectorAll('.etb-packs [data-pack]').forEach((item) => {
      fromRects[item.dataset.pack] = item.getBoundingClientRect();
    });
    packsOut = true;
    render({ entrance: { fly: boxRect, from: isEtb ? fromRects : null } });
  }

  const beatTearPack = (packIndex, fromShiftPx = 0) => {
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
    if (next.revealed[packIndex] >= perPack()) {
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
      token === autoToken && summaryPack === null && getUnboxing().revealed[packIndex] < perPack();
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
  const finishScene = async (destination) => {
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
    finishWith(destination);
  };

  // Skip scene: a pack mid-reveal is revealed first, since `finish` refuses mid-pack.
  function skipScene() {
    if (collapsing) return;
    autoToken += 1;
    let u = getUnboxing();
    if (u.stage === 'done') return;
    u.packsTorn.forEach((torn, packIndex) => {
      if (torn && u.revealed[packIndex] < perPack()) {
        dispatch({ type: 'revealAll', packIndex });
      }
    });
    u = getUnboxing();
    if (u.stage !== 'done' && !dispatch({ type: 'finish' })) return;
    sound(unboxingVoiceFor('finish'));
    summaryPack = null;
    render();
    finishWith('shelf');
  }

  // ── Tear input: drag ≥ 40 % across, or press (row 5); Enter/Space on the button ─
  function bindTear(target, { widthOf, onProgress, onSpring, onTear }) {
    let drag = null;
    target.addEventListener('pointerdown', (event) => {
      if (target.disabled || busy || event.button !== 0) return;
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
      if (event.detail === 0 && !target.disabled && !busy) onTear(0);
    });
  }

  render();

  return {
    unmount: () => {
      autoToken += 1;
      teardown();
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
};
