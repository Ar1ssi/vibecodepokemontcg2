import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { CARD, LEAFLET, deckThickness } from '../../../../setup/deck-builder/core/build-battle/tabletop/physical.mjs';
import { createFaceMaterial } from './tt-card.js';
import { createFilmMaterials } from './tt-film.js';
import { cardSlab } from './tt-geometry.js';
import { drawCodeCardBack, drawCodeCardFront, drawLeafletCover } from './tt-print.js';
import { EYE_ONLY_LAYER } from './tt-studio.js';
import { makeCanvas } from './tt-textures.js';

/**
 * The smaller things in the box (design 073): the deck in its cellophane with the promo as its
 * bottom card, the code card, the folded tips leaflet, and the soft contact shadows that ground
 * flat things on the mat.
 */

function canvasTextureOf(width, height, draw, renderer) {
  const canvas = makeCanvas(width, height);
  draw(canvas.getContext('2d'), width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

/**
 * The deck: a stack of `count` cards (the front face is the bottom card — the promo — the back
 * face the top card's back) inside a clear wrap.
 *
 * @returns {{group: Group, stack: Mesh, wrap: {group: Group, uniforms: object}, face: object,
 *   thickness: number, dispose: () => void}}
 */
export function buildDeck({ envMap, count, promoMap, promoFinish, backMap, edgeTexture, crinkle }) {
  const thickness = deckThickness(count);
  const geometry = cardSlab(CARD.width, CARD.height, thickness, CARD.cornerRadius, 6);
  const face = createFaceMaterial({ map: promoMap, envMap, finish: promoFinish });
  const back = new MeshPhysicalMaterial({
    map: backMap,
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    envMap,
    envMapIntensity: 0.8,
    alphaTest: 0.5,
  });
  const edge = new MeshStandardMaterial({ map: edgeTexture, roughness: 0.8, envMap, envMapIntensity: 0.4 });
  const stack = new Mesh(geometry, [face, back, edge]);
  stack.castShadow = true;
  stack.receiveShadow = true;
  stack.name = 'tt-deck-stack';

  const pad = 0.45;
  const wrapGeometry = new BoxGeometry(CARD.width + 2 * pad, CARD.height + 2 * pad, thickness + 2 * pad, 6, 8, 2);
  // A deck's cellophane is thinner and tighter than the box's wrap: a glint, not a veil.
  const film = createFilmMaterials({ envMap, crinkle, envIntensity: 0.55, haze: 0.035 });
  const haze = new Mesh(wrapGeometry, film.haze);
  haze.renderOrder = 4;
  const gloss = new Mesh(wrapGeometry, film.gloss);
  gloss.renderOrder = 5;
  const wrapGroup = new Group();
  wrapGroup.name = 'tt-deck-wrap';
  wrapGroup.add(haze, gloss);

  const group = new Group();
  group.name = 'tt-deck';
  group.add(stack, wrapGroup);
  return {
    group,
    stack,
    face,
    wrap: { group: wrapGroup, uniforms: film.uniforms, meshes: [haze, gloss] },
    thickness,
    dispose: () => {
      geometry.dispose();
      wrapGeometry.dispose();
      face.dispose();
      back.dispose();
      edge.dispose();
      film.dispose();
    },
  };
}

/** A code card (box or pack): the printed front and back on a card slab. */
export function buildCodeCard({ renderer, envMap, kit, live, game }) {
  const front = canvasTextureOf(512, 715, (ctx, w, h) => drawCodeCardFront(ctx, w, h, { game, live }), renderer);
  const backTexture = canvasTextureOf(512, 715, (ctx, w, h) => drawCodeCardBack(ctx, w, h, { live }), renderer);
  const mesh = kit.makeCard({ map: front, name: 'tt-code-card' });
  const backMaterial = new MeshPhysicalMaterial({
    map: backTexture,
    roughness: 0.5,
    clearcoat: 0.3,
    envMap,
    envMapIntensity: 0.6,
  });
  mesh.material = [mesh.material[0], backMaterial, mesh.material[2]];
  mesh.userData.face.roughness = 0.5;
  return {
    mesh,
    dispose: () => {
      front.dispose();
      backTexture.dispose();
      backMaterial.dispose();
      mesh.userData.face.dispose();
    },
  };
}

/** The tips leaflet, folded to a 85 × 112 mm panel. */
export function buildLeaflet({ renderer, envMap, title, deckRows, palette, heading }) {
  const cover = canvasTextureOf(
    680,
    896,
    (ctx, w, h) => drawLeafletCover(ctx, w, h, { title, deckRows, palette, heading }),
    renderer
  );
  const geometry = cardSlab(LEAFLET.width, LEAFLET.height, LEAFLET.thickness, 0.8, 2);
  const face = new MeshStandardMaterial({ map: cover, roughness: 0.82, envMap, envMapIntensity: 0.5 });
  const back = new MeshStandardMaterial({ color: new Color(0xf1efe8), roughness: 0.85, envMap, envMapIntensity: 0.5 });
  const edge = new MeshStandardMaterial({ color: new Color(0xe9e6dc), roughness: 0.9 });
  const mesh = new Mesh(geometry, [face, back, edge]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'tt-leaflet';
  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      cover.dispose();
      face.dispose();
      back.dispose();
      edge.dispose();
    },
  };
}

/**
 * A soft dark plate under a flat object (`width` × `depth` mm, grown by `spread`), laid on the
 * mat; its texture is the shared radial blob.
 */
export function contactShadow({ texture, width, depth, spread = 10, opacity = 0.5 }) {
  const material = new MeshStandardMaterial({
    // A cool dark, as the studio's white floor shades: a neutral black reads as dirt on it.
    color: 0x1a2440,
    alphaMap: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    roughness: 1,
  });
  const mesh = new Mesh(new PlaneGeometry(width + spread * 2, depth + spread * 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.15;
  mesh.renderOrder = 1;
  mesh.name = 'tt-contact';
  // It darkens the floor; the floor's mirror shows the thing above it, not this.
  mesh.layers.set(EYE_ONLY_LAYER);
  return {
    mesh,
    setOpacity: (value) => {
      material.opacity = value;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
