import { BackSide, Color, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry } from 'three';

/**
 * The room the tabletop reflects (design 073, iteration 13): the TCG Pocket studio the eye sees
 * (`tt-studio.js`) — pale blue overhead, brightening to a white glow at the horizon, a white floor
 * below — with softboxes over the table so glossy things still flash when they tilt: a broad one
 * overhead, a window-like panel at the front left (where the key light comes from), a cool strip
 * behind on the right, a dim lamp behind the viewer. The ceiling is darker than the walls the eye
 * sees, and the floor dimmer than its white, so a sealed box's film and a held card's foil keep
 * the print under their glare instead of going milky. Linear radiance; units arbitrary (a PMREM
 * only keeps directions). Rendered once through `PMREMGenerator.fromScene`.
 */

const linear = (r, g, b) => new Color(r, g, b);
// The room's own glow, against its softboxes: as dim as this, it fills about as much light into the
// shadows as the old dark study did, so things keep their calibrated colour (a card facing the
// key shows about its print) while the studio the eye sees around them is bright. Measured on the
// summary fan: card art within ~5 % of iteration 12's (darks +2–4 levels, means +5–10).
const ROOM_GLOW = 0.3;

const ROOM_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ROOM_FRAGMENT = /* glsl */ `
uniform vec3 uCeiling;
uniform vec3 uWall;
uniform vec3 uHorizon;
uniform vec3 uFloor;
varying vec3 vDirection;
void main() {
  float up = normalize(vDirection).y;
  vec3 color = up >= 0.0
    ? mix(mix(uHorizon, uWall, smoothstep(0.0, 0.25, up)), uCeiling, smoothstep(0.25, 0.95, up))
    : mix(uHorizon, uFloor, smoothstep(0.0, 0.12, -up));
  gl_FragColor = vec4(color, 1.0);
}`;

const glow = (intensity, color = 0xffffff) => {
  const material = new MeshBasicMaterial({ color: new Color(color) });
  material.color.multiplyScalar(intensity);
  return material;
};

export function createStudioEnvironment() {
  const scene = new Scene();
  const sphere = new SphereGeometry(30, 48, 24);
  const plane = new PlaneGeometry(1, 1);

  const room = new Mesh(
    sphere,
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uCeiling: { value: linear(0.3, 0.38, 0.52).multiplyScalar(ROOM_GLOW) },
        uWall: { value: linear(0.5, 0.62, 0.8).multiplyScalar(ROOM_GLOW) },
        uHorizon: { value: linear(1.05, 1.1, 1.15).multiplyScalar(ROOM_GLOW) },
        uFloor: { value: linear(0.46, 0.5, 0.56).multiplyScalar(ROOM_GLOW) },
      },
      vertexShader: ROOM_VERTEX,
      fragmentShader: ROOM_FRAGMENT,
    })
  );
  scene.add(room);

  const place = (material, position, scale, rotation = [0, 0, 0]) => {
    const mesh = new Mesh(plane, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    scene.add(mesh);
    return mesh;
  };
  // Ceiling softbox, facing down.
  place(glow(5.5, 0xfffaf4), [0, 18.5, 2], [12, 8, 1], [Math.PI / 2, 0, 0]);
  // The window: front left, facing the table.
  place(glow(3.5, 0xfbfdff), [-17, 9, 9], [10, 7, 1], [0, Math.PI / 2.6, 0]);
  // A cool strip light behind on the right.
  place(glow(2.6, 0xdce9ff), [15, 8, -15], [2.2, 9, 1], [0, -Math.PI / 4, 0]);
  // A dim lamp behind the viewer, so things facing the eye still catch a little light.
  place(glow(1.2, 0xf6f9ff), [3, 7, 19], [6, 4, 1], [0, Math.PI, 0]);

  return {
    scene,
    dispose: () => {
      scene.traverse((node) => {
        if (node.isMesh) node.material.dispose();
      });
      sphere.dispose();
      plane.dispose();
    },
  };
}
