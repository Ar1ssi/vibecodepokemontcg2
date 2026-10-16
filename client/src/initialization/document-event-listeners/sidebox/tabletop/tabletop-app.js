import { CanvasTexture, Euler, Group, Plane, Quaternion, SRGBColorSpace, Vector3 } from 'three';
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
  logicalOfVisual,
  nextStep,
  parseCosmetic,
  reconcileCosmetic,
  tableView,
  tearPackAction,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/flow.mjs';
import {
  BOX_SPOT,
  CODE_SPOT,
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
  CARD,
  LEAFLET,
  boxDimensions,
  contentsFor,
  contentsWords,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import {
  LID_OPEN_AT,
  LID_OPEN_DEG,
  arcPoint,
  deckWrapPose,
  dragProgress,
  easeInOutCubic,
  easeOutCubic,
  handSway,
  lidAngleDeg,
  slideOffPose,
  smoothstep,
  stackPullPose,
  wrapPeelPose,
} from '../../../../setup/deck-builder/core/build-battle/tabletop/poses.mjs';
import { createTabletopAudio } from './tt-audio.js';
import { buildBox, interiorSlots, prepareBoxFaces } from './tt-box.js';
import { createCardKit, disposeCard } from './tt-card.js';
import { resetFilm } from './tt-film.js';
import { buildCodeCard, buildDeck, buildLeaflet, contactShadow } from './tt-objects.js';
import { createPackKit } from './tt-pack.js';
import { drawProceduralWrapper, loadPrintFont, paletteFor } from './tt-print.js';
import { createStage } from './tt-stage.js';
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
 * The tabletop opening (design 073): one three.js scene of a desk with a Build & Battle box on
 * it. Every physical beat is played here — the shrink-wrap torn off, the lid lifted, the deck,
 * leaflet, code card and packs taken out, the deck's cellophane and its promo, each pack picked
 * up, torn across its crimp, its cards drawn out and passed one by one onto the mat, then fanned
 * and piled. The saved `session.unboxing` reducer is the only record that counts (`dispatch`);
 * which pack was torn first and whether the contents were taken out are a small cosmetic record.
 * A reload re-lays the table for the saved state (`settle`).
 */

const DEG = Math.PI / 180;
const CARD_TEXTURE_TIMEOUT_MS = 9000;
const STACK_STEP = CARD.thickness + 0.04;

const qFlat = (yawDeg, faceUp = true) =>
  new Quaternion().setFromEuler(new Euler(faceUp ? -Math.PI / 2 : Math.PI / 2, yawDeg * DEG, 0, 'YXZ'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HAND_FACE_WAIT_MS = 6000;

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
    surface = { kind: 'mat' },
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

  const codeTextures = buildCodeCard({
    renderer,
    envMap,
    kit,
    live: contents.codeCard === 'live',
    game: look?.labels?.codeCardGame || (contents.codeCard === 'live' ? 'Pokémon TCG Live' : 'Pokémon TCG Online'),
  });
  keep(codeTextures);
  const boxCode = codeTextures.mesh;
  boxCode.userData.tt = { kind: 'tableCard' };
  const leaflet = buildLeaflet({
    renderer,
    envMap,
    title: box?.name || '',
    deckRows,
    palette,
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
      if (item.kind === 'code') {
        return { ...item, url: null, card: null, finish: null, isCode: true };
      }
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
    if (item.isCode) {
      const mesh = kit.makeCard({ map: boxCode.userData.face.map, name: 'tt-pack-code' });
      mesh.material = [mesh.material[0], boxCode.material[1], mesh.material[2]];
      mesh.userData.ownFace = true;
      return trackLoose(mesh);
    }
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

  const deckOnTable = (faceUp) => {
    deck.wrap.group.visible = faceUp;
    place(deck.group, flatPose(DECK_SPOT, deck.thickness / 2 + 0.5, faceUp));
  };

  const pileHeight = (count) => 0.2 + count * STACK_STEP;

  function settle() {
    stage.finishAll();
    stopHandSway();
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
    stage.applyCamera(cameraPose(v.lidOpen ? (v.itemsOut ? 'table' : 'open') : 'box', aspect()));
    boxModel.setLidAngle(v.lidOpen ? LID_OPEN_DEG : 0);
    if (v.wrapOn) {
      resetFilm(boxModel.film.uniforms);
      wrapShadow.mesh.visible = false;
    } else {
      crumpledFilm(boxModel.film.uniforms, boxModel.group, wrapBall.center);
      wrapShadow.mesh.visible = true;
    }

    if (!v.itemsOut) {
      putInBox(deck.group, slots.deck);
      deck.wrap.group.visible = true;
      resetFilm(deck.wrap.uniforms);
      putInBox(leaflet.mesh, slots.leaflet);
      putInBox(boxCode, slots.code);
      packObjects.forEach((pack, visual) => putInBox(pack.model.group, slots.packs[visual]));
      promoCard.visible = false;
    } else {
      place(leaflet.mesh, flatPose(LEAFLET_SPOT, LEAFLET.thickness / 2));
      place(boxCode, flatPose(CODE_SPOT, CARD.thickness / 2));
      if (v.deckUnwrapped) {
        deckOnTable(false);
        deck.face.map = backTexture;
        deck.face.userData.setFinish(null);
        promoCard.visible = true;
        place(promoCard, flatPose(PROMO_SPOT, CARD.thickness / 2 + 0.1));
      } else {
        deckOnTable(true);
        resetFilm(deck.wrap.uniforms);
        promoCard.visible = false;
      }
      v.untornVisual.forEach((visual) => {
        place(packObjects[visual].model.group, packOnTable(visual));
      });
      v.tornVisual.forEach((visual, logical) => layTornPack(visual, logical, u, v));
    }
    refreshUi();
  }

  const packOnTable = (visual) => flatPose(packRowSpot(visual, packCount), 3.6);

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
        const spot = packRowSpot(visual, packCount);
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
    try {
      await renderer.compileAsync(warm, camera, scene);
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
  async function tearWrap(hitWorld = null) {
    const uniforms = boxModel.film.uniforms;
    const group = boxModel.group;
    const grab = hitWorld
      ? group.worldToLocal(hitWorld.clone())
      : new Vector3(dims.width * 0.32, dims.height * 0.98, dims.depth / 2);
    if (!send({ type: 'tearWrap' })) return;
    audio.play('wrap-tear');
    uniforms.uTear.value.set(grab.x, grab.y, grab.z, 2);
    const start = new Vector3(0, dims.height + 30, 0);
    const end = group.worldToLocal(wrapBall.center.clone());
    let crumpleSounded = false;
    await stage.animate({
      durationMs: 1700,
      update: (t) => {
        const pose = wrapPeelPose(t);
        uniforms.uTear.value.w = 2 + pose.open * 60;
        uniforms.uLoosen.value = pose.lift;
        uniforms.uCrumple.value = pose.crumple;
        const k = easeInOutCubic(smoothstep(0.45, 1, t));
        const center = start.clone().lerp(end, k);
        center.y += Math.sin(Math.PI * k) * 40;
        uniforms.uBallCenter.value.copy(center);
        uniforms.uBallRadius.value = wrapBall.radius;
        if (!crumpleSounded && t > 0.35) {
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

  async function takeOut() {
    if (view().itemsOut) return;
    const cameraMove = stage.blendCamera(cameraPose('table', aspect()), 1800);
    const jobs = [];
    const items = [
      { object: deck.group, pose: () => flatPose(DECK_SPOT, deck.thickness / 2 + 0.5, true), sound: 'item-land' },
      { object: leaflet.mesh, pose: () => flatPose(LEAFLET_SPOT, LEAFLET.thickness / 2), sound: 'item-land' },
      { object: boxCode, pose: () => flatPose(CODE_SPOT, CARD.thickness / 2), sound: 'card-land' },
      ...packObjects.map((pack) => ({
        object: pack.model.group,
        pose: () => packOnTable(pack.visual),
        sound: 'pack-land',
      })),
    ];
    items.forEach((item, index) => jobs.push(liftOut(item, index * 360)));
    await Promise.all(jobs);
    await cameraMove;
    cosmetic = { ...cosmetic, itemsOut: true };
    saveCosmetic();
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
    await Promise.all([
      flyTo(promoCard, showcase, { durationMs: 650, lift: 10 }),
      flyTo(deck.group, flatPose(DECK_SPOT, deck.thickness / 2 + 0.2, false), { durationMs: 760, lift: 50 }),
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
    await flyTo(promoCard, flatPose(PROMO_SPOT, CARD.thickness / 2 + 0.1), { durationMs: 760, lift: 40 });
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
    await flyTo(pack.model.group, pose, { durationMs: 720, lift: 22 });
    hand = { kind: 'pack', visual, peel: 0 };
    startSway(pack.model.group, pose);
  }

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
    audio.play('pack-tear');
    await stage.animate({
      durationMs: 220,
      update: (t) => pack.model.setPeel(fromProgress + (1 - fromProgress) * easeOutCubic(t), side),
    });
    flingStrip(pack, logical, side);
    await pullCards(pack, visual, logical);
  }

  /** The torn strip flies off the pack, tumbling, and lands on the mat. */
  function flingStrip(pack, logical, side) {
    const strip = pack.model.strip;
    scene.attach(strip);
    const from = strip.position.clone();
    const fromQ = strip.quaternion.clone();
    const spot = wrapperSpot(logical);
    const rest = new Vector3(spot.x + 20 * side, 0.4 + logical * 0.3, spot.z - 50);
    const restQ = qFlat(spot.rotYDeg * 2 + 40 * side, true);
    stage.animate({
      durationMs: 900,
      update: (t) => {
        const point = arcPoint(from, rest, t, 90);
        strip.position.set(point.x, point.y, point.z);
        const spin = new Quaternion().setFromEuler(new Euler(t * 4.2 * side, t * 2.1, t * 5.5 * side));
        strip.quaternion.slerpQuaternions(fromQ.clone().multiply(spin), restQ, smoothstep(0.55, 1, t));
        // Let go of, the fold springs open into a loose curl before it lands.
        pack.model.relaxStrip(smoothstep(0.1, 0.8, t));
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
    audio.play('cards-out');
    await stage.animate({
      durationMs: 1100,
      update: (t) => {
        proxy.position.y = startY + travel * stackPullPose(t);
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
    await flyTo(pack.model.group, flatPose(spot, 1.2 + logical * 0.6, true), { durationMs: 760, lift: 30, delayMs: 120 });
    pack.model.group.scale.set(1, 1, 0.35);
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
    const spot = packRowSpot(visual, packCount);
    hand = null;
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
        return { label: 'Take everything out', run: takeOut };
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
      if (item?.kind === 'code') return 'A code card first. Swipe or tap to set it aside.';
      if (item?.kind === 'energy') return 'A Basic Energy. Keep going.';
      return 'Swipe or tap the front card to see the next one.';
    }
    if (hand?.kind === 'summary') return 'This pack’s ten cards.';
    if (hand?.kind === 'inspect') return 'Move the pointer to tilt it in the light. Tap to put it back.';
    if (v.wrapOn) return 'Grab the shrink-wrap and pull it off.';
    if (!v.lidOpen) return 'Lift the lid.';
    if (!v.itemsOut) return words.inside;
    if (!v.deckUnwrapped) return `Unwrap the ${words.deck}: its promo card is on the bottom.`;
    if (v.untornVisual.length) return `${v.untornVisual.length} pack${v.untornVisual.length === 1 ? '' : 's'} left. Pick one up.`;
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
    if (disposed) return;
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
    boxCode,
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
  const hitAt = (event) => {
    const hits = stage.pick(event.clientX, event.clientY, pickables());
    for (const hit of hits) {
      if (!hit.object.visible) continue;
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
    else if (hand?.kind === 'pack' && hit?.node === packObjects[hand.visual].model.group) press.mode = 'peel';
    else if (hand?.kind === 'stack' && hit?.tag.kind === 'handStack') press.mode = 'swipe';
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
    if (!moved || busy) return;
    press.dragged = true;
    if (press.mode === 'lid') {
      const angle = LID_OPEN_DEG * dragProgress(-dy, 220);
      press.progress = angle / LID_OPEN_DEG;
      boxModel.setLidAngle(angle);
      stage.requestRender();
    } else if (press.mode === 'peel') {
      const pack = packObjects[hand.visual].model;
      press.side = dx >= 0 ? 1 : -1;
      const width = packScreenWidth(pack);
      press.progress = dragProgress(Math.abs(dx), width);
      pack.setPeel(press.progress, press.side);
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
    } else if (press.mode === 'wrap' && Math.hypot(dx, dy) > 30) {
      const point = press.hit?.point || null;
      press = null;
      run(() => tearWrap(point));
    }
  };

  const onPointerUp = (event) => {
    const current = press;
    press = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!current || busy) return;
    if (current.dragged) {
      if (current.mode === 'lid') {
        if (current.progress >= LID_OPEN_AT) run(() => openLid(current.progress * LID_OPEN_DEG));
        else {
          const from = current.progress * LID_OPEN_DEG;
          stage.animate({ durationMs: 260, update: (t) => boxModel.setLidAngle(from * (1 - easeOutCubic(t))) });
        }
      } else if (current.mode === 'peel') {
        if (current.progress >= PACK_TORN_AT) run(() => tearHeldPack(current.progress, current.side));
        else {
          const pack = packObjects[hand.visual].model;
          const from = current.progress;
          stage.animate({ durationMs: 200, update: (t) => pack.setPeel(from * (1 - easeOutCubic(t)), current.side) });
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
    if (kind === 'box') {
      if (v.wrapOn) return run(() => tearWrap(hit.point));
      if (!v.lidOpen) return run(() => openLid());
      if (!v.itemsOut) return run(takeOut);
      return undefined;
    }
    if (!v.itemsOut && (kind === 'deck' || kind === 'pack' || kind === 'leaflet')) return run(takeOut);
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
    canvas.style.cursor = hit ? 'pointer' : 'default';
  };

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
    if (busy || hand) return;
    const v = view();
    stage.applyCamera(cameraPose(v.lidOpen ? (v.itemsOut ? 'table' : 'open') : 'box', aspect()));
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

