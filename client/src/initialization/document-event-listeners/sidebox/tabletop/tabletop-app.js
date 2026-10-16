import { Box3, CanvasTexture, Euler, Group, Plane, Quaternion, Raycaster, SRGBColorSpace, Vector2, Vector3 } from 'three';
import { buildModernBasicEnergy } from '../../../../setup/deck-builder/core/modern-energy.mjs';
import {
  hitTierFor,
  nextPackToTear,
  packArtIndexes,
  packSlotKind,
} from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { PACK_TORN_AT, TAP_SLOP_PX } from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { cardFinish, promoFinish } from '../../../../setup/deck-builder/core/build-battle/tabletop/card-finish.mjs';
import {
  COSMETIC_STORAGE_KEY,
  createCosmetic,
  finishCosmetic,
  isOutOfBox,
  logicalOfVisual,
  nextStep,
  parseCosmetic,
  placeOnTable,
  reconcileCosmetic,
  tableView,
  tearPackAction,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/flow.mjs';
import {
  BOX_SPOT,
  DECK_SPOT,
  EXTRAS_SPOT,
  HAND,
  LEAFLET_SPOT,
  PROMO_SPOT,
  REVEAL_SPOT,
  WRAP_BALL_RADIUS,
  WRAP_SPOT,
  cameraPose,
  fitDistance,
  packRowSpot,
  pileJitter,
  summaryColumns,
  summarySlot,
  wrapperSpot,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/layout.mjs';
import {
  packStack,
  poolCardsBefore,
  stackPositionFor,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/pack-stack.mjs';
import {
  clampToTable,
  clearOfBox,
  footprint,
  restHeight,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/placement.mjs';
import {
  CARD,
  LEAFLET,
  PACK,
  boxDimensions,
  contentsFor,
  contentsWords,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import {
  LID_OPEN_AT,
  LID_OPEN_DEG,
  POCKET_TEAR_MS,
  arcPoint,
  deckWrapPose,
  dragProgress,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  handSway,
  lidAngleDeg,
  pocketTearLight,
  slideOffPose,
  smoothstep,
  stackPullPose,
  wrapPeelPose,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/poses.mjs';
import { createTabletopAudio } from './tt-audio.js';
import { buildBox, interiorSlots, prepareBoxFaces } from './tt-box.js';
import { createCardKit, disposeCard } from './tt-card.js';
import { resetFilm } from './tt-film.js';
import { buildDeck, buildLeaflet, contactShadow } from './tt-objects.js';
import { createPackKit } from './tt-pack.js';
import { drawProceduralWrapper, loadPrintFont, paletteFor } from './tt-print.js';
import { createStage } from './tt-stage.js';
import { createTearFx } from './tt-tear-fx.js';
import {
  assetUrl,
  boardTexture,
  cardEdgeTexture,
  contactShadowTexture,
  crinkleNormalTexture,
  imageTexture,
  loadImage,
  makeCanvas,
  stackEdgeTexture,
} from './tt-textures.js';
import { createTabletopUi } from './tt-ui.js';

/**
 * The tabletop opening (design 073): one three.js scene of a Build & Battle box on the floor of a
 * TCG Pocket studio. Every physical beat is played here — the shrink-wrap torn off, the lid lifted,
 * the deck, leaflet and packs carried out by hand and set down anywhere on the floor (and moved
 * again whenever the player likes), the deck's cellophane and its promo, each pack
 * picked up and torn across its crimp with the game's swipe and light, its cards drawn out and
 * passed one by one onto the floor, then fanned and piled. The saved `session.unboxing` reducer is
 * the only record that counts (`dispatch`); which pack was torn first, what was taken out and
 * where it was set down are a small cosmetic record. A reload re-lays the table for the saved state
 * (`settle`).
 */

const DEG = Math.PI / 180;
const CARD_TEXTURE_TIMEOUT_MS = 9000;
const STACK_STEP = CARD.thickness + 0.04;

const qFlat = (yawDeg, faceUp = true) =>
  new Quaternion().setFromEuler(new Euler(faceUp ? -Math.PI / 2 : Math.PI / 2, yawDeg * DEG, 0, 'YXZ'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HAND_FACE_WAIT_MS = 6000;
// The share of a pull taken by sliding the wrapper down rather than drawing the cards up.
const WRAPPER_SLIDE = 0.72;
// As the finger cuts, the cut part of the strip only flexes toward the eye (as in TCG Pocket).
const PEEL_FLEX_DEG = 26;
// The cut strip springs off this long after the cut completes (as the halo folds into the beam)
// and the cards start out of the pack this much later again.
const STRIP_POP_DELAY_MS = 100;
const CARDS_AFTER_POP_MS = 160;
// The strip's flight: it whips up out of view for the first part, then flutters down to the floor.
const STRIP_FLIGHT_MS = 1400;
const STRIP_POP_AT = 0.2;
const TABLE_FOCUS_MS = 450;
// Carried by hand, a thing floats this far over where it would land; its shadow shows the spot.
const CARRY_LIFT_MM = 34;
// How fast a carried thing catches up with the pointer, and how far it leans into the motion.
const CARRY_FOLLOW_MS = 55;
const CARRY_LEAN_DEG = 12;
// Dragging across the box tears the shrink-wrap this far along its peel; let go past half and the
// rest follows, short of it and the film settles back.
const WRAP_DRAG_PX = 260;
const WRAP_DRAG_SPAN = 0.4;

const el = (tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const cardImageOf = (card) => card?.images?.large || card?.image || card?.images?.small || '';

/**
 * @returns {Promise<{unmount: () => void}|null>} null when WebGL is unavailable or the start was
 *   cancelled (`isCancelled()`): the caller mounts the DOM scene instead. A start that throws has
 *   already released everything it made, WebGL context included.
 */
export async function createTabletopApp(options) {
  const life = { teardown: null };
  try {
    return await buildTabletopApp(options, life);
  } catch (error) {
    life.teardown?.();
    throw error;
  }
}

async function buildTabletopApp(options, life) {
  const {
    root,
    getUnboxing,
    dispatch,
    packs,
    packModel,
    classOf,
    look,
    seed,
    promo,
    onFinish,
    box,
    deckRows = [],
    storage = null,
    quality = 'high',
    surface = { kind: 'floor' },
    finishLabel = 'Build your deck',
    muted = () => false,
    volume = () => 0.8,
    instant = () => false,
    onLost = () => {},
    timeScale = 1,
    manualClock = false,
    isCancelled = () => false,
  } = options;

  const host = el('div', 'tt-root');
  root.append(host);
  const stage = createStage({ host, quality, instant, timeScale, manual: manualClock, onLost: () => onLost() });
  if (!stage) {
    host.remove();
    return null;
  }
  const { scene, camera, renderer, envMap } = stage;
  // Everything made from here on registers its release in `disposers`; `teardown` runs them on
  // unmount, and on a start that fails or is cancelled half-way.
  const disposers = [];
  let disposed = false;
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    disposers.splice(0).forEach((dispose) => dispose());
    stage.dispose();
    host.remove();
  };
  life.teardown = teardown;
  const abandon = () => {
    teardown();
    return null;
  };
  const stopped = () => disposed || isCancelled();
  const audio = createTabletopAudio({ muted, volume });
  disposers.push(() => audio.dispose());
  let busy = false;
  let queued = null;
  let hand = null;
  const contents = contentsFor(box);
  const words = contentsWords(contents);
  const era = box?.era || look?.skin?.palette || 'me';
  const palette = paletteFor(look?.skin?.palette || era);
  const dims = boxDimensions();
  const keep = (thing) => {
    if (thing) disposers.push(() => thing.dispose?.());
    return thing;
  };

  // ── Cosmetic record ──────────────────────────────────────────────────────
  const packCount = packs.length;
  const readCosmetic = () => {
    try {
      const raw = storage?.getItem(COSMETIC_STORAGE_KEY);
      return parseCosmetic(raw ? JSON.parse(raw) : null, { seed, packCount });
    } catch {
      return createCosmetic(seed);
    }
  };
  let cosmetic = reconcileCosmetic(readCosmetic(), getUnboxing());
  const saveCosmetic = () => {
    try {
      storage?.setItem(COSMETIC_STORAGE_KEY, JSON.stringify(cosmetic));
    } catch {
      // A full or blocked storage loses only the cosmetic record.
    }
  };
  // The reconciled record replaces whatever an earlier opening of this box number left behind.
  saveCosmetic();
  const view = () => tableView(getUnboxing(), cosmetic);
  const send = (event) => dispatch(event) !== null;

  // ── Chrome ───────────────────────────────────────────────────────────────
  const ui = createTabletopUi({
    root: host,
    soundOn: () => !muted(),
    onAction: (action) => onUiAction(action),
  });
  disposers.push(() => ui.dispose());
  ui.setTitle(`${box?.name || 'Build & Battle Box'} · Box #${seed}`);
  ui.setLoading(true, 'Setting the table…');

  // ── Shared textures and kits ────────────────────────────────────────────
  const crinkle = keep(crinkleNormalTexture(renderer));
  const board = keep(boardTexture(renderer));
  const edgeTexture = keep(cardEdgeTexture(renderer));
  const deckEdgeTexture = keep(stackEdgeTexture(renderer, contents.deck.count));
  const blob = keep(contactShadowTexture(renderer));
  const artIndexes = packArtIndexes(seed, packCount, Math.max(1, look?.skin?.packArts?.length || 1));

  await loadPrintFont();
  if (stopped()) return abandon();
  const [backImage, promoImage, faces, ...artImages] = await Promise.all([
    loadImage(assetUrl('src/assets/cardback.png')),
    loadImage(cardImageOf(promo), { timeoutMs: CARD_TEXTURE_TIMEOUT_MS }),
    prepareBoxFaces({ look, dims, boxKey: box?.key }),
    ...Array.from({ length: packCount }, (_, visual) => packArtFor(look?.skin?.packArts?.[artIndexes[visual]])),
  ]);
  if (stopped()) return abandon();
  const backTexture = backImage ? keep(imageTexture(backImage, renderer)) : null;
  const kit = createCardKit({ envMap, backTexture, edgeTexture });
  keep(kit);
  const promoTexture = promoImage ? keep(imageTexture(promoImage, renderer)) : keep(fallbackFace(promo));
  const promoLook = promoFinish(promo);
  const packKit = createPackKit({ envMap, renderer });
  disposers.push(() => packKit.dispose());

  // ── Objects ─────────────────────────────────────────────────────────────
  const boxModel = buildBox({ renderer, envMap, dims, faces, board, crinkle });
  keep(boxModel);
  boxModel.group.position.set(BOX_SPOT.x, 0, BOX_SPOT.z);
  boxModel.group.rotation.y = BOX_SPOT.rotYDeg * DEG;
  scene.add(boxModel.group);
  const boxShadow = contactShadow({ texture: blob, width: dims.width, depth: dims.depth, spread: 14, opacity: 0.55 });
  keep(boxShadow);
  boxModel.group.add(boxShadow.mesh);
  boxModel.film.meshes.forEach((mesh) => {
    mesh.userData.tt = { kind: 'box' };
  });
  boxModel.group.userData.tt = { kind: 'box' };

  const deck = buildDeck({
    envMap,
    count: contents.deck.count,
    promoMap: promoTexture,
    promoFinish: promoLook,
    backMap: backTexture,
    edgeTexture: deckEdgeTexture,
    crinkle,
  });
  keep(deck);
  deck.group.userData.tt = { kind: 'deck' };
  const promoCard = kit.makeCard({ map: promoTexture, finish: promoLook, name: 'tt-promo' });
  promoCard.userData.tt = { kind: 'tableCard' };
  disposers.push(() => disposeCard(promoCard));

  const leaflet = buildLeaflet({
    renderer,
    envMap,
    title: box?.name || '',
    deckRows,
    palette,
    heading: contents.leaflet === 'guide' ? "PLAYER'S GUIDE" : 'BUILDING TIPS',
  });
  keep(leaflet);
  leaflet.mesh.userData.tt = { kind: 'leaflet' };

  const packObjects = artImages.map((art, visual) => {
    const model = packKit.makePack({
      art,
      shape: look?.skin?.packArts?.[artIndexes[visual]]?.shape || null,
      seed,
      packIndex: visual,
    });
    keep(model);
    model.group.userData.tt = { kind: 'pack', visual };
    return { visual, model, cards: [], pile: [], wrapperDown: false };
  });

  // Every card mesh made for a pack, so a re-lay or unmount can clear them.
  const looseMeshes = new Set();
  disposers.push(() => {
    for (const mesh of [...looseMeshes]) dropLoose(mesh);
  });
  const trackLoose = (mesh) => {
    looseMeshes.add(mesh);
    return mesh;
  };
  const dropLoose = (mesh) => {
    if (!mesh) return;
    mesh.parent?.remove(mesh);
    looseMeshes.delete(mesh);
    if (mesh.userData.ownFace) disposeCard(mesh);
  };

  // ── Card faces ──────────────────────────────────────────────────────────
  const textureCache = new Map();
  const faceTexture = (url, card) => {
    if (!url) return Promise.resolve(keep(fallbackFace(card)));
    if (!textureCache.has(url)) {
      textureCache.set(
        url,
        loadImage(url, { timeoutMs: CARD_TEXTURE_TIMEOUT_MS }).then((image) =>
          image ? keep(imageTexture(image, renderer)) : keep(fallbackFace(card))
        )
      );
    }
    return textureCache.get(url);
  };

  function fallbackFace(card) {
    const canvas = makeCanvas(512, 715);
    const ctx = canvas.getContext('2d');
    if (backImage) ctx.drawImage(backImage, 0, 0, 512, 715);
    else {
      ctx.fillStyle = '#1d3f8f';
      ctx.fillRect(0, 0, 512, 715);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 300, 512, 110);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(card?.name || 'Card').slice(0, 22), 256, 355);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  async function packArtFor(art) {
    if (art?.kind === 'vendored') {
      const image = await loadImage(assetUrl(art.src));
      if (image) return image;
    }
    const cardImage = art?.imageUrl ? await loadImage(art.imageUrl) : null;
    const canvas = makeCanvas(780, 1426);
    drawProceduralWrapper(canvas.getContext('2d'), 780, 1426, { image: cardImage, palette });
    return canvas;
  }

  // The stack items of a pack once it is torn: what each one shows and how it is foiled.
  const stackFor = (logical) => {
    const cards = packs[logical] || [];
    return packStack({ cardCount: cards.length, era, seed, packIndex: logical }).map((item) => {
      if (item.kind === 'energy') {
        const energy = buildModernBasicEnergy(item.energyLabel, 1);
        return { ...item, url: cardImageOf(energy), card: energy, finish: null };
      }
      const card = cards[item.cardIndex] || null;
      const slot = packSlotKind(packModel, item.cardIndex, card);
      const tier = hitTierFor(card, slot, card ? classOf(card) : null);
      return { ...item, url: cardImageOf(card), card, finish: cardFinish(card, slot), tier };
    });
  };

  const makeStackMesh = (item) => {
    // Until its art arrives a card shows the back, never a blank face.
    const mesh = kit.makeCard({ map: backTexture, finish: null, name: item.card?.name || 'card' });
    mesh.userData.ownFace = true;
    mesh.userData.item = item;
    faceTexture(item.url, item.card).then((texture) => {
      if (disposed || !texture) return;
      kit.setFace(mesh, texture, item.finish);
      stage.requestRender();
    });
    return trackLoose(mesh);
  };

  // ── Poses in the world ──────────────────────────────────────────────────
  const aspect = () => stage.size.width / stage.size.height;
  const handDistance = (halfWidth, halfHeight, base) =>
    Math.max(base, fitDistance(halfWidth, halfHeight, camera.fov, aspect()));
  const handPose = ({ x = 0, y = 0, z = null, tiltXDeg = HAND.tiltXDeg, halfWidth = 48, halfHeight = 72 } = {}) => {
    camera.updateMatrixWorld();
    const distance = z === null ? handDistance(halfWidth, halfHeight, -HAND.z) : -z;
    const position = camera.localToWorld(new Vector3(HAND.x + x, HAND.y + y, -distance));
    const quaternion = camera.quaternion.clone().multiply(new Quaternion().setFromEuler(new Euler(tiltXDeg * DEG, 0, 0)));
    return { position, quaternion };
  };
  const flatPose = (spot, height, faceUp = true) => ({
    position: new Vector3(spot.x, height, spot.z),
    quaternion: qFlat(spot.rotYDeg || 0, faceUp),
  });
  const place = (object, pose) => {
    scene.attach(object);
    object.position.copy(pose.position);
    object.quaternion.copy(pose.quaternion);
  };

  // Held things hover a forearm's length over the mat: their shadow there is too soft to show.
  const setCastShadow = (object, cast) =>
    object.traverse((node) => {
      if (node.isMesh) node.castShadow = cast;
    });
  /**
   * Flies `object` (re-parented to the scene, world pose kept) along an arc bowed `lift` mm over the
   * straight line to `pose`: a hand's carry, never a toss (`over: 'higher'` arcs over the higher
   * end instead, to clear what stands between).
   */
  const flyTo = (object, pose, { durationMs = 650, lift = 50, delayMs = 0, over = 'chord' } = {}) => {
    let from = null;
    let fromQ = null;
    // Coming down onto the mat it casts its shadow again, once it is near the mat; going up to the
    // hand it stops, as soon as it has left the mat (held things hover too high to shadow it).
    let shadowDue = pose.position.y < 40;
    let liftDue = !shadowDue;
    return stage.animate({
      durationMs,
      delayMs,
      update: (t) => {
        if (!from) {
          scene.attach(object);
          from = object.position.clone();
          fromQ = object.quaternion.clone();
        }
        if (shadowDue && t >= 0.55) {
          shadowDue = false;
          setCastShadow(object, true);
        }
        if (liftDue && t >= 0.25) {
          liftDue = false;
          setCastShadow(object, false);
        }
        const point = arcPoint(from, pose.position, t, lift, { over });
        object.position.set(point.x, point.y, point.z);
        object.quaternion.slerpQuaternions(fromQ, pose.quaternion, point.s);
      },
    });
  };

  // ── Lay the table for the saved state ───────────────────────────────────
  const slots = interiorSlots(dims, { packCount, deckCount: contents.deck.count, leaflet: LEAFLET });
  const putInBox = (object, slot) => {
    boxModel.group.add(object);
    object.position.set(slot.x, slot.y, slot.z);
    object.quaternion.setFromEuler(new Euler(slot.rotX, 0, 0));
  };
  // The wad's centre sits low: the lumps under it rest on the mat.
  const wrapBall = {
    center: new Vector3(WRAP_SPOT.x, WRAP_BALL_RADIUS * 0.7, WRAP_SPOT.z),
    radius: WRAP_BALL_RADIUS,
  };
  const crumpledFilm = (uniforms, group, worldCenter) => {
    const local = group.worldToLocal(worldCenter.clone());
    uniforms.uTear.value.set(dims.width / 2, dims.height, dims.depth / 2, 62);
    uniforms.uLoosen.value = 1;
    uniforms.uCrumple.value = 1;
    uniforms.uBallCenter.value.copy(local);
    uniforms.uBallRadius.value = wrapBall.radius;
    uniforms.uDrift.value.set(0, 0, 0);
  };
  const wrapShadow = contactShadow({
    texture: blob,
    width: WRAP_BALL_RADIUS * 1.6,
    depth: WRAP_BALL_RADIUS * 1.6,
    spread: 10,
    opacity: 0.35,
  });
  keep(wrapShadow);
  wrapShadow.mesh.position.set(WRAP_SPOT.x, 0.12, WRAP_SPOT.z);
  wrapShadow.mesh.visible = false;
  scene.add(wrapShadow.mesh);

  const pileHeight = (count) => 0.2 + count * STACK_STEP;

  // ── Things moved by hand ────────────────────────────────────────────────
  // What the player can pick up and set down on the floor: its key in the cosmetic record, its
  // object, its flat half sizes, the height it lies at on the bare floor, where it goes when it is
  // simply taken out, its place in the box, and the sound it lands with.
  const deckItem = {
    key: 'deck',
    object: deck.group,
    halfW: CARD.width / 2,
    halfD: CARD.height / 2,
    // Still in its cellophane it lies face up, on the film.
    base: () => deck.thickness / 2 + (view().deckUnwrapped ? 0.2 : 0.5),
    faceUp: () => !view().deckUnwrapped,
    home: DECK_SPOT,
    slot: () => slots.deck,
    sound: 'item-land',
  };
  const leafletItem = {
    key: 'leaflet',
    object: leaflet.mesh,
    halfW: LEAFLET.width / 2,
    halfD: LEAFLET.height / 2,
    base: () => LEAFLET.thickness / 2,
    faceUp: () => true,
    home: LEAFLET_SPOT,
    slot: () => slots.leaflet,
    sound: 'item-land',
  };
  const promoItem = {
    key: 'promo',
    object: promoCard,
    halfW: CARD.width / 2,
    halfD: CARD.height / 2,
    base: () => CARD.thickness / 2 + 0.1,
    faceUp: () => true,
    home: PROMO_SPOT,
    slot: () => null,
    sound: 'card-land',
  };
  const packItems = packObjects.map((pack) => ({
    key: `pack${pack.visual}`,
    object: pack.model.group,
    visual: pack.visual,
    halfW: PACK.width / 2,
    halfD: PACK.height / 2,
    base: () => 3.6,
    faceUp: () => true,
    home: packRowSpot(pack.visual, packCount),
    slot: () => slots.packs[pack.visual],
    sound: 'pack-land',
  }));
  const boxItems = () => [deckItem, leafletItem, ...packItems];

  const spotOf = (item) => cosmetic.spots[item.key] || { ...item.home, y: item.base() };
  const restPose = (item, spot) => flatPose(spot, spot.y, item.faceUp());
  const layDown = (item) => place(item.object, restPose(item, spotOf(item)));
  const recordSpot = (item, spot) => {
    cosmetic = placeOnTable(cosmetic, item.key, spot, packCount);
    saveCosmetic();
  };
  const boxRect = { x: BOX_SPOT.x, z: BOX_SPOT.z, rotYDeg: BOX_SPOT.rotYDeg, width: dims.width, depth: dims.depth };
  const boxClearance = (item) => Math.max(item.halfW, item.halfD) * 0.8;

  /** Whether `item` lies on the floor now: out of the box, not in hand, not being carried. */
  const onFloor = (item) => {
    if (carry?.item === item) return false;
    if (item === promoItem) return promoCard.visible && view().deckUnwrapped && hand?.mesh !== promoCard;
    if (!isOutOfBox(cosmetic, item.key)) return false;
    if (item.visual === undefined) return true;
    return view().untornVisual.includes(item.visual) && !(hand?.kind === 'pack' && hand.visual === item.visual);
  };
  const lyingItems = (except = null) =>
    [deckItem, leafletItem, promoItem, ...packItems].filter((item) => item !== except && onFloor(item));
  const supportOf = (item) => {
    const spot = spotOf(item);
    return { extent: footprint(spot, item.halfW, item.halfD), top: spot.y + item.base() };
  };
  // The cards piled on the floor, the emptied wrappers and the balled-up shrink-wrap are things to
  // set something on too.
  const scratchBox = new Box3();
  const fixedSupports = () => {
    const supports = [];
    const add = (object) => {
      scratchBox.setFromObject(object);
      if (scratchBox.isEmpty()) return;
      const { min, max } = scratchBox;
      supports.push({ extent: { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }, top: max.y });
    };
    for (const mesh of looseMeshes) {
      if (mesh.userData.tt?.kind === 'tableCard' && mesh.parent === scene && hand?.mesh !== mesh) add(mesh);
    }
    for (const pack of packObjects) if (pack.wrapperDown) add(pack.model.group);
    if (wrapShadow.mesh.visible) {
      const r = wrapBall.radius * 0.8;
      const { x, z } = wrapBall.center;
      supports.push({ extent: { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }, top: wrapBall.center.y + r });
    }
    return supports;
  };

  /**
   * Where `item` comes to rest set down near `desired`: on the floor in view, clear of the box, on
   * top of whatever lies there.
   */
  function setDownSpot(item, desired, among = lyingItems(item)) {
    const free = clampToTable({ x: desired.x, z: desired.z, rotYDeg: desired.rotYDeg }, item.halfW, item.halfD);
    const spot = clampToTable(clearOfBox(free, boxClearance(item), boxRect), item.halfW, item.halfD);
    const supports = [...among.map(supportOf), ...fixedSupports()];
    return { ...spot, y: restHeight(footprint(spot, item.halfW, item.halfD), item.base(), item.base(), supports) };
  }

  /** What lay on something now lifted comes down onto whatever is under it. */
  function settleStacks() {
    const lying = lyingItems().sort((a, b) => spotOf(a).y - spotOf(b).y);
    const below = [];
    const drops = [];
    for (const item of lying) {
      const spot = spotOf(item);
      const supports = [...below.map(supportOf), ...fixedSupports()];
      const y = restHeight(footprint(spot, item.halfW, item.halfD), item.base(), item.base(), supports);
      if (Math.abs(y - spot.y) > 0.05) {
        const next = { ...spot, y };
        recordSpot(item, next);
        drops.push(flyTo(item.object, restPose(item, next), { durationMs: 220, lift: 0 }));
      }
      below.push(item);
    }
    return Promise.all(drops);
  }

  // Once something is out of the box, the eye looks over the whole floor.
  let tableFramed = false;
  const framingFor = (v) => (v.lidOpen ? (v.someOut ? 'table' : 'open') : 'box');
  const frameTable = () => {
    if (tableFramed) return Promise.resolve();
    tableFramed = true;
    return stage.blendCamera(cameraPose('table', aspect()), 1500);
  };

  function settle() {
    stage.finishAll();
    stopHandSway();
    dropTearFx();
    const u = getUnboxing();
    cosmetic = reconcileCosmetic(cosmetic, u);
    const v = tableView(u, cosmetic);
    hand = null;
    for (const mesh of [...looseMeshes]) dropLoose(mesh);
    revealPile.length = 0;
    extrasPile.length = 0;
    for (const pack of packObjects) {
      pack.cards = [];
      pack.pile = [];
      pack.wrapperDown = false;
      pack.model.group.visible = true;
      pack.model.strip.visible = true;
      pack.model.setPeel(0, 1);
      pack.model.group.scale.set(1, 1, 1);
      if (pack.model.strip.parent !== pack.model.group) pack.model.group.add(pack.model.strip);
      pack.model.strip.position.set(0, 0, 0);
      pack.model.strip.rotation.set(0, 0, 0);
    }

    // The camera first: a pack held in hand is placed in front of it.
    stage.applyCamera(cameraPose(framingFor(v), aspect()));
    boxModel.setLidAngle(v.lidOpen ? LID_OPEN_DEG : 0);
    if (v.wrapOn) {
      resetFilm(boxModel.film.uniforms);
      wrapShadow.mesh.visible = false;
    } else {
      crumpledFilm(boxModel.film.uniforms, boxModel.group, wrapBall.center);
      wrapShadow.mesh.visible = true;
    }

    // Each box item lies where the player set it down, or where it always went, or is still in
    // the box.
    promoCard.visible = false;
    if (!isOutOfBox(cosmetic, 'deck')) {
      putInBox(deck.group, slots.deck);
      deck.wrap.group.visible = true;
      resetFilm(deck.wrap.uniforms);
    } else if (v.deckUnwrapped) {
      deck.wrap.group.visible = false;
      layDown(deckItem);
      deck.face.map = backTexture;
      deck.face.userData.setFinish(null);
      promoCard.visible = true;
      layDown(promoItem);
    } else {
      deck.wrap.group.visible = true;
      layDown(deckItem);
      resetFilm(deck.wrap.uniforms);
    }
    if (isOutOfBox(cosmetic, 'leaflet')) layDown(leafletItem);
    else putInBox(leaflet.mesh, slots.leaflet);
    v.untornVisual.forEach((visual) => {
      const item = packItems[visual];
      if (isOutOfBox(cosmetic, item.key)) layDown(item);
      else putInBox(item.object, slots.packs[visual]);
    });
    v.tornVisual.forEach((visual, logical) => layTornPack(visual, logical, u, v));
    tableFramed = framingFor(v) === 'table';
    focusChange += 1;
    focus = hand ? 1 : 0;
    stage.setFocus(focus);
    refreshUi();
  }

  // A torn pack's cards pile where the pack lay.
  const pileSpotOf = (visual) => cosmetic.spots[packItems[visual].key] || packRowSpot(visual, packCount);

  /** A torn pack on a reloaded table: finished → its cards piled; current → in hand, part shown. */
  function layTornPack(visual, logical, u, v) {
    const pack = packObjects[visual];
    pack.model.strip.visible = false;
    layWrapper(pack, logical);
    const items = stackFor(logical);
    const revealed = u.revealed[logical];
    if (revealed >= u.cardsPerPack) {
      const pileCards = items.filter((item) => item.kind === 'card');
      pileCards.forEach((item, k) => {
        const mesh = makeStackMesh(item);
        const jitter = pileJitter(k);
        const spot = pileSpotOf(visual);
        place(mesh, flatPose({ x: spot.x + jitter.dx, z: spot.z + jitter.dz, rotYDeg: spot.rotYDeg + jitter.rotYDeg }, pileHeight(k)));
        mesh.userData.tt = { kind: 'tableCard' };
        pack.pile.push(mesh);
      });
      items.filter((item) => item.kind !== 'card').forEach((item) => landExtra(makeStackMesh(item), false));
      return;
    }
    if (v.currentVisual !== visual) return;
    const position = stackPositionFor(items, revealed);
    items.slice(0, position).forEach((item) => {
      const mesh = makeStackMesh(item);
      if (item.kind === 'card') landOnRevealPile(mesh, false);
      else landExtra(mesh, false);
    });
    holdStack(visual, logical, items, position);
  }

  function layWrapper(pack, logical) {
    pack.wrapperDown = true;
    pack.model.strip.visible = false;
    const spot = wrapperSpot(logical);
    place(pack.model.group, flatPose(spot, 1.2 + logical * 0.6, true));
    pack.model.group.scale.set(1, 1, 0.35);
  }

  // ── Piles on the mat ────────────────────────────────────────────────────
  const revealPile = [];
  const extrasPile = [];
  const pileTarget = (spot, count) => {
    const jitter = pileJitter(count);
    return flatPose(
      { x: spot.x + jitter.dx, z: spot.z + jitter.dz, rotYDeg: spot.rotYDeg + jitter.rotYDeg },
      pileHeight(count)
    );
  };
  function landOnRevealPile(mesh, animated = true) {
    const pose = pileTarget(REVEAL_SPOT, revealPile.length);
    revealPile.push(mesh);
    mesh.userData.tt = { kind: 'tableCard' };
    if (!animated) {
      place(mesh, pose);
      return Promise.resolve();
    }
    return flyTo(mesh, pose, { durationMs: 520, lift: 26 }).then(() => audio.play('card-land'));
  }
  function landExtra(mesh, animated = true) {
    const pose = pileTarget(EXTRAS_SPOT, extrasPile.length);
    extrasPile.push(mesh);
    mesh.userData.tt = { kind: 'tableCard' };
    if (!animated) {
      place(mesh, pose);
      return Promise.resolve();
    }
    return flyTo(mesh, pose, { durationMs: 520, lift: 26 }).then(() => audio.play('card-land'));
  }

  // ── Hand ────────────────────────────────────────────────────────────────
  let stopSway = null;
  const startSway = (object, basePose) => {
    stopSway?.();
    setCastShadow(object, false);
    const base = { position: basePose.position.clone(), quaternion: basePose.quaternion.clone() };
    // Reduced motion: the hand is still, and nothing keeps the frame loop running.
    if (instant()) {
      stopSway = null;
      object.position.copy(base.position);
      object.quaternion.copy(base.quaternion);
      stage.requestRender();
      return;
    }
    const extra = new Quaternion();
    const euler = new Euler();
    stopSway = stage.addTicker((now) => {
      const sway = handSway(now);
      euler.set(sway.rotXDeg * DEG, sway.rotYDeg * DEG, 0);
      extra.setFromEuler(euler);
      object.position.copy(base.position).add(new Vector3(0, sway.y, 0));
      object.quaternion.copy(base.quaternion).multiply(extra);
    });
  };
  const stopHandSway = () => {
    stopSway?.();
    stopSway = null;
  };

  // While something is held up, the floor recedes to the backdrop's blue (`stage.setFocus`). The
  // latest change wins: an older fade still running stops moving it.
  let focus = 0;
  let focusChange = 0;
  const focusTable = (on) => {
    const change = (focusChange += 1);
    const from = focus;
    const to = on ? 1 : 0;
    if (from === to) return Promise.resolve();
    return stage.animate({
      durationMs: TABLE_FOCUS_MS,
      update: (t) => {
        if (change !== focusChange) return;
        focus = from + (to - from) * easeInOutCubic(t);
        stage.setFocus(focus);
      },
    });
  };

  // The held pack's TCG Pocket light (`tt-tear-fx.js`), and the seam's pulse while it waits.
  let tearFx = null;
  let stopHint = null;
  const stopSeamHint = () => {
    stopHint?.();
    stopHint = null;
    tearFx?.setHint(0);
  };
  const startSeamHint = () => {
    stopSeamHint();
    if (!tearFx) return;
    // Reduced motion: the seam glows, still.
    if (instant()) {
      tearFx.setHint(0.5);
      stage.requestRender();
      return;
    }
    stopHint = stage.addTicker((now) => tearFx?.setHint(0.45 + 0.3 * Math.sin(now / 280)));
  };
  const dropTearFx = () => {
    stopSeamHint();
    tearFx?.dispose();
    tearFx = null;
  };
  disposers.push(dropTearFx);
  const packShapeOf = (visual) => look?.skin?.packArts?.[artIndexes[visual]]?.shape || null;

  /** The drawn cards in hand: a group facing the eye, the front card nearest. */
  function holdStack(visual, logical, items, position) {
    const group = new Group();
    group.name = 'tt-hand-stack';
    group.userData.tt = { kind: 'handStack' };
    const meshes = items.map((item, index) => {
      if (index < position) return null;
      const mesh = makeStackMesh(item);
      group.add(mesh);
      const jitter = pileJitter(index);
      mesh.position.set(jitter.dx * 0.12, jitter.dz * 0.12, -(index - position) * STACK_STEP);
      mesh.rotation.set(0, 0, jitter.rotYDeg * 0.06 * DEG);
      mesh.userData.tt = { kind: 'handStack' };
      return mesh;
    });
    scene.add(group);
    trackLoose(group);
    const pose = handPose({ halfWidth: 46, halfHeight: 62 });
    group.position.copy(pose.position);
    group.quaternion.copy(pose.quaternion);
    hand = { kind: 'stack', visual, logical, items, meshes, position, group };
    startSway(group, pose);
    return group;
  }

  /** Gives a card mesh its own copies of the shared materials, clipped by `plane`. */
  function clipCard(mesh, plane) {
    const clipped = mesh.material.map((material, index) => {
      const own = index === 0 ? material : material.clone();
      own.clippingPlanes = [plane];
      return own;
    });
    mesh.material = clipped;
    return clipped;
  }

  // Shaders the opening needs later compile now, behind the loading screen: the card stack clipped
  // by a pack's mouth would otherwise stall the first tear on its compile. The probe's materials
  // stay alive (never drawn) so three keeps those programs until the tear uses them.
  async function warmShaders() {
    const probe = kit.makeCard({ map: backTexture, name: 'tt-warm' });
    const probeMaterials = clipCard(probe, new Plane(new Vector3(0, 1, 0), 0));
    disposers.push(() => probeMaterials.forEach((material) => material.dispose()));
    const warm = new Group();
    warm.add(probe);
    // The tear's light too (only the eye draws it): its shaders would otherwise compile as the
    // first pack comes up.
    const eyeOnly = new Group();
    if (packObjects.length) {
      const lightProbe = createTearFx({ model: packObjects[0].model, shape: packShapeOf(0) });
      eyeOnly.add(lightProbe.group);
      disposers.push(() => lightProbe.dispose());
    }
    try {
      await renderer.compileAsync(warm, camera, scene);
      await renderer.compileAsync(eyeOnly, camera, scene);
      await stage.compileForMirror(warm);
    } catch {
      // A shader that fails here fails again where it is used, and three reports it there.
    }
  }

  // Things start casting shadows as they land on the mat, and the shadow pass compiles a depth
  // shader for each kind of material the first time it meets one. One frame drawn with every
  // shadow on, behind the loading screen, compiles them all up front.
  function warmShadows() {
    const switched = [];
    scene.traverse((node) => {
      if (node.isMesh && !node.castShadow) {
        node.castShadow = true;
        switched.push(node);
      }
    });
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    switched.forEach((node) => {
      node.castShadow = false;
    });
    renderer.shadowMap.needsUpdate = true;
  }

  // ── Beats ───────────────────────────────────────────────────────────────
  // Where the fingers caught the shrink-wrap, in the box's frame.
  const wrapGrab = (hitWorld) =>
    hitWorld
      ? boxModel.group.worldToLocal(hitWorld.clone())
      : new Vector3(dims.width * 0.32, dims.height * 0.98, dims.depth / 2);
  /** The shrink-wrap `t` of the way through its peel: torn open from `grab`, lifted, balled up. */
  function poseWrap(grab, t) {
    const uniforms = boxModel.film.uniforms;
    const pose = wrapPeelPose(t);
    uniforms.uTear.value.set(grab.x, grab.y, grab.z, 2 + pose.open * 60);
    uniforms.uLoosen.value = pose.lift;
    uniforms.uCrumple.value = pose.crumple;
    const k = easeInOutCubic(smoothstep(0.45, 1, t));
    const center = new Vector3(0, dims.height + 30, 0).lerp(boxModel.group.worldToLocal(wrapBall.center.clone()), k);
    center.y += Math.sin(Math.PI * k) * 40;
    uniforms.uBallCenter.value.copy(center);
    uniforms.uBallRadius.value = wrapBall.radius;
  }

  /** The shrink-wrap torn off, from `fromT` of the way through (where a drag let go of it). */
  async function tearWrap(hitWorld = null, fromT = 0, grabbed = null) {
    const grab = grabbed || wrapGrab(hitWorld);
    if (!send({ type: 'tearWrap' })) return;
    // A drag already sounded the tear as it began.
    if (fromT <= 0) audio.play('wrap-tear');
    let crumpleSounded = fromT > 0.35;
    await stage.animate({
      durationMs: 1700 * (1 - fromT),
      update: (t) => {
        const at = fromT + (1 - fromT) * t;
        poseWrap(grab, at);
        if (!crumpleSounded && at > 0.35) {
          crumpleSounded = true;
          audio.play('wrap-crumple');
        }
      },
    });
    wrapShadow.mesh.visible = true;
    audio.play('wrap-drop');
  }

  async function openLid(fromDeg = 0) {
    if (!send({ type: 'openLid' })) return;
    audio.play('lid-open');
    const span = LID_OPEN_DEG - fromDeg;
    const cameraMove = stage.blendCamera(cameraPose('open', aspect()), 1200);
    const fromRest = fromDeg <= 0;
    await stage.animate({
      durationMs: (fromRest ? 1150 : 1000) * Math.max(0.35, span / LID_OPEN_DEG),
      update: (t) => boxModel.setLidAngle(fromDeg + (lidAngleDeg(t, { fromRest }) / LID_OPEN_DEG) * span),
    });
    await cameraMove;
  }

  /** Takes `items` (by default all still in the box) out to their usual places, one after another. */
  async function takeOut(items = boxItems().filter((item) => !isOutOfBox(cosmetic, item.key))) {
    const due = items.filter((item) => !isOutOfBox(cosmetic, item.key));
    if (!view().lidOpen || !due.length) return;
    const cameraMove = frameTable();
    const jobs = due.map((item, index) => {
      // Each is given its spot before it flies, so the next one out lands beside it, or on it.
      const spot = setDownSpot(item, item.home);
      recordSpot(item, spot);
      return liftOut({ object: item.object, pose: () => restPose(item, spot), sound: item.sound }, index * 360);
    });
    await Promise.all(jobs);
    await cameraMove;
  }

  async function liftOut({ object, pose, sound }, delayMs) {
    await stage.wait(delayMs);
    if (disposed) return;
    scene.attach(object);
    const start = object.position.clone();
    const up = start.clone().add(new Vector3(0, dims.height + 25 - start.y + 40, 0));
    audio.play('item-lift');
    await stage.animate({
      durationMs: 420,
      update: (t) => object.position.lerpVectors(start, up, easeOutCubic(t)),
    });
    // Lifted clear of the box, it keeps that height until it is past the front wall.
    await flyTo(object, pose(), { durationMs: 680, lift: 18, over: 'higher' });
    audio.play(sound);
  }

  async function unwrapDeck() {
    const v = view();
    if (!v.itemsOut || v.deckUnwrapped) return;
    audio.play('item-lift');
    const inHand = handPose({ halfWidth: 46, halfHeight: 60 });
    focusTable(true);
    await flyTo(deck.group, inHand, { durationMs: 700, lift: 22 });
    if (!send({ type: 'unwrapDeck' })) return;
    audio.play('deck-unwrap');
    const uniforms = deck.wrap.uniforms;
    uniforms.uTear.value.set(CARD.width / 2, CARD.height / 2, deck.thickness / 2, 1);
    const from = new Vector3(0, CARD.height * 0.7, 10);
    const to = deck.group.worldToLocal(wrapBall.center.clone().add(new Vector3(18, 6, -10)));
    await stage.animate({
      durationMs: 1300,
      update: (t) => {
        const pose = deckWrapPose(t);
        uniforms.uTear.value.w = 1 + pose.open * 38;
        uniforms.uLoosen.value = pose.open;
        uniforms.uCrumple.value = pose.slide;
        uniforms.uBallRadius.value = 8;
        uniforms.uBallCenter.value.copy(from.clone().lerp(to, easeInOutCubic(pose.slide)));
      },
    });
    deck.wrap.group.visible = false;
    // The promo is the deck's bottom card, face out: it slides off the stack toward the eye.
    promoCard.visible = true;
    deck.group.updateMatrixWorld();
    const promoStart = new Vector3(0, 0, deck.thickness / 2 + CARD.thickness / 2);
    promoCard.position.copy(deck.group.localToWorld(promoStart));
    promoCard.quaternion.copy(deck.group.quaternion);
    scene.add(promoCard);
    deck.face.map = backTexture;
    deck.face.userData.setFinish(null);
    audio.play('card-slide');
    // The deck goes down on the table, back up, while the promo comes up to the eye.
    const showcase = handPose({ y: 6, halfWidth: 40, halfHeight: 56, tiltXDeg: -2 });
    audio.play('deck-down');
    // Back where the player had it (the promo, still in the hand, isn't under it yet).
    const deckSpot = setDownSpot(deckItem, spotOf(deckItem), lyingItems(deckItem).filter((item) => item !== promoItem));
    recordSpot(deckItem, deckSpot);
    await Promise.all([
      flyTo(promoCard, showcase, { durationMs: 650, lift: 10 }),
      flyTo(deck.group, restPose(deckItem, deckSpot), { durationMs: 760, lift: 50 }),
    ]);
    // Tilt it under the light: the foil wakes up.
    const base = promoCard.quaternion.clone();
    await stage.animate({
      durationMs: 1700,
      update: (t) => {
        const swing = Math.sin(t * Math.PI * 2) * (1 - t * 0.35);
        promoCard.quaternion.copy(base).multiply(
          new Quaternion().setFromEuler(new Euler(swing * 9 * DEG, swing * 16 * DEG, 0))
        );
      },
    });
    focusTable(false);
    const promoSpot = setDownSpot(promoItem, spotOf(promoItem), lyingItems(promoItem));
    recordSpot(promoItem, promoSpot);
    await flyTo(promoCard, restPose(promoItem, promoSpot), { durationMs: 760, lift: 40 });
    audio.play('card-land');
  }

  async function pickPack(visual) {
    const pack = packObjects[visual];
    const u = getUnboxing();
    if (hand || !pack || nextPackToTear(u) < 0 || logicalOfVisual(cosmetic, visual) >= 0) return;
    audio.play('pack-pick');
    // The cards it will hold start loading now: it takes the next logical pack's.
    const logical = nextPackToTear(u);
    stackFor(logical).forEach((item) => {
      if (item.url) faceTexture(item.url, item.card);
    });
    const pose = handPose({ halfWidth: 44, halfHeight: 68 });
    focusTable(true);
    await flyTo(pack.model.group, pose, { durationMs: 720, lift: 22 });
    hand = { kind: 'pack', visual, peel: 0 };
    startSway(pack.model.group, pose);
    settleStacks();
    dropTearFx();
    tearFx = createTearFx({ model: pack.model, shape: packShapeOf(visual) });
    startSeamHint();
  }

  /** A finger lands on the held pack at `worldPoint`: a rainbow ring opens there (the latest touch's). */
  let touches = 0;
  function touchPack(worldPoint) {
    if (hand?.kind !== 'pack' || !tearFx || !worldPoint) return;
    stopSeamHint();
    const local = packObjects[hand.visual].model.group.worldToLocal(worldPoint.clone());
    const fx = tearFx;
    const touch = (touches += 1);
    stage.animate({
      durationMs: 420,
      update: (t) => {
        if (touch === touches) fx.setTouch(local, t);
      },
    });
  }

  /**
   * The TCG Pocket tear: the finger runs the cut through to the far end (a tap or the button runs
   * all of it), then the flash, the rainbow halo folding into a beam across the screen, the cut
   * strip springing off, and the cards drawn out while the cut edge still glints.
   */
  async function tearHeldPack(fromProgress = 0, side = 1) {
    if (hand?.kind !== 'pack') return;
    const visual = hand.visual;
    const pack = packObjects[visual];
    const action = tearPackAction(getUnboxing(), cosmetic, visual);
    if (!action) return;
    if (!send(action.event)) return;
    cosmetic = action.cosmetic;
    saveCosmetic();
    const logical = action.event.packIndex;
    stopHandSway();
    stopSeamHint();
    // It stays registered until its light is out, so a teardown mid-tear still frees it.
    const fx = tearFx;
    const start = Math.max(0, Math.min(1, fromProgress));
    // The rip sounds with the cut; its snap lands as the light flashes.
    audio.play('pack-tear');
    await stage.animate({
      durationMs: 90 + 170 * (1 - start),
      update: (t) => {
        const cut = start + (1 - start) * t;
        pack.model.setPeel(cut, side, PEEL_FLEX_DEG);
        fx?.setCut(cut, side, 1);
      },
    });
    const light = stage.animate({
      durationMs: POCKET_TEAR_MS,
      update: (t) => fx?.setLight(pocketTearLight(t * POCKET_TEAR_MS)),
    });
    await stage.wait(STRIP_POP_DELAY_MS);
    flingStrip(pack, logical, side);
    await stage.wait(CARDS_AFTER_POP_MS);
    await Promise.all([pullCards(pack, visual, logical), light]);
    if (tearFx === fx) dropTearFx();
  }

  /**
   * The cut strip springs up off the pack and whips away spinning and rippling like a ribbon, up
   * out of view (the game's strip), then flutters down onto the floor by the emptied wrappers.
   * It turns about its own middle; its landing pose is the one reviewed in iteration 9.
   */
  function flingStrip(pack, logical, side) {
    const strip = pack.model.strip;
    const group = pack.model.group;
    group.updateMatrixWorld();
    const groupQ = group.getWorldQuaternion(new Quaternion());
    const up = new Vector3(0, 1, 0).applyQuaternion(groupQ);
    const across = new Vector3(side, 0, 0).applyQuaternion(groupQ);
    const toward = new Vector3(0, 0, 1).applyQuaternion(groupQ);
    scene.attach(strip);
    const middle = new Vector3(0, pack.model.stripCenterY, 0);
    const fromQ = strip.quaternion.clone();
    const startAt = strip.position.clone().add(middle.clone().applyQuaternion(fromQ));
    const poppedAt = startAt.clone().addScaledVector(up, 170).addScaledVector(across, 60).addScaledVector(toward, 40);
    const spot = wrapperSpot(logical);
    const restQ = qFlat(spot.rotYDeg * 2 + 40 * side, true);
    const restAt = new Vector3(spot.x + 20 * side, 0.4 + logical * 0.3, spot.z - 50).add(
      middle.clone().applyQuaternion(restQ)
    );
    const whipped = fromQ.clone().multiply(new Quaternion().setFromEuler(new Euler(-0.5, 0.25 * side, 0.9 * side)));
    const turn = new Quaternion();
    const tumble = new Quaternion();
    const euler = new Euler();
    const at = new Vector3();
    stage.animate({
      durationMs: STRIP_FLIGHT_MS,
      update: (t) => {
        if (t < STRIP_POP_AT) {
          // It springs free at once, then whips away ever faster.
          const k = t / STRIP_POP_AT;
          at.copy(startAt).lerp(poppedAt, 0.06 * Math.sin((Math.PI / 2) * Math.min(1, k * 3)) + 0.94 * easeInCubic(k));
          turn.copy(fromQ).slerp(whipped, smoothstep(0, 1, k));
        } else {
          const k = (t - STRIP_POP_AT) / (1 - STRIP_POP_AT);
          const point = arcPoint(poppedAt, restAt, k, 40);
          at.set(point.x, point.y, point.z);
          tumble.setFromEuler(euler.set(k * 3.6 * side, k * 1.6, k * 4.4 * side));
          turn.copy(whipped).multiply(tumble).slerp(restQ, smoothstep(0.6, 1, k));
        }
        strip.quaternion.copy(turn);
        strip.position.copy(at).sub(middle.clone().applyQuaternion(turn));
        pack.model.shapeStrip({
          foldDeg: PEEL_FLEX_DEG * (1 - smoothstep(0, 0.12, t)),
          curl: smoothstep(0.55, 1, t),
          wave: 4.5 * Math.sin(Math.PI * Math.min(1, t / 0.85)),
          phase: t * 16,
        });
      },
    });
  }

  /** The stack is drawn up out of the mouth, the empty wrapper is set down, the cards are held. */
  async function pullCards(pack, visual, logical) {
    const items = stackFor(logical);
    const group = pack.model.group;
    const proxy = makeStackMesh(items[0]);
    proxy.scale.set(1, 1, items.length);
    // It rises from a pack held in the hand, and held things cast no shadow.
    proxy.castShadow = false;
    group.add(proxy);
    // Nothing of the stack shows below the mouth: it is still inside the wrapper there.
    const mouth = new Plane();
    const clipped = clipCard(proxy, mouth);
    const travel = CARD.height + 8;
    const startY = pack.model.mouthY - CARD.height / 2 - 4;
    proxy.position.set(0, startY, 0);
    const up = new Vector3();
    const point = new Vector3();
    const quaternion = new Quaternion();
    // The wrapper is slid down off the cards more than the cards are drawn up, so the stack stays
    // in view: drawn a full card height out of a pack that fills the view, it left the screen.
    const handAt = group.position.clone();
    const handDown = new Vector3(0, -1, 0).applyQuaternion(group.quaternion);
    audio.play('cards-out');
    await stage.animate({
      durationMs: 1100,
      update: (t) => {
        const pulled = stackPullPose(t);
        proxy.position.y = startY + travel * pulled;
        group.position.copy(handAt).addScaledVector(handDown, travel * WRAPPER_SLIDE * pulled);
        group.updateMatrixWorld();
        up.set(0, 1, 0).applyQuaternion(group.getWorldQuaternion(quaternion));
        point.set(0, pack.model.mouthY - 0.5, 0);
        group.localToWorld(point);
        mouth.setFromNormalAndCoplanarPoint(up, point);
      },
    });
    proxy.parent?.remove(proxy);
    dropLoose(proxy);
    clipped.slice(1).forEach((material) => material.dispose());
    const held = holdStack(visual, logical, items, 0);
    stopHandSway();
    const target = { position: held.position.clone(), quaternion: held.quaternion.clone() };
    group.updateMatrixWorld();
    held.position.copy(group.localToWorld(new Vector3(0, startY + travel, 0)));
    held.quaternion.copy(group.getWorldQuaternion(new Quaternion()));
    await Promise.all([
      flyTo(held, target, { durationMs: 420, lift: 0 }),
      setWrapperDown(pack, logical),
    ]);
    startSway(held, target);
  }

  async function setWrapperDown(pack, logical) {
    const spot = wrapperSpot(logical);
    const group = pack.model.group;
    // Emptied, the wrapper goes slack on its way down instead of landing as a full pack.
    await Promise.all([
      flyTo(group, flatPose(spot, 1.2 + logical * 0.6, true), { durationMs: 760, lift: 30, delayMs: 120 }),
      stage.animate({
        durationMs: 640,
        delayMs: 120,
        update: (t) => group.scale.set(1, 1, 1 - 0.65 * easeOutCubic(t)),
      }),
    ]);
    group.scale.set(1, 1, 0.35);
    pack.wrapperDown = true;
    audio.play('pack-land');
  }

  async function revealNext(side = 1, { fast = false } = {}) {
    if (hand?.kind !== 'stack') return;
    const { items, meshes } = hand;
    const index = hand.position;
    const item = items[index];
    const mesh = meshes[index];
    if (!item || !mesh) return;
    if (item.kind === 'card' && !send({ type: 'revealCard', packIndex: hand.logical })) return;
    hand.position += 1;
    const nextItem = items[index + 1];
    // A hit waits behind this card: it slides off slowly.
    const slow = !fast && nextItem?.kind === 'card' && (nextItem.tier || 0) >= 2;
    audio.play('card-slide');
    const startPos = mesh.position.clone();
    const startRot = mesh.rotation.z;
    await stage.animate({
      durationMs: fast ? 160 : slow ? 1300 : 300,
      update: (t) => {
        const pose = slideOffPose(t, side);
        mesh.position.set(startPos.x + pose.dx * CARD.width, startPos.y + Math.sin(Math.PI * t) * 3, startPos.z + 0.6);
        mesh.rotation.z = startRot + pose.rotZDeg * DEG;
      },
    });
    if (slow) audio.play('card-flip');
    const landing = item.kind === 'card' ? landOnRevealPile(mesh) : landExtra(mesh);
    if (slow) await showcaseHeld();
    // The stack moves up so its new front card sits where the last one was.
    hand.group.children.forEach((child) => {
      if (child !== mesh) child.position.z += STACK_STEP;
    });
    if (hand.position >= items.length) {
      await landing;
      await showSummary();
    } else if (fast) {
      await landing;
    }
  }

  /** A big hit is tipped through the light once, so its foil flashes. */
  async function showcaseHeld() {
    if (hand?.kind !== 'stack') return;
    const group = hand.group;
    stopHandSway();
    const base = { position: group.position.clone(), quaternion: group.quaternion.clone() };
    const swing = new Quaternion();
    const euler = new Euler();
    await stage.animate({
      durationMs: 1900,
      update: (t) => {
        const wave = Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI);
        euler.set(wave * 7 * DEG, wave * 17 * DEG, wave * 2 * DEG);
        group.quaternion.copy(base.quaternion).multiply(swing.setFromEuler(euler));
      },
    });
    startSway(group, base);
  }

  async function revealRest() {
    while (hand?.kind === 'stack' && hand.position < hand.items.length && !disposed) {
      await revealNext(1, { fast: true });
    }
  }

  /** The pack's ten cards rise off the pile and fan out in front of the eye. */
  async function showSummary() {
    if (hand?.kind !== 'stack') return;
    const { visual, logical, group } = hand;
    stopHandSway();
    group.parent?.remove(group);
    looseMeshes.delete(group);
    const cards = revealPile.splice(0, revealPile.length);
    const count = cards.length;
    const fan = summaryColumns(count, aspect(), camera.fov);
    const distance = Math.max(540, fan.distance);
    hand = { kind: 'summary', visual, logical, cards };
    audio.play('card-slide');
    await Promise.all(
      cards.map((mesh, k) => {
        const slot = summarySlot(k, count, fan.columns);
        const pose = handPose({ x: slot.x, y: slot.y - HAND.y, z: -distance, tiltXDeg: 0 });
        mesh.userData.tt = { kind: 'summaryCard' };
        return flyTo(mesh, pose, { durationMs: 620, lift: 20, delayMs: k * 55 });
      })
    );
  }

  /** The fanned cards gather into a pile where their pack lay; the rare ends on top. */
  async function putSummaryDown() {
    if (hand?.kind !== 'summary') return;
    const { visual, cards } = hand;
    const pack = packObjects[visual];
    const spot = pileSpotOf(visual);
    hand = null;
    focusTable(false);
    await Promise.all(
      cards.map((mesh, k) => {
        const jitter = pileJitter(k);
        mesh.userData.tt = { kind: 'tableCard' };
        pack.pile.push(mesh);
        return flyTo(
          mesh,
          flatPose({ x: spot.x + jitter.dx, z: spot.z + jitter.dz, rotYDeg: spot.rotYDeg + jitter.rotYDeg }, pileHeight(k)),
          { durationMs: 560, lift: 24, delayMs: k * 45 }
        );
      })
    );
    audio.play('card-land');
  }

  // ── Inspecting a card on the mat ────────────────────────────────────────
  async function inspect(mesh) {
    if (hand) return;
    const back = { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() };
    audio.play('card-slide');
    const pose = handPose({ halfWidth: 40, halfHeight: 52, tiltXDeg: -2 });
    focusTable(true);
    await flyTo(mesh, pose, { durationMs: 560, lift: 16 });
    hand = { kind: 'inspect', mesh, back, pose };
    followPointer(mesh, pose);
  }

  // The held card turns toward the pointer, so the light rakes across its foil.
  let pointer = { x: 0, y: 0 };
  function followPointer(object, pose) {
    stopSway?.();
    const tilt = { x: 0, y: 0 };
    const extra = new Quaternion();
    const euler = new Euler();
    stopSway = stage.addTicker((now, dt) => {
      const k = instant() ? 1 : 1 - Math.exp(-dt / 90);
      tilt.x += (pointer.y * 16 - tilt.x) * k;
      tilt.y += (pointer.x * 24 - tilt.y) * k;
      const sway = handSway(now);
      euler.set((tilt.x + sway.rotXDeg) * DEG, (tilt.y + sway.rotYDeg) * DEG, 0);
      object.position.copy(pose.position);
      object.quaternion.copy(pose.quaternion).multiply(extra.setFromEuler(euler));
    });
  }

  async function putBack() {
    if (hand?.kind !== 'inspect') return;
    const { mesh, back } = hand;
    stopHandSway();
    hand = null;
    focusTable(false);
    await flyTo(mesh, back, { durationMs: 520, lift: 30 });
    audio.play('card-land');
  }

  // ── The one "next step" ─────────────────────────────────────────────────
  const firstUntorn = () => view().untornVisual[0];

  function nextAction() {
    const v = view();
    if (hand?.kind === 'pack') return { label: 'Tear it open', run: () => tearHeldPack() };
    if (hand?.kind === 'stack') {
      const remaining = hand.items.length - hand.position;
      return { label: remaining === 1 ? 'Last card' : 'Next card', run: () => revealNext(1) };
    }
    if (hand?.kind === 'summary') return { label: 'Set them down', run: putSummaryDown };
    if (hand?.kind === 'inspect') return { label: 'Put it back', run: putBack };
    switch (nextStep(v)) {
      case 'tearWrap':
        return { label: 'Tear off the wrap', run: () => tearWrap() };
      case 'openLid':
        return { label: 'Open the lid', run: () => openLid() };
      case 'takeOut':
        return { label: v.someOut ? 'Take the rest out' : 'Take everything out', run: () => takeOut() };
      case 'unwrapDeck':
        return { label: `Unwrap the ${words.deck}`, run: unwrapDeck };
      case 'revealCard':
        return { label: 'Next card', run: () => revealNext(1) };
      case 'openPack':
        return { label: 'Pick up a pack', run: () => pickPack(firstUntorn()) };
      default:
        return { label: finishLabel, run: finishScene };
    }
  }

  function hintFor() {
    const v = view();
    if (hand?.kind === 'pack') return 'Drag across the top of the pack to tear it open.';
    if (hand?.kind === 'stack') {
      const item = hand.items[hand.position];
      if (item?.kind === 'energy') return 'A Basic Energy. Keep going.';
      return 'Swipe or tap the front card to see the next one.';
    }
    if (hand?.kind === 'summary') return 'This pack’s ten cards.';
    if (hand?.kind === 'inspect') return 'Move the pointer to tilt it in the light. Tap to put it back.';
    if (v.wrapOn) return 'Press on the box and drag to tear the shrink-wrap off.';
    if (!v.lidOpen) return 'Press on the lid and drag it up to open the box.';
    if (!v.itemsOut) return `${words.inside} Drag each one out and set it down wherever you like.`;
    if (!v.deckUnwrapped) return `Tap the ${words.deck} to unwrap it: its promo card is on the bottom. Drag things to move them.`;
    if (v.untornVisual.length) {
      return `${v.untornVisual.length} pack${v.untornVisual.length === 1 ? '' : 's'} left. Tap one to pick it up, or drag it.`;
    }
    return 'Everything is out of the box. Tap any card to look at it.';
  }

  function refreshUi() {
    const v = view();
    const next = nextAction();
    ui.setPrimary(next.label, { enabled: !busy });
    ui.setHint(hintFor());
    ui.showRevealAll(hand?.kind === 'stack' && !busy);
    ui.showSkip(!v.done && !busy);
    const torn = v.tornVisual.length;
    if (hand?.kind === 'stack') {
      const shown = poolCardsBefore(hand.items, hand.position);
      ui.setCounter(`Pack ${torn} of ${packCount} · ${shown} / ${getUnboxing().cardsPerPack}`);
    } else if (torn) ui.setCounter(`${torn} of ${packCount} packs opened`);
    else ui.setCounter('');
  }

  async function run(task) {
    // Nothing else moves while the player carries something.
    if (disposed || carry) return;
    if (busy) {
      queued = task;
      return;
    }
    busy = true;
    refreshUi();
    try {
      await task();
    } finally {
      busy = false;
      if (!disposed) {
        refreshUi();
        const nextTask = queued;
        queued = null;
        if (nextTask) run(nextTask);
      }
    }
  }

  // A press while a beat plays is queued as "the next step", worked out once that beat is over.
  const doNext = () => run(() => nextAction().run());

  async function skipToEnd() {
    const u = getUnboxing();
    const current = u.packsTorn.findIndex((torn, index) => torn && u.revealed[index] < u.cardsPerPack);
    if (current >= 0) send({ type: 'revealAll', packIndex: current });
    if (!send({ type: 'finish' }) && getUnboxing().stage !== 'done') return;
    cosmetic = finishCosmetic(cosmetic, packCount);
    saveCosmetic();
    settle();
  }

  function finishScene() {
    onFinish?.('collection', { wantsGuide: false });
  }

  function onUiAction(action) {
    audio.unlock();
    if (action === 'primary') doNext();
    else if (action === 'revealAll') run(revealRest);
    else if (action === 'skip') {
      stage.finishAll();
      queued = null;
      run(skipToEnd);
    } else if (action === 'sound') options.toggleSound?.();
  }

  // ── Pointer ─────────────────────────────────────────────────────────────
  const canvas = stage.canvas;
  let press = null;
  const pickables = () => [
    boxModel.group,
    deck.group,
    promoCard,
    leaflet.mesh,
    ...packObjects.map((pack) => pack.model.group),
    ...looseMeshes,
  ];
  const tagOf = (object) => {
    let node = object;
    while (node) {
      if (node.userData?.tt) return { node, tag: node.userData.tt };
      node = node.parent;
    }
    return null;
  };
  // Balled up, the shrink-wrap's mesh still spans the box (the crumple is drawn by its shader): it
  // must not stop the pointer reaching what is inside.
  const boxFilm = new Set(boxModel.film.meshes);
  const hitAt = (event) => {
    const hits = stage.pick(event.clientX, event.clientY, pickables());
    const wrapGone = !view().wrapOn;
    for (const hit of hits) {
      if (!hit.object.visible || (wrapGone && boxFilm.has(hit.object))) continue;
      const found = tagOf(hit.object);
      if (found) return { ...found, point: hit.point, object: hit.object };
    }
    return null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || busy) return;
    audio.unlock();
    const hit = hitAt(event);
    const v = view();
    press = { x: event.clientX, y: event.clientY, hit, mode: null, progress: 0, peelTicks: 0, side: 1 };
    if (hit?.tag.kind === 'box' && v.wrapOn) press.mode = 'wrap';
    else if (hit?.tag.kind === 'box' && !v.lidOpen && boxModel.isLidMesh(hit.object)) press.mode = 'lid';
    else if (hand?.kind === 'pack' && hit?.node === packObjects[hand.visual].model.group) {
      press.mode = 'peel';
      touchPack(hit.point);
    }
    else if (hand?.kind === 'stack' && hit?.tag.kind === 'handStack') press.mode = 'swipe';
    else if (!hand) {
      press.item = movableOf(hit, v);
      if (press.item) press.mode = 'carry';
    }
    canvas.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1,
    };
    if (!press) {
      hoverCursor(event);
      return;
    }
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    const moved = Math.hypot(dx, dy) > TAP_SLOP_PX;
    if (carry) {
      carry.client.x = event.clientX;
      carry.client.y = event.clientY;
      return;
    }
    if (!moved || busy) return;
    press.dragged = true;
    if (press.mode === 'carry') {
      startCarry(press.item, { x: event.clientX, y: event.clientY });
    } else if (press.mode === 'lid') {
      const angle = LID_OPEN_DEG * dragProgress(-dy, 220);
      press.progress = angle / LID_OPEN_DEG;
      boxModel.setLidAngle(angle);
      stage.requestRender();
    } else if (press.mode === 'peel') {
      const pack = packObjects[hand.visual].model;
      press.side = dx >= 0 ? 1 : -1;
      const width = packScreenWidth(pack);
      press.progress = dragProgress(Math.abs(dx), width);
      pack.setPeel(press.progress, press.side, PEEL_FLEX_DEG);
      tearFx?.setCut(press.progress, press.side, 1);
      const ticks = Math.floor(press.progress * 10);
      if (ticks > press.peelTicks) {
        press.peelTicks = ticks;
        audio.play('pack-peel');
      }
      stage.requestRender();
      if (press.progress >= PACK_TORN_AT + 0.25) {
        const { progress, side } = press;
        press = null;
        run(() => tearHeldPack(progress, side));
      }
    } else if (press.mode === 'swipe') {
      const mesh = hand.meshes[hand.position];
      if (mesh) {
        mesh.position.x = (dx / Math.max(1, stage.size.width)) * 260;
        stage.requestRender();
      }
      press.progress = dx;
    } else if (press.mode === 'wrap') {
      // The film tears open under the fingers as far as they drag it; all the way and it comes off.
      if (!press.grab) {
        press.grab = wrapGrab(press.hit?.point || null);
        audio.play('wrap-tear');
      }
      press.progress = dragProgress(Math.hypot(dx, dy), WRAP_DRAG_PX);
      poseWrap(press.grab, press.progress * WRAP_DRAG_SPAN);
      stage.requestRender();
      if (press.progress >= 1) {
        const { grab } = press;
        press = null;
        run(() => tearWrap(null, WRAP_DRAG_SPAN, grab));
      }
    }
  };

  const onPointerUp = (event) => {
    const current = press;
    press = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (carry) {
      dropCarry();
      return;
    }
    if (!current || busy) return;
    if (current.dragged) {
      if (current.mode === 'wrap') {
        const from = current.progress * WRAP_DRAG_SPAN;
        if (current.progress >= 0.5) run(() => tearWrap(null, from, current.grab));
        else if (current.grab) {
          // Let go too soon: the film settles back over the box.
          stage
            .animate({ durationMs: 260, update: (t) => poseWrap(current.grab, from * (1 - easeOutCubic(t))) })
            .then(() => {
              if (view().wrapOn) resetFilm(boxModel.film.uniforms);
            });
        }
      } else if (current.mode === 'lid') {
        if (current.progress >= LID_OPEN_AT) run(() => openLid(current.progress * LID_OPEN_DEG));
        else {
          const from = current.progress * LID_OPEN_DEG;
          stage.animate({ durationMs: 260, update: (t) => boxModel.setLidAngle(from * (1 - easeOutCubic(t))) });
        }
      } else if (current.mode === 'peel') {
        if (current.progress >= PACK_TORN_AT) run(() => tearHeldPack(current.progress, current.side));
        else {
          // Let go too soon: the cut closes up again and the seam goes back to glowing.
          const pack = packObjects[hand.visual].model;
          const from = current.progress;
          const fx = tearFx;
          stage
            .animate({
              durationMs: 200,
              update: (t) => {
                const cut = from * (1 - easeOutCubic(t));
                pack.setPeel(cut, current.side, PEEL_FLEX_DEG);
                fx?.setCut(cut, current.side, 1 - t);
              },
            })
            .then(() => {
              if (fx === tearFx && hand?.kind === 'pack') startSeamHint();
            });
        }
      } else if (current.mode === 'swipe') {
        const mesh = hand?.meshes?.[hand.position];
        if (Math.abs(current.progress) > 50) run(() => revealNext(current.progress > 0 ? 1 : -1));
        else if (mesh) stage.animate({ durationMs: 160, update: (t) => (mesh.position.x *= 1 - t) });
      }
      return;
    }
    clickOn(current.hit);
  };

  function clickOn(hit) {
    const v = view();
    const kind = hit?.tag.kind;
    if (hand?.kind === 'inspect') return run(putBack);
    if (hand?.kind === 'summary') return run(putSummaryDown);
    if (hand?.kind === 'pack' && hit?.node === packObjects[hand.visual].model.group) return run(() => tearHeldPack());
    if (hand?.kind === 'stack' && kind === 'handStack') return run(() => revealNext(1));
    if (hand) return undefined;
    // A tap only shows how: the box opens under a drag (the dock's button still does it all).
    if (kind === 'box') {
      if (!v.wrapOn && !v.lidOpen) return run(nudgeLid);
      return undefined;
    }
    const item = movableOf(hit, v);
    if (item && !isOutOfBox(cosmetic, item.key)) return run(() => takeOut([item]));
    if (kind === 'deck' && !v.itemsOut) {
      ui.setHint(`Take everything out of the box first, then tap the ${words.deck} to unwrap it.`);
      return undefined;
    }
    if (kind === 'deck' && !v.deckUnwrapped) return run(unwrapDeck);
    if (kind === 'pack') {
      if (!v.deckUnwrapped) {
        ui.setHint(`Unwrap your ${words.deck} first: its promo is waiting on the bottom.`);
        return undefined;
      }
      return run(() => pickPack(hit.tag.visual));
    }
    if (kind === 'tableCard' && hit.node.isMesh) return run(() => inspect(hit.node));
    return undefined;
  }

  const hoverCursor = (event) => {
    if (busy) return;
    const hit = hitAt(event);
    const v = view();
    const grabbable = !hand && (movableOf(hit, v) || (hit?.tag.kind === 'box' && !v.lidOpen));
    canvas.style.cursor = grabbable ? 'grab' : hit ? 'pointer' : 'default';
  };

  /** What a press on `hit` would pick up off the floor or out of the box, if anything. */
  function movableOf(hit, v) {
    const kind = hit?.tag.kind;
    if (!v.lidOpen || !kind) return null;
    if (kind === 'deck') return deckItem;
    if (kind === 'leaflet') return leafletItem;
    if (kind === 'pack') return v.untornVisual.includes(hit.tag.visual) ? packItems[hit.tag.visual] || null : null;
    if (kind === 'tableCard' && hit.node === promoCard) return promoItem;
    return null;
  }

  /** A tap on the shut lid: it lifts a little and drops back, to show it opens by hand. */
  async function nudgeLid() {
    audio.play('lid-open');
    await stage.animate({ durationMs: 520, update: (t) => boxModel.setLidAngle(12 * Math.sin(Math.PI * t)) });
    boxModel.setLidAngle(0);
  }

  // ── Carrying ────────────────────────────────────────────────────────────
  let carry = null;
  let stopCarry = null;
  disposers.push(() => stopCarry?.());
  const carryRay = new Raycaster();
  const carryNdc = new Vector2();
  const carryLevel = new Plane(new Vector3(0, 1, 0), 0);
  const carryHit = new Vector3();
  /** Where the pointer's ray meets the level `height` over the floor, or null. */
  const pointerAt = (client, height) => {
    const rect = canvas.getBoundingClientRect();
    carryNdc.set(((client.x - rect.left) / rect.width) * 2 - 1, -((client.y - rect.top) / rect.height) * 2 + 1);
    carryRay.setFromCamera(carryNdc, camera);
    carryLevel.constant = -height;
    return carryRay.ray.intersectPlane(carryLevel, carryHit);
  };
  const clampLean = (deg) => Math.max(-CARRY_LEAN_DEG, Math.min(CARRY_LEAN_DEG, deg));

  /**
   * The press on `item` became a drag: it comes up (straight out of the box first, clear of the
   * walls), turns to lie flat, and follows the pointer over the floor, leaning into its motion.
   */
  function startCarry(item, client) {
    const object = item.object;
    const fromBox = !isOutOfBox(cosmetic, item.key);
    scene.attach(object);
    carry = {
      item,
      cleared: !fromBox,
      rimY: dims.height + item.halfD + 4,
      start: { position: object.position.clone(), quaternion: object.quaternion.clone() },
      yawDeg: fromBox ? item.home.rotYDeg : spotOf(item).rotYDeg,
      client: { ...client },
      last: object.position.clone(),
      lean: { x: 0, z: 0 },
    };
    canvas.style.cursor = 'grabbing';
    ui.setHint('Let go to set it down.');
    audio.play('item-lift');
    // Near the floor its shadow shows where it will land.
    setCastShadow(object, true);
    if (fromBox) frameTable();
    // Whatever lay on it comes down.
    settleStacks();
    const target = object.position.clone();
    const flat = new Quaternion();
    const lean = new Quaternion();
    const euler = new Euler();
    stopCarry = stage.addTicker((now, dt) => {
      const step = Math.max(1, dt || 16);
      const k = instant() ? 1 : 1 - Math.exp(-step / CARRY_FOLLOW_MS);
      if (!carry.cleared) {
        target.set(carry.start.position.x, carry.rimY + 2, carry.start.position.z);
        object.position.lerp(target, k);
        if (object.position.y >= carry.rimY - 1) carry.cleared = true;
        return;
      }
      const height = item.base() + CARRY_LIFT_MM;
      const point = pointerAt(carry.client, height);
      if (point) {
        const spot = clampToTable({ x: point.x, z: point.z, rotYDeg: carry.yawDeg }, item.halfW, item.halfD);
        // Over the box it is lifted clear of the walls.
        const overBox = clearOfBox(spot, boxClearance(item), boxRect) !== spot;
        target.set(spot.x, overBox ? dims.height + item.base() + 14 : height, spot.z);
      }
      object.position.lerp(target, k);
      const vx = (object.position.x - carry.last.x) / step;
      const vz = (object.position.z - carry.last.z) / step;
      carry.last.copy(object.position);
      carry.lean.x += (clampLean(-vz * 30) - carry.lean.x) * k;
      carry.lean.z += (clampLean(vx * 30) - carry.lean.z) * k;
      lean.setFromEuler(euler.set(carry.lean.x * DEG, 0, carry.lean.z * DEG));
      flat.copy(qFlat(carry.yawDeg, item.faceUp())).premultiply(lean);
      object.quaternion.slerp(flat, k);
    });
  }

  /** Let go: the carried thing settles where it is, or back into the box if it never left it. */
  function dropCarry() {
    const { item, cleared, start, yawDeg } = carry;
    stopCarry?.();
    stopCarry = null;
    carry = null;
    canvas.style.cursor = 'default';
    const object = item.object;
    if (!cleared) {
      return run(async () => {
        await flyTo(object, start, { durationMs: 220, lift: 0 });
        boxModel.group.add(object);
        const slot = item.slot();
        object.position.set(slot.x, slot.y, slot.z);
        object.quaternion.setFromEuler(new Euler(slot.rotX, 0, 0));
      });
    }
    const spot = setDownSpot(item, { x: object.position.x, z: object.position.z, rotYDeg: yawDeg });
    recordSpot(item, spot);
    return run(async () => {
      await flyTo(object, restPose(item, spot), { durationMs: 240, lift: 3 });
      audio.play(item.sound);
    });
  }

  function packScreenWidth(pack) {
    pack.group.updateMatrixWorld();
    const left = stage.toClient(pack.group.localToWorld(new Vector3(-33, 50, 0)));
    const right = stage.toClient(pack.group.localToWorld(new Vector3(33, 50, 0)));
    return Math.max(40, Math.hypot(right.x - left.x, right.y - left.y));
  }

  const onKeyDown = (event) => {
    if (event.target?.closest?.('input, textarea, select')) return;
    if (event.key === ' ' || event.key === 'Enter') {
      if (event.target?.closest?.('button')) return;
      event.preventDefault();
      audio.unlock();
      doNext();
    } else if (event.key === 'Escape' && hand?.kind === 'inspect') run(putBack);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  host.tabIndex = -1;
  host.addEventListener('keydown', onKeyDown);
  const offResize = stage.onResize(() => {
    if (busy || hand || carry) return;
    stage.applyCamera(cameraPose(framingFor(view()), aspect()));
  });

  // A reload mid-pack: the cards in hand show their faces before the loading screen lifts (a front
  // card showing its back reads as a card held the wrong way round). Bounded by a slow host.
  const handFacesReady = () => {
    if (hand?.kind !== 'stack') return Promise.resolve();
    const showing = hand.items.slice(hand.position, hand.position + 2).filter((item) => item.url);
    return Promise.race([
      Promise.all(showing.map((item) => faceTexture(item.url, item.card))),
      wait(HAND_FACE_WAIT_MS),
    ]);
  };

  // ── Start ───────────────────────────────────────────────────────────────
  await warmShaders();
  if (stopped()) return abandon();
  settle();
  warmShadows();
  // The floor's mirror draws the scene again with shaders of its own: those compile in a task of
  // their own, so images that arrive meanwhile are taken in between (software WebGL compiles block).
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (stopped()) return abandon();
  stage.renderReflection();
  await handFacesReady();
  if (stopped()) return abandon();
  const surfaceReady = stage.setSurface(surface);
  await surfaceReady;
  if (stopped()) return abandon();
  ui.setLoading(false);
  stage.requestRender();
  host.focus({ preventScroll: true });

  const api = {
    get busy() {
      return busy;
    },
    get hand() {
      return hand?.kind || null;
    },
    /** The held stack for checks (rec-tabletop): its pack, the front card's index, every item's id. */
    get held() {
      if (hand?.kind !== 'stack') return null;
      return {
        logical: hand.logical,
        position: hand.position,
        ids: hand.items.map((item) => (item.kind === 'card' ? item.card?.id || null : item.kind)),
      };
    },
    view,
    /**
     * Where a movable thing is, for checks that drive it with a real pointer: a client point on it
     * (near its top end, which shows over the box's walls), whether it is still in the box, and the
     * spot it was set down at.
     */
    whereIs: (key) => {
      const item = [deckItem, leafletItem, promoItem, ...packItems].find((entry) => entry.key === key);
      if (!item) return null;
      item.object.updateMatrixWorld();
      const point = stage.toClient(item.object.localToWorld(new Vector3(0, item.halfD * 0.72, 0)));
      return { point, inBox: !isOutOfBox(cosmetic, key), spot: cosmetic.spots[key] || null };
    },
    /** On a manual clock (the bench's `?film`): moves the scene on by `ms` and draws it. */
    advance: (ms) => stage.advance(ms),
    doNext: () => doNext(),
    skip: () => onUiAction('skip'),
    revealAll: () => onUiAction('revealAll'),
    settle,
  };
  host.tabletop = api;

  return {
    api,
    unmount: () => {
      if (disposed) return;
      offResize();
      stopHandSway();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      host.removeEventListener('keydown', onKeyDown);
      teardown();
    },
  };
}

