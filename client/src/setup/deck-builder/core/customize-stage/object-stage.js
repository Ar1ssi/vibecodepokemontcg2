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
/** The game's two lights, in three's physical units (intensity x pi of the legacy values the web port used). */
const AMBIENT_INTENSITY = 1.8;
const KEY_INTENSITY = 1.6;
const KEY_POSITION = [-400, 900, 1200];
/** `deckbox_interior`'s `_Color` and the shadow planes' base size in Unity's built-in Plane. */
const INTERIOR_TINT = 0.915;
const SHADOW_PLANE_SIZE = 10;

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

const geometryOf = (mesh) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.p, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.n, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv, 2));
  geometry.setIndex(mesh.i);
  mesh.submeshes.forEach((submesh, index) => geometry.addGroup(submesh.start, submesh.count, index));
  return geometry;
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

/**
 * A box-and-sleeve stage drawn into `host`. Rejects when WebGL2 is missing or the assets fail to
 * load, so the caller shows the picker alone. `onLost` runs once if the browser drops the context.
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
  const { scene: layout, boxMesh, cardMesh } = await loadAssets();
  const canvas = document.createElement('canvas');
  canvas.className = 'customize-object-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  host.append(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
  key.position.set(...KEY_POSITION);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(layout.fov, 1, 10, layout.distance * 4);
  const holder = new THREE.Group();
  holder.position.set(0, 0, -layout.distance);
  holder.quaternion.set(...layout.holder.q);
  scene.add(holder);

  const state = { closed: false, lost: false, boxToken: 0, sleeveToken: 0, defaultSleeve: null, owned: new Set() };
  const own = (disposable) => {
    state.owned.add(disposable);
    return disposable;
  };

  const shadowOf = (texture, slotLayout) => {
    const plane = own(new THREE.PlaneGeometry(SHADOW_PLANE_SIZE, SHADOW_PLANE_SIZE));
    plane.rotateX(-Math.PI / 2);
    const [r, g, b, a] = slotLayout.shadow.tint;
    const material = own(
      new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(r, g, b), opacity: a, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    const mesh = new THREE.Mesh(plane, material);
    mesh.renderOrder = -1;
    place(mesh, slotLayout.shadow);
    return mesh;
  };

  const exterior = own(new THREE.MeshLambertMaterial({ color: 0x000000 }));
  const interior = own(new THREE.MeshLambertMaterial({ color: new THREE.Color(INTERIOR_TINT, INTERIOR_TINT, INTERIOR_TINT) }));
  const sleeveFace = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const cardBack = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));

  const slots = {
    box: new THREE.Group(),
    sleeve: new THREE.Group(),
  };
  const boxMeshObject = new THREE.Mesh(own(geometryOf(boxMesh)), [exterior, interior]);
  place(boxMeshObject, layout.slots.box.mesh);
  slots.box.add(boxMeshObject);
  const cardMeshObject = new THREE.Mesh(own(geometryOf(cardMesh)), [sleeveFace, cardBack, cardBack]);
  place(cardMeshObject, layout.slots.sleeve.mesh);
  slots.sleeve.add(cardMeshObject);
  holder.add(slots.box, slots.sleeve);

  const yawAxis = new THREE.Quaternion();
  const setPose = (slot, pose, yaw = 0) => {
    const group = slots[slot];
    if (!group) return;
    yawAxis.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number.isFinite(yaw) ? yaw : 0);
    group.position.set(...pose.p);
    group.quaternion.set(...pose.q).premultiply(yawAxis);
    group.scale.set(...pose.s);
    group.visible = pose.s[0] > HIDDEN_SCALE * 10;
  };

  const onContextLost = (event) => {
    event.preventDefault();
    state.lost = true;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth || host.clientWidth);
    const height = Math.max(1, canvas.clientHeight || host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  /**
   * Swaps `material.map` to `url` once it loads, or back to `fallback` (null = black) for no url or a
   * load that fails. A newer request for the same slot wins. `fallback` is never disposed here.
   */
  const swapMap = async (material, url, tokenKey, fallback) => {
    state[tokenKey] += 1;
    const token = state[tokenKey];
    const show = (map) => {
      if (material.map && material.map !== fallback && material.map !== map) material.map.dispose();
      material.map = map;
      material.color.set(map ? 0xffffff : 0x000000);
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
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    show(texture);
  };

  const ready = Promise.all([
    loadTexture(`${ASSET_DIR}interior.webp`),
    loadTexture(`${ASSET_DIR}shadow-box.webp`),
    loadTexture(`${ASSET_DIR}shadow-card.webp`),
    loadTexture(DEFAULT_CARD_BACK),
  ]).then(([interiorTexture, boxShadowTexture, cardShadowTexture, backTexture]) => {
    if (state.closed) {
      for (const texture of [interiorTexture, boxShadowTexture, cardShadowTexture, backTexture]) texture.dispose();
      return;
    }
    interior.map = own(interiorTexture);
    interior.needsUpdate = true;
    cardBack.map = own(backTexture);
    cardBack.needsUpdate = true;
    state.defaultSleeve = own(backTexture.clone());
    state.defaultSleeve.needsUpdate = true;
    if (!sleeveFace.map) sleeveFace.map = state.defaultSleeve;
    slots.box.add(shadowOf(own(boxShadowTexture), layout.slots.box));
    slots.sleeve.add(shadowOf(own(cardShadowTexture), layout.slots.sleeve));
  });
  await ready;

  const setBoxAtlas = (url) => swapMap(exterior, url, 'boxToken', null);
  const setSleeveTexture = (url) => swapMap(sleeveFace, url, 'sleeveToken', state.defaultSleeve);

  const render = () => {
    if (state.closed || state.lost) return;
    renderer.render(scene, camera);
  };

  const dispose = () => {
    if (state.closed) return;
    state.closed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const disposable of state.owned) disposable.dispose();
    for (const material of [exterior, interior, sleeveFace, cardBack]) material.map?.dispose();
    state.owned.clear();
    renderer.dispose();
    if (!state.lost) renderer.forceContextLoss();
    canvas.remove();
  };

  return { setBoxAtlas, setSleeveTexture, setPose, render, resize, dispose };
}
