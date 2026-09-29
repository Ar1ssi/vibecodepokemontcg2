import { getEnergyTokenFront } from '../../../actions/move-card-bundle/energy-token-assets.mjs';
import { buildHoloCard, startHoloAnimation } from '../../../setup/deck-builder/core/holo.mjs';
import { BOX_PROPORTIONS } from '../../../setup/deck-builder/core/build-battle/box-textures.mjs';
import {
  BOX_MOUTH_Y,
  FLY_FROM_WIDTH,
  packFlyParams,
  peelSide,
} from '../../../setup/deck-builder/core/build-battle/pack3d.mjs';
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
  TRAY_TOTAL_MS,
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
 * Trainer Box (design 057, `contents` set) lies flat under a lift-off lid; its tray holds the promo
 * pouch, tappable props and nine fanned packs that fly out when tapped. Every beat is `dispatch(event)` (reducer + save)
 * first, then sound, then the pose sampled from unboxing.mjs; a beat that is refused does nothing.
 * The DOM re-renders the settled state after each beat, so a reload lands on the same picture.
 */

const BOX_W = 200;
const BOX_H = Math.round(BOX_W * BOX_PROPORTIONS.height);
const BOX_D = Math.round(BOX_W * BOX_PROPORTIONS.depth);
const SPRING_BACK_MS = 160;
const FADE_TOP_MS = 320;
// The WebGL pack stage (design 055), loaded only when a box is opened.
const PACK_STAGE_MODULE = './native-deck-builder-pack3d.js';
const DRAG_TILT = 0.06;
const SWEEP_MS = 420;
const SPARK_COUNT = 16;
const SPARK_MS = 640;
const COLLAPSE_SCALE = 0.2;
// The nine-pack spread keeps this much stage on either side of its outermost packs.
const SPREAD_MARGIN_PX = 16;
// Elite Trainer Box (design 057): a landscape box lying flat, lid up (§ Product art, proportions
// UNVERIFIED until a reference render exists); the tray holds seven things before the packs.
const ETB_PROPORTIONS = Object.freeze({ width: 1, height: 0.76, depth: 0.36 });
const ETB_PROP_COUNT = 7;
const PROMO_SETTLE_MS = 360;

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

// The lift-off lid rises toward the camera (+z) and slides back up the screen (−y); its tilt flips
// sign for CSS as lidTransform's does.
const liftLidTransform = ({ translateZPx, translateYPx, rotateXDeg }) =>
  `translate3d(0, ${translateYPx}px, ${translateZPx}px) rotateX(${-rotateXDeg}deg)`;

const dieTransform = ({ translateXPx, translateYPx, rotateXDeg, rotateYDeg, rotateZDeg }) =>
  `translate(${translateXPx}px, ${translateYPx}px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg) rotateZ(${rotateZDeg}deg)`;

const coinTransform = ({ rotateXDeg, translateYPx }) => `translateY(${translateYPx}px) rotateX(${rotateXDeg}deg)`;

// Catalog art paths are relative to the client root (`src/assets/...`).
const assetSrc = (path) => (/^(https?:)?\//.test(path) ? path : `/${path}`);

/**
 * A stand-in "box" rect whose mouth (`packFlyParams`: x centre, `BOX_MOUTH_Y` down, `FLY_FROM_WIDTH`
 * wide) is `rect`'s centre at `rect`'s width: an Elite Trainer Box pack leaves from its tray fan.
 */
const launchRectFrom = (rect) => {
  const width = rect.width / FLY_FROM_WIDTH;
  const height = rect.height;
  return {
    left: rect.left + rect.width / 2 - width / 2,
    top: rect.top + rect.height / 2 - height * BOX_MOUTH_Y,
    width,
    height,
  };
};

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

// Everything below draws one box's `look` (design 054 § Unboxing skin): `skin` from boxSkin (logo,
// key art, pack fronts, vendored faces), `labels` from unboxingLabels (words per box kind), the
// series and set names, and whether the box carries the Play Level pill.
const buildBattleTitle = (look) => {
  const title = el('div', 'bb-bbtitle');
  title.append(playMark(), el('span', '', look.labels.productTitle));
  return title;
};

const setLogo = (look) => {
  const block = el('div', 'bb-setlogo');
  block.append(el('span', 'bb-setlogo__mega', look.seriesName), el('span', 'bb-setlogo__name', look.setName));
  if (!look.skin.setLogoUrl) return block;
  const logo = el('img', 'bb-setlogo__img');
  logo.alt = '';
  logo.src = look.skin.setLogoUrl;
  logo.addEventListener('load', () => block.classList.add('has-logo'), { once: true });
  logo.addEventListener('error', () => logo.remove(), { once: true });
  block.append(logo);
  return block;
};

const proceduralFront = (look) => {
  const face = el('div', 'bb-pf bb-pf--front');
  const top = el('div', 'bb-pf__strip');
  top.append(wordmark());
  if (look.playLevel) {
    const level = el('div', 'bb-level');
    level.append(el('span', 'bb-level__pill', 'Play level 2'));
    top.append(level);
  }
  top.append(el('span', 'bb-age', '6+'));
  const art = el('div', 'bb-keyart');
  art.append(el('div', 'bb-keyart__slashes'));
  face.append(top, art, setLogo(look), buildBattleTitle(look));
  return face;
};

// A vendored front hides the key art, so it loads only when the texture is missing; a procedural
// box shows it at once.
const mountKeyArt = (face, look) => {
  const art = face.querySelector('.bb-keyart');
  if (!art || art.querySelector('img') || !look.skin.keyArtUrl) return;
  const img = el('img', 'bb-keyart__img');
  img.alt = '';
  img.src = look.skin.keyArtUrl;
  img.addEventListener('error', () => img.remove(), { once: true });
  art.prepend(img);
};

const proceduralSide = (name) => el('div', `bb-pf bb-pf--side bb-pf--${name}`);

const proceduralBack = (look) => {
  const face = el('div', 'bb-pf bb-pf--back');
  const list = el('ul', 'bb-back__list');
  for (const line of look.labels.backLines) {
    list.append(el('li', '', line));
  }
  const legal = el('div', 'bb-back__legal');
  for (let line = 0; line < 4; line += 1) legal.append(el('i'));
  face.append(
    buildBattleTitle(look),
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

const proceduralFace = (name, look) => {
  if (name === 'front') return proceduralFront(look);
  if (name === 'back') return proceduralBack(look);
  if (name === 'top' || name === 'bottom') return proceduralTop(name);
  return proceduralSide(name);
};

/**
 * A procedural pack front (design 054 § Unboxing skin): the 052 pack layout — crimped seals, the
 * wordmark and age badge, the set logo, the "10 additional game cards" band — over a card's art,
 * in the era palette. Used wherever a box has no vendored pack art.
 */
const proceduralPackFront = (className, art, look) => {
  const front = el('div', `${className} bb-packfront`);
  const artWindow = el('div', 'bb-packfront__window');
  if (art?.imageUrl) {
    const img = el('img', 'bb-packfront__art');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = art.imageUrl;
    artWindow.append(img);
  }
  const head = el('div', 'bb-packfront__head');
  head.append(wordmark('bb-wordmark--small'), el('span', 'bb-age', '6+'));
  const logo = setLogo(look);
  logo.classList.add('bb-packfront__logo');
  front.append(artWindow, head, logo, el('div', 'bb-packfront__band', '⑩ Additional game cards'));
  return front;
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
const mountTexture = (face, name, cache, look) => {
  const texture = look.skin.faces?.[name] || null;
  if (!texture) {
    if (name === 'front') mountKeyArt(face, look);
    return;
  }
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
    if (name === 'front') mountKeyArt(face, look);
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
      if (name === 'front') mountKeyArt(face, look);
    },
    { once: true }
  );
  img.src = `/${texture.src}`;
  face.append(img);
};

const boxFace = (name, { wrapped, textures, look }) => {
  const face = el('div', `bb-box__face bb-box__face--${name}`);
  face.append(proceduralFace(name, look));
  mountTexture(face, name, textures, look);
  if (wrapped) face.append(el('div', 'bb-face__wrap'));
  return face;
};

// ── Elite Trainer Box faces (design 057 § Product art): lying flat, lid up ─
const energyTotal = (contents) => contents.energy.reduce((sum, [, count]) => sum + count, 0);

const etbPlate = (look) => el('div', 'etb-plate', look.labels.productTitle);

// The lid: the key art on a black field under the slashes, the plate on its top edge, the series
// pill and the set logo at its foot.
const etbLidFace = (look) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--lid');
  const keyArt = el('div', 'etb-keyart');
  if (look.skin.keyArtUrl) {
    const img = el('img', 'etb-keyart__img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = look.skin.keyArtUrl;
    keyArt.append(img);
  }
  keyArt.append(el('div', 'bb-keyart__slashes'));
  face.append(keyArt, etbPlate(look), setLogo(look));
  return face;
};

const etbNearFace = (look, packCount) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--near');
  face.append(etbPlate(look), el('span', 'etb-pill', `${packCount} booster packs`));
  return face;
};

// The far long side: what is inside, typeset from the catalog row, and grey legal lines.
const etbFarFace = (look) => {
  const face = el('div', 'bb-pf etb-pf etb-pf--far');
  const list = el('ul', 'etb-far__list');
  for (const line of look.labels.backLines) list.append(el('li', '', line));
  const legal = el('div', 'bb-back__legal');
  for (let line = 0; line < 3; line += 1) legal.append(el('i'));
  face.append(el('p', 'bb-back__inside', 'Inside, you’ll find:'), list, legal);
  return face;
};

// `lid` is the key-art cover, `near`/`far` the long sides, `under` the base; the short sides and
// the lid's rim strips are black with the slashes running on.
const proceduralEtbFace = (name, look, packCount) => {
  if (name === 'lid') return etbLidFace(look);
  if (name === 'near') return etbNearFace(look, packCount);
  if (name === 'far') return etbFarFace(look);
  if (name === 'under') return el('div', 'bb-pf etb-pf etb-pf--under');
  return el('div', 'bb-pf etb-pf etb-pf--side');
};

const etbFace = (name, { wrapped, look, packCount }, extraClass = '') => {
  const face = el('div', `bb-box__face etb-face etb-face--${name} ${extraClass}`.trim());
  face.append(proceduralEtbFace(name, look, packCount));
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
// The end of an Elite Trainer Box opening: everything it held is already in the collection.
const etbDoneText = (packs, contents) => {
  const cards = packs.reduce((sum, pack) => sum + pack.length, 0) + (contents.promo ? 1 : 0);
  return `Everything is in your collection: ${cards} cards · ${energyTotal(contents)} Energy · sleeves · coin`;
};

/**
 * @param {object} options
 * @param {HTMLElement} options.root `#bbUnboxing`
 * @param {() => import('../../../setup/deck-builder/core/build-battle/unboxing.mjs').Unboxing} options.getUnboxing
 * @param {(event: {type: string, packIndex?: number}) => object|null} options.dispatch reduces and
 *   saves; null when the event was refused
 * @param {(object|null)[][]} options.packs the session's packs as card rows, in slot order
 * @param {object} options.packModel the box's resolved pack model (reverse-slot lookup)
 * @param {(card: object) => string|null} options.classOf the card's hit class (reveal tier)
 * @param {{skin: object, labels: object, seriesName: string, setName: string, playLevel: boolean}}
 *   options.look the box's skin (`boxSkin`) and printed words (`unboxingLabels`)
 * @param {number} options.seed the box seed (pack art, tear edges)
 * @param {object|null} options.promo the deck's foil promo card row
 * @param {object|null} [options.contents] an Elite Trainer Box's non-pack contents (`etbContents`,
 *   design 057); null for a Build & Battle box. With contents the box lifts its lid, the tray holds
 *   the promo pouch, the props (sleeves, Energy, dice and coin, dividers, guide, code card) and the
 *   packs, which leave when tapped, and the end of the scene points at the collection.
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
  classOf,
  look,
  seed,
  promo,
  contents = null,
  onFinish,
}) => {
  const artIndexes = packArtIndexes(seed, packs.length, look.skin.packArts.length);
  const isEtb = Boolean(contents);
  // An Elite Trainer Box lifts its lid off (design 057 beat 2); a Build & Battle box's is hinged.
  const isLift = isEtb;
  const etbSize = {
    width: BOX_W,
    height: Math.round(BOX_W * ETB_PROPORTIONS.height),
    depth: Math.round(BOX_W * ETB_PROPORTIONS.depth),
  };
  const lidSize = { heightPx: etbSize.height, depthPx: etbSize.depth };
  const trayCount = ETB_PROP_COUNT + packs.length;
  const flipDieIndex = contents?.props?.damageDice ?? 6;
  const dieCount = isEtb ? flipDieIndex + (contents.props?.flipDie ?? 1) : 0;
  const doneText = isEtb ? etbDoneText(packs, contents) : 'All four packs are open.';
  const textures = new Map();
  const tearEdges = packs.map((_, index) => packTearEdge(seed, index));
  const slotOf = (packIndex, cardIndex) =>
    packSlotKind(packModel, cardIndex, packs[packIndex]?.[cardIndex]);
  const tierOf = (packIndex, cardIndex) => {
    const card = packs[packIndex]?.[cardIndex];
    return hitTierFor(card, slotOf(packIndex, cardIndex), card ? classOf(card) : null);
  };

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
  // The props of an Elite Trainer Box (design 057 beat 5): cosmetic, never saved. `guide` is the
  // wantsGuide the scene ends with; `rolls` counts dice throws (each lands on its own seeded faces).
  const propState = { sleeves: false, code: false, guide: false, rolls: 0 };
  const perPack = () => getUnboxing().cardsPerPack || CARDS_PER_PACK;
  const finish = (destination) => onFinish(destination, { wantsGuide: propState.guide });
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
      return u.revealed[lastTorn(u)] < perPack() ? 'pocket' : 'spread';
    }
    if (u.stage === 'deckShown' && packsOut) return 'spread';
    return 'box';
  };

  // ── Box ───────────────────────────────────────────────────────────────
  const renderBox = (u) => {
    const host = el('div', 'bb-box');
    const size = isLift ? etbSize : { width: BOX_W, height: BOX_H, depth: BOX_D };
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
        widthOf: () => wrapButton.clientWidth || BOX_W,
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
    const faceOptions = { wrapped, textures, look };
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
  };

  // Elite Trainer Box: the box lies flat with the key-art lid toward the camera (+z). The lid is
  // a host carrying its cover and four rim strips; once lifted it is gone and the well shows.
  const appendLiftBox = (body, u, wrapped) => {
    const faceOptions = { wrapped, look, packCount: packs.length };
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
    deck.append(el('span', 'bb-tray__label', look.labels.deckLabel));
    deck.addEventListener('click', beatUnwrapDeck);
    return deck;
  };

  // The Elite Trainer Box promo sealed in its clear pouch; the card back shows if the art fails.
  const renderPouch = () => {
    const pouch = button('bb-deck etb-pouch', 'Open the promo pouch');
    const windowEl = el('div', 'bb-deck__window etb-pouch__card');
    windowEl.append(cardBackImg('bb-deck__back'), promoWindowImg());
    pouch.append(windowEl, el('div', 'bb-deck__wrap'), el('span', 'bb-tray__label', look.labels.deckLabel));
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

  // A vendored pack front is the whole image; a box without one, or whose file fails to load (design
  // 054 row 25), gets the procedural front.
  const packArt = (className, packIndex) => {
    const art = look.skin.packArts[artIndexes[packIndex]];
    if (art?.kind !== 'vendored') return proceduralPackFront(className, art, look);
    const img = el('img', className);
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.replaceWith(proceduralPackFront(className, null, look)), { once: true });
    img.src = `/${art.src}`;
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
      trayItem(1, renderProp('code', 'Code card', look.labels.codeCardGame)),
      trayItem(2, renderProp('tips', 'How to play', 'Quick-start sheet'))
    );
    return tray;
  };

  // ── Elite Trainer Box props (design 057 beat 5): tapped any time after the tray, no state ──
  const caption = (text) => el('span', 'bb-tray__label', text);

  const propImage = (className, src) => {
    const img = el('img', className);
    img.alt = '';
    img.draggable = false;
    // A missing sleeve or coin scan leaves the prop drawn without its art (057 row 8).
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
    pack.append(
      el('span', 'etb-sleevepack__count', String(contents.sleeveCount)),
      el('span', 'etb-sleevepack__kind', 'Card sleeves')
    );
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
    front.append(el('span', 'etb-code__brand', look.labels.codeCardGame), el('span', 'etb-code__kind', 'Code card'));
    // The back never carries a readable code: a blurred strip only.
    const back = el('div', 'etb-code etb-code--back');
    back.append(el('span', 'etb-code__strip'), el('span', 'etb-code__kind', `Redeem in ${look.labels.codeCardGame}`));
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

  const guideLine = () => (propState.guide ? 'Opens after the box' : 'Player’s guide');

  const renderGuide = () => {
    const prop = button('etb-prop etb-prop--guide', 'Show the set list after the box');
    prop.setAttribute('aria-pressed', String(propState.guide));
    const book = el('div', 'etb-guide');
    book.append(el('span', 'etb-guide__kicker', 'Player’s guide'), el('span', 'etb-guide__set', look.setName));
    const line = caption(guideLine());
    prop.append(book, line);
    prop.addEventListener('click', () => {
      if (collapsing) return;
      propState.guide = !propState.guide;
      sound(unboxingVoiceFor('revealCard', 0));
      prop.setAttribute('aria-pressed', String(propState.guide));
      line.textContent = guideLine();
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

  // How far the last pack of a full queue sits from a focused pack `focusWidth` wide.
  const queueReach = (focusWidth, availableWidthPx) =>
    packSpreadSlot(packs.length - 1, 0, { spacingPx: focusWidth, availableWidthPx }, packs.length).xPx;

  /**
   * The side packs' share of the stage (design 057 pin: stage width less the focused pack). On a
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

  // The WebGL packs follow these anchors' rects, so this one layout places both render paths.
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
      controls.append(control(finishLabel, 'build', () => finish('collection'), true));
    }
    if (isEtb && u.stage === 'done') {
      controls.append(control('Open another', 'open-another', () => finish('shelf')));
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
    if (packStage) root.append(packStage.mirror, packStage.canvas);
    root.dataset.render = packStage ? '3d' : 'dom';
    root.dataset.stage = u.stage;
    root.dataset.view = view;
    root.dataset.wrap = u.wrapTorn ? 'off' : 'on';
    if (isLift) root.dataset.lid = 'lift';

    // The box stays on screen while the packs fly out of it, then fades.
    if (view === 'box' || entrance?.fly) {
      const top = el('div', 'bb-scene__top');
      top.append(renderBox(u));
      if (u.stage !== 'sealed') top.append(renderTray(u));
      root.append(top);
    }
    if (view === 'spread') {
      const spread = renderSpread(u);
      // An Elite Trainer Box's packs launch from the tray fan: the flights (DOM and WebGL) measure
      // the anchors once, so the anchors start in their slots instead of easing out to them.
      if (isEtb && entrance?.fly) spread.classList.add('is-launch');
      root.append(spread);
    }
    if (view === 'pocket') root.append(renderPocket(u, lastTorn(u)));
    if (view === 'summary') root.append(renderSummary(summaryPack));
    root.append(renderDock(u, view));
    root.querySelectorAll('.bb-spread').forEach(layoutSpread);
    // A fly entrance hands the packs to the stage itself, from the box mouth.
    if (!entrance?.fly) syncPackStage(view);
    updateDock();
    playEntrance(entrance);
  };

  // ── 3D pack stage (design 055 § Scene integration) ───────────────────
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
    const arts = packs.map((_, packIndex) => look.skin.packArts[artIndexes[packIndex]]);
    // Procedural pack fronts are DOM only until the stage can draw them.
    if (!arts.every((art) => art?.kind === 'vendored')) return;
    import(PACK_STAGE_MODULE)
      .then((module) =>
        module.createPackStage({
          host: root,
          seed,
          packArts: arts.map((art) => ({ url: `/${art.src}`, shape: art.shape ?? null })),
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
        root.append(packStage.mirror, packStage.canvas);
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
          isEtb ? (t) => trayRisePose(t, index, trayCount) : (t) => trayRisePose(t, index),
          (pose) => ({ transform: `translateY(${pose.translateYPx}px)`, opacity: pose.opacity }),
          isEtb ? trayRiseMs(trayCount) : TRAY_TOTAL_MS
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
    if (entrance?.cut3d !== undefined) playCut3d();
    if (entrance === 'summary') playDeal();
    if (entrance === 'spread') playSpreadIn();
    if (entrance === 'sweep') playSweep();
  };

  // An Elite Trainer Box promo (design 057 beat 4): it lifts out of the torn pouch; a tier ≥ 2
  // promo flares inside its own bounds at the lift's peak, holds, then settles into the tray.
  const playEtbPromo = () => {
    const lift = root.querySelector('.bb-promo__lift');
    if (!lift) return;
    const tier = contents.promoTier || 0;
    const rise = playPose(lift, promoLiftPose, (pose) => ({ transform: promoTransform(pose) }), PROMO_LIFT_MS);
    if (tier >= 2) {
      later(() => {
        const fx = lift.querySelector('.bb-promo__fx');
        if (!fx?.isConnected) return;
        sound(unboxingVoiceFor('revealCard', tier));
        playHitFlare(fx, promo, tier);
      }, instant() ? 0 : PROMO_LIFT_MS * 0.5);
    }
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

  // The packs leave the box one after another and land in the spread: a Build & Battle box's from
  // its mouth, an Elite Trainer Box's each from its place in the tray fan (`fromRects`).
  const playFly = (boxRect, fromRects = null) => {
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
      const from = fromRects?.[node.dataset.pack] || boxRect;
      const params = packFlyParams(from, node.getBoundingClientRect(), slot.scale);
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

  const swingLid = () =>
    playPose(root.querySelector('.bb-box__lid'), lidPose, (pose) => ({ transform: lidTransform(pose) }), LID_OPEN_MS);

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
    let boxRect = root.querySelector('.bb-box')?.getBoundingClientRect() || null;
    // An Elite Trainer Box's packs leave from the tray fan: each its own place on the DOM path; the
    // WebGL stage takes one launch point, the fan's centre.
    const fromRects = {};
    if (isEtb) {
      root.querySelectorAll('.etb-packs [data-pack]').forEach((item) => {
        fromRects[item.dataset.pack] = launchRectFrom(item.getBoundingClientRect());
      });
      const first = root.querySelector('.etb-packs [data-pack]')?.getBoundingClientRect();
      const fan = root.querySelector('.etb-packs__fan')?.getBoundingClientRect();
      if (first && fan) {
        boxRect = launchRectFrom({ left: fan.left + fan.width / 2 - first.width / 2, top: fan.top, width: first.width, height: fan.height });
      }
    }
    packsOut = true;
    render({ entrance: { fly: boxRect, from: isEtb ? fromRects : null } });
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
    finish(destination);
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
    finish('shelf');
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
