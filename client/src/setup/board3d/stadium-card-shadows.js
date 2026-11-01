// Cards on a Stadium: their shadows on its ground. Where a Stadium board shows, the table's cloth is
// cut away (table-mesh.js setCutout), and with it the surface that took the cards' shadows. Two
// meshes put them back, both only where the Stadium shows and both multiplied onto its ground in
// the Stadium's own shadow tint (its kit mood's, stadium-environment-mesh.js lighting()), as the
// Stadium's props darken it:
// - a catcher over the table takes the shadows cards and piles cast in the key light (aimed along
//   the Stadium's sun, table-mesh.js setSun): a lifted card's, a pile's;
// - a soft contact shadow under every card and pile resting on the table grounds it, a little off
//   toward the side away from the sun.
// Lives in the TABLE frame (x right, y far, z up, px). `three` is the namespace from
// `import('three')`; this module never imports it statically.

/** Most contact shadows drawn at once (cards and piles on the table). */
export const MAX_CONTACTS = 192;
/** How far a contact shadow reaches past its card's edge, as a share of the card's width. */
export const CONTACT_MARGIN = 0.16;
/** How far toward the side away from the sun a contact shadow sits, as a share of the card's width. */
export const CONTACT_SHIFT = 0.035;
/** Heights (table px) of the catcher and the contact shadows: over the cloth, under any card's face. */
const CATCHER_Z = 0.2;
const CONTACT_Z = 0.3;
/** Share of the Stadium's shadow strength each takes. */
const CATCHER_STRENGTH = 0.8;
const CONTACT_STRENGTH = 0.55;

/** Linear → sRGB for one channel (the contact shadows draw straight to the sRGB canvas). */
const toSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/**
 * Where each contact shadow sits: per card or pile `{ x, y, yawDeg, widthPx, heightPx }` (flat
 * table px), its middle shifted away from the sun (`sun`, toward it) by CONTACT_SHIFT of its width,
 * its quad grown by CONTACT_MARGIN of its width each way. The first MAX_CONTACTS; bad entries skipped.
 * @returns {{ x: number, y: number, yaw: number, w: number, h: number, cardW: number, cardH: number }[]}
 */
export function contactPlacements(footprints, sun) {
  const flat = Math.hypot(sun?.[0] ?? 0, sun?.[1] ?? 0);
  const away = flat > 1e-6 ? [-sun[0] / flat, -sun[1] / flat] : [0, 0];
  const out = [];
  for (const f of footprints ?? []) {
    if (out.length >= MAX_CONTACTS) break;
    if (!f || ![f.x, f.y, f.widthPx, f.heightPx].every(Number.isFinite) || !(f.widthPx > 0 && f.heightPx > 0)) continue;
    const shift = CONTACT_SHIFT * f.widthPx;
    const margin = CONTACT_MARGIN * f.widthPx;
    out.push({
      x: f.x + away[0] * shift,
      y: f.y + away[1] * shift,
      yaw: -((Number.isFinite(f.yawDeg) ? f.yawDeg : 0) * Math.PI) / 180,
      w: f.widthPx + 2 * margin,
      h: f.heightPx + 2 * margin,
      cardW: f.widthPx,
      cardH: f.heightPx,
    });
  }
  return out;
}

const CONTACT_VERTEX = /* glsl */ `
uniform mat4 uTableFromWorld;
attribute vec2 aCard;
varying vec2 vLocal;
varying vec2 vCard;
varying vec2 vTablePos;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vTablePos = (uTableFromWorld * world).xy;
  vCard = aCard;
  // px from the card's middle along its own axes (the quad is the card grown by its margin).
  vLocal = position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** The contact shadow: dark at the card's edge, fading out over its margin; only where the Stadium shows. */
const contactFragment = (cutoutGlsl) => /* glsl */ `
${cutoutGlsl}
uniform vec3 uShadowTint;
uniform float uShadowStrength;
varying vec2 vLocal;
varying vec2 vCard;
varying vec2 vTablePos;
void main() {
  if (environmentShown(vTablePos) < 0.5) discard;
  vec2 halfSize = vCard * 0.5;
  float corner = 0.06 * vCard.x;
  vec2 q = abs(vLocal) - (halfSize - corner);
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  float reach = ${CONTACT_MARGIN.toFixed(3)} * vCard.x;
  float a = (1.0 - smoothstep(-0.15 * reach, reach, outside)) * uShadowStrength;
  a *= a > 0.004 ? 1.0 : 0.0;
  // Premultiplied for MultiplyBlending: the ground ends up times mix(1, tint, a).
  gl_FragColor = vec4(uShadowTint * a, a);
}
`;

/**
 * @param {{ three: typeof import('three'), parent: import('three').Object3D,
 *   cutout: { glsl: string, uniforms: object } }} deps
 *   `parent` is the table frame; `cutout` the Stadium environment's (stadium-environment-mesh.js).
 * @returns {{ setBounds: (bounds: { x: number, y: number, w: number, h: number }|null) => void,
 *   update: (state: { lighting: { sun: number[], shadow: number[] }|null, footprints: object[] }) => boolean,
 *   meshes: () => import('three').Object3D[], contactCount: () => number, dispose: () => void }}
 *   `update` shows both for a Stadium's `lighting` (null hides them) and lays a contact shadow under
 *   each footprint; it answers whether anything shows.
 */
export function createStadiumCardShadows({ three, parent, cutout }) {
  const group = new three.Group();
  group.name = 'board3d-stadium-card-shadows';
  parent.add(group);

  const catcherMaterial = new three.ShadowMaterial({
    color: 0x000000,
    opacity: 0,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    premultipliedAlpha: true,
    blending: three.MultiplyBlending,
  });
  // Only where the Stadium shows: elsewhere the cloth is drawn and takes the shadows itself.
  catcherMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cutout.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uTableFromWorld;\nvarying vec2 vTablePos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvTablePos = (uTableFromWorld * modelMatrix * vec4(transformed, 1.0)).xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vTablePos;\n${cutout.glsl}`)
      .replace('void main() {', 'void main() {\n\tif (environmentShown(vTablePos) < 0.5) discard;');
  };
  catcherMaterial.customProgramCacheKey = () => 'stadium-card-shadow-catcher';
  const catcher = new three.Mesh(new three.PlaneGeometry(1, 1), catcherMaterial);
  catcher.name = 'board3d-stadium-shadow-catcher';
  catcher.receiveShadow = true;
  catcher.visible = false;
  catcher.renderOrder = 1;
  group.add(catcher);

  const contactMaterial = new three.ShaderMaterial({
    vertexShader: CONTACT_VERTEX,
    fragmentShader: contactFragment(cutout.glsl),
    uniforms: {
      ...cutout.uniforms,
      uShadowTint: { value: new three.Vector3(1, 1, 1) },
      uShadowStrength: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: three.MultiplyBlending,
  });
  const contactGeometry = new three.PlaneGeometry(1, 1);
  const cards = new three.InstancedBufferAttribute(new Float32Array(MAX_CONTACTS * 2), 2);
  cards.setUsage(three.DynamicDrawUsage);
  contactGeometry.setAttribute('aCard', cards);
  const contacts = new three.InstancedMesh(contactGeometry, contactMaterial, MAX_CONTACTS);
  contacts.name = 'board3d-stadium-contact-shadows';
  contacts.instanceMatrix.setUsage(three.DynamicDrawUsage);
  contacts.count = 0;
  contacts.frustumCulled = false;
  contacts.visible = false;
  contacts.renderOrder = 1;
  group.add(contacts);

  const matrix = new three.Matrix4();
  const position = new three.Vector3();
  const turn = new three.Quaternion();
  const zAxis = new three.Vector3(0, 0, 1);
  const scale = new three.Vector3();
  let disposed = false;

  const setBounds = (bounds) => {
    if (disposed) return;
    if (!bounds || !(bounds.w > 0 && bounds.h > 0)) {
      catcher.scale.set(1, 1, 1);
      return;
    }
    // A little past the table: a lifted card's shadow can fall just off its edge.
    catcher.scale.set(bounds.w * 1.2, bounds.h * 1.2, 1);
    catcher.position.set(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, CATCHER_Z);
  };

  const update = ({ lighting, footprints } = {}) => {
    if (disposed) return false;
    const shadow = lighting?.shadow;
    const valid = Array.isArray(shadow) && shadow.length >= 4 && shadow.every(Number.isFinite) && Array.isArray(lighting?.sun);
    if (!valid) {
      catcher.visible = false;
      contacts.visible = false;
      contacts.count = 0;
      return false;
    }
    const [r, g, b, strength] = shadow;
    catcherMaterial.color.setRGB(r, g, b);
    catcherMaterial.opacity = Math.max(0, Math.min(1, strength * CATCHER_STRENGTH));
    catcher.visible = true;
    contactMaterial.uniforms.uShadowTint.value.set(toSrgb(r), toSrgb(g), toSrgb(b));
    contactMaterial.uniforms.uShadowStrength.value = Math.max(0, Math.min(1, strength * CONTACT_STRENGTH));
    const placed = contactPlacements(footprints, lighting.sun);
    placed.forEach((p, i) => {
      position.set(p.x, p.y, CONTACT_Z);
      turn.setFromAxisAngle(zAxis, p.yaw);
      scale.set(p.w, p.h, 1);
      matrix.compose(position, turn, scale);
      contacts.setMatrixAt(i, matrix);
      cards.setXY(i, p.cardW, p.cardH);
    });
    contacts.count = placed.length;
    contacts.instanceMatrix.needsUpdate = true;
    cards.needsUpdate = true;
    contacts.visible = placed.length > 0;
    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    parent.remove(group);
    catcher.geometry.dispose();
    catcherMaterial.dispose();
    contactGeometry.dispose();
    contactMaterial.dispose();
    contacts.dispose?.();
  };

  return { setBounds, update, meshes: () => [catcher, contacts], contactCount: () => contacts.count, dispose };
}
