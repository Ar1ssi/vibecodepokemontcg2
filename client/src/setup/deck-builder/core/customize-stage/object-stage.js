// The deck box and card sleeve of TCG Live's deck customization screen (design 071), drawn in one
// three.js scene on a transparent canvas. The coin has its own stage (coin-stage.js); customize-stage.js
// lays the two canvases over each other. Lazy-loaded by customize-stage.js, the only importer of three
// on this path. Poses and layout come from stage-math.mjs; this file only owns GPU objects and fetches.
//
// scene.json is already in three's right-handed space (the importer mirrors z), so the camera sits at
// the origin looking down -z with the slots hung under a holder `distance` units ahead, tilted by
// `holder.q`, exactly as the game's RendertoTextureCamera hierarchy.
import * as THREE from 'three';
import { HIDDEN_SCALE } from './stage-math.mjs';

const ASSET_DIR = '/src/assets/deckbox/';
const DEFAULT_CARD_BACK = '/src/assets/cardback.png';
/** Light levels tuned by eye against the game's box thumbnails (white boxes stay just under clipping). */
const AMBIENT_INTENSITY = 1.8;
const KEY_INTENSITY = 1.6;
const KEY_POSITION = [-400, 900, 1200];
/** `deckbox_interior`'s `_Color` (sRGB, as authored) and the shadow planes' base size in Unity's built-in Plane. */
const INTERIOR_TINT = 0.915;
const SHADOW_PLANE_SIZE = 10;
/** What an exterior with no atlas (catalog not loaded, atlas missing) shows: a plain dark box, not a hole. */
const BOX_FALLBACK_COLOR = 0x4a5068;

const fetchJson = async (name) => {
  const response = await fetch(`${ASSET_DIR}${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
};

let assetsPromise = null;
/** Scene poses and both meshes, loaded once; a failed load is retried next time. */
const loadAssets = () => {
  assetsPromise ??= Promise.all([fetchJson('scene.json'), fetchJson('deck-box.mesh.json'), fetchJson('card.mesh.json')])
    .then(([scene, boxMesh, cardMesh]) => ({ scene, boxMesh, cardMesh }))
    .catch((error) => {
      assetsPromise = null;
      throw error;
    });
  return assetsPromise;
};

/** scene.json, shared with customize-stage.js so one fetch serves both. */
export const loadScene = async () => (await loadAssets()).scene;

const geometryOf = (mesh) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.p, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.n, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv, 2));
  geometry.setIndex(mesh.i);
  mesh.submeshes.forEach((submesh, index) => geometry.addGroup(submesh.start, submesh.count, index));
  return geometry;
};

/**
 * The card mesh's face UVs span only this window of a texture (the game's sleeve art is padded); our
 * sleeve and card-back images are full-bleed, so the texture is stretched to put its edges on the window's.
 */
const faceWindow = (mesh) => {
  const uv = mesh.submeshes[0];
  let min = Infinity;
  let max = -Infinity;
  for (let k = uv.start; k < uv.start + uv.count; k += 1) {
    const u = mesh.uv[2 * mesh.i[k]];
    min = Math.min(min, u);
    max = Math.max(max, u);
  }
  return { min, span: max - min };
};

const fitFace = (texture, { min, span }) => {
  texture.repeat.set(1 / span, 1);
  texture.offset.set(-min / span, 0);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
};

const place = (object, pose) => {
  object.position.set(...pose.p);
  object.quaternion.set(...pose.q);
  object.scale.set(...pose.s);
};

const loader = new THREE.TextureLoader();
const loadTexture = async (url) => {
  const texture = await loader.loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const staticTextures = new Map();
/**
 * The stage's fixed textures (interior, shadows, default back), decoded once for every stage: the server
 * sends no-store, so without this each show() would fetch them again. Never disposed; a failed load is
 * retried next time.
 */
const staticTexture = (url) => {
  if (!staticTextures.has(url)) {
    staticTextures.set(
      url,
      loadTexture(url).catch((error) => {
        staticTextures.delete(url);
        throw error;
      })
    );
  }
  return staticTextures.get(url);
};

/** A colour given as display (sRGB) channels in 0..1, as the game's material data and the CSS use. */
const displayColor = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

/**
 * A box-and-sleeve stage drawn into `host`. Rejects when WebGL2 is missing or the assets fail to
 * load, so the caller shows the picker alone; nothing is left in `host` then. `onLost` runs once if
 * the browser drops the context.
 *
 * @param {{ host: HTMLElement, onLost?: () => void }} options
 * @returns {Promise<{
 *   setBoxAtlas: (url: string|null) => Promise<void>,
 *   setSleeveTexture: (url: string|null) => Promise<void>,
 *   setPose: (slot: 'box'|'sleeve', pose: {p: number[], q: number[], s: number[]}, yaw?: number) => void,
 *   render: () => void, resize: () => void, dispose: () => void,
 * }>}
 */
export async function createObjectStage({ host, onLost = () => {} }) {
  // Everything that can fail on the network comes first: a rejection leaves no canvas or context behind.
  const [{ scene: layout, boxMesh, cardMesh }, interiorTexture, boxShadowTexture, cardShadowTexture, backTexture] =
    await Promise.all([
      loadAssets(),
      staticTexture(`${ASSET_DIR}interior.webp`),
      staticTexture(`${ASSET_DIR}shadow-box.webp`),
      staticTexture(`${ASSET_DIR}shadow-card.webp`),
      staticTexture(DEFAULT_CARD_BACK),
    ]);

  const canvas = document.createElement('canvas');
  canvas.className = 'customize-object-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const state = { closed: false, lost: false, boxToken: 0, sleeveToken: 0, defaultSleeve: null, owned: new Set() };
  const own = (disposable) => {
    state.owned.add(disposable);
    return disposable;
  };
  const release = () => {
    for (const disposable of state.owned) disposable.dispose();
    state.owned.clear();
    renderer.dispose();
    if (!state.lost) renderer.forceContextLoss();
    canvas.remove();
  };

  let onContextLost = null;
  let slots;
  let scene;
  let camera;
  let exterior;
  let sleeveFace;
  try {
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
    const key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
    key.position.set(...KEY_POSITION);
    scene.add(key);
    camera = new THREE.PerspectiveCamera(layout.fov, 1, 10, layout.distance * 4);
    const holder = new THREE.Group();
    holder.position.set(0, 0, -layout.distance);
    holder.quaternion.set(...layout.holder.q);
    scene.add(holder);

    const shadowOf = (texture, slotLayout) => {
      const plane = own(new THREE.PlaneGeometry(SHADOW_PLANE_SIZE, SHADOW_PLANE_SIZE));
      plane.rotateX(-Math.PI / 2);
      const [r, g, b, a] = slotLayout.shadow.tint;
      const material = own(
        new THREE.MeshBasicMaterial({ map: texture, color: displayColor(r, g, b), opacity: a, transparent: true, depthWrite: false, side: THREE.DoubleSide })
      );
      const mesh = new THREE.Mesh(plane, material);
      mesh.renderOrder = -1;
      place(mesh, slotLayout.shadow);
      return mesh;
    };

    exterior = own(new THREE.MeshLambertMaterial({ color: BOX_FALLBACK_COLOR }));
    const interior = own(new THREE.MeshLambertMaterial({ color: displayColor(INTERIOR_TINT, INTERIOR_TINT, INTERIOR_TINT), map: interiorTexture }));
    sleeveFace = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    state.face = faceWindow(cardMesh);
    const cardBackMap = own(fitFace(backTexture.clone(), state.face));
    cardBackMap.needsUpdate = true;
    const cardBack = own(new THREE.MeshBasicMaterial({ color: 0xffffff, map: cardBackMap }));
    state.defaultSleeve = own(fitFace(backTexture.clone(), state.face));
    state.defaultSleeve.needsUpdate = true;
    sleeveFace.map = state.defaultSleeve;

    slots = { box: new THREE.Group(), sleeve: new THREE.Group() };
    const boxMeshObject = new THREE.Mesh(own(geometryOf(boxMesh)), [exterior, interior]);
    place(boxMeshObject, layout.slots.box.mesh);
    slots.box.add(boxMeshObject, shadowOf(boxShadowTexture, layout.slots.box));
    const cardMeshObject = new THREE.Mesh(own(geometryOf(cardMesh)), [sleeveFace, cardBack, cardBack]);
    place(cardMeshObject, layout.slots.sleeve.mesh);
    slots.sleeve.add(cardMeshObject, shadowOf(cardShadowTexture, layout.slots.sleeve));
    holder.add(slots.box, slots.sleeve);

    onContextLost = (event) => {
      event.preventDefault();
      state.lost = true;
      onLost();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    host.append(canvas);
  } catch (error) {
    release();
    throw error;
  }

  const yawAxis = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const setPose = (slot, pose, yaw = 0) => {
    const group = slots[slot];
    if (!group) return;
    yawAxis.setFromAxisAngle(up, Number.isFinite(yaw) ? yaw : 0);
    group.position.set(...pose.p);
    group.quaternion.set(...pose.q).premultiply(yawAxis);
    group.scale.set(...pose.s);
    group.visible = pose.s[0] > HIDDEN_SCALE * 10;
  };

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth || host.clientWidth);
    const height = Math.max(1, canvas.clientHeight || host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  /**
   * Swaps `material.map` to `url` once it loads, or to `fallback` (null = none, shown as
   * `fallbackColor`) for no url or a load that fails. A newer request for the same slot wins.
   * `fallback` is owned by the stage and never disposed here.
   */
  const swapMap = async (material, url, tokenKey, fallback, fallbackColor) => {
    state[tokenKey] += 1;
    const token = state[tokenKey];
    const show = (map) => {
      if (material.map && material.map !== fallback && material.map !== map) {
        state.owned.delete(material.map);
        material.map.dispose();
      }
      material.map = map;
      material.color.set(map ? 0xffffff : fallbackColor);
      material.needsUpdate = true;
    };
    if (!url) {
      show(fallback);
      return;
    }
    let texture;
    try {
      texture = await loadTexture(url);
    } catch (error) {
      if (!state.closed && state[tokenKey] === token) show(fallback);
      throw error;
    }
    if (state.closed || state[tokenKey] !== token) {
      texture.dispose();
      return;
    }
    fitFace(texture, state.face);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    state.owned.add(texture);
    show(texture);
  };

  const setBoxAtlas = (url) => swapMap(exterior, url, 'boxToken', null, BOX_FALLBACK_COLOR);
  const setSleeveTexture = (url) => swapMap(sleeveFace, url, 'sleeveToken', state.defaultSleeve, 0xffffff);

  const render = () => {
    if (state.closed || state.lost) return;
    renderer.render(scene, camera);
  };

  const dispose = () => {
    if (state.closed) return;
    state.closed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    release();
  };

  return { setBoxAtlas, setSleeveTexture, setPose, render, resize, dispose };
}
