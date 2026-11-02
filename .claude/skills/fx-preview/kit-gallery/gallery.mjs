// The Stadium kit's asset gallery (designs 081, 082): every asset through the real kit shaders and
// the board's plate path (a HalfFloat target, then Neutral tone mapping on the blit), seen by a
// camera like the 12° tilt preset, on a meadow, a sand strip, a plaza and a pond. Captured by
// rec/rec-stadium-kit.mjs. Query: mood (MOODS key), zoom, cx / cy (where the camera looks), tilt
// (deg), dist, w / h, t (the clock, for sway), grass (#hex).
import * as three from 'three';
import { createPropBuilder } from '/client/src/setup/board3d/stadium-env-props.mjs';
import { createKitProps, paint } from '/client/src/setup/board3d/stadium-kit.mjs';
import { placeAsset } from '/client/src/setup/board3d/stadium-kit-assets.mjs';
import { FILTERING, MAX_FOOTPRINTS, NOISE, SUN_DIRECTION, VORONOI } from '/client/src/setup/board3d/stadium-environment-glsl.mjs';
import * as GROUND from '/client/src/setup/board3d/stadium-env-ground.mjs';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || 1600);
const H = Number(params.get('h') || 900);
const TILT = Number(params.get('tilt') || 12) * (Math.PI / 180);
const DIST = Number(params.get('dist') || 1400);

const renderer = new three.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.toneMapping = three.NeutralToneMapping;
renderer.outputColorSpace = three.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const ZOOM = Number(params.get('zoom') || 1);
const camera = new three.PerspectiveCamera((2 * Math.atan(H / 2 / (DIST * ZOOM)) * 180) / Math.PI, W / H, 10, 20000);
const CX = Number(params.get('cx') || 0);
const CY = Number(params.get('cy') || 0);
camera.position.set(CX, CY - Math.sin(TILT) * DIST, Math.cos(TILT) * DIST);
camera.up.set(0, 1, 0);
camera.lookAt(CX, CY, 0);
camera.updateMatrixWorld();

const field = new three.DataTexture(new Float32Array(4), 1, 1, three.RGBAFormat, three.FloatType);
field.needsUpdate = true;
const uniforms = {
  uMin: { value: new three.Vector2(-W, -H) },
  uSize: { value: new three.Vector2(2 * W, 2 * H) },
  uOrigin: { value: new three.Vector2() },
  uReveal: { value: 1 },
  uExit: { value: 0 },
  uTime: { value: Number(params.get('t') || 0) },
  uSun: { value: new three.Vector3(...SUN_DIRECTION).normalize() },
  uField: { value: field },
  uPre: { value: field },
  uLight: { value: field },
  uTexel: { value: new three.Vector2(1, 1) },
  uFocal: { value: (camera.projectionMatrix.elements[5] * H) / 2 },
  uEye: { value: camera.position.clone() },
  uFootprints: { value: Array.from({ length: MAX_FOOTPRINTS }, () => new three.Vector4(-1e5, -1e5, -1e5, -1e5)) },
  uFootprintCount: { value: 0 },
  uFootprintBox: { value: new three.Vector4(-1e5, -1e5, -1e5, -1e5) },
};
const material = (vertexShader, fragmentShader, extra = {}, own = {}) =>
  new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...uniforms, ...own }, ...extra });

const scene = new three.Scene();

// The ground, painted with the BDSP ground kit (stadium-env-ground.mjs): a clover meadow, a dirt path
// fringed with grass, a flagstone plaza, a sand strip running wet into a pond.
const groundColours = {
  grass: paint(params.get('grass') || '#79bf55'),
  dirt: paint('#d9b27a'),
  sand: paint('#e8c58a'),
  water: paint('#3f86e8'),
  shallow: paint('#6cc6f0'),
  plaza: paint('#e3d7b5'),
  grout: paint('#b9a57e'),
};
const groundMaterial = new three.ShaderMaterial({
  uniforms: {
    ...Object.fromEntries(Object.entries(groundColours).map(([k, v]) => [k, { value: new three.Vector3(...v) }])),
    uTime: uniforms.uTime,
    uSun: uniforms.uSun,
  },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform vec3 grass; uniform vec3 dirt; uniform vec3 sand; uniform vec3 water; uniform vec3 shallow; uniform vec3 plaza; uniform vec3 grout;
uniform float uTime;
uniform vec3 uSun;
varying vec2 vP;
${NOISE}
${VORONOI}
${FILTERING}
${GROUND.GRASS}
${GROUND.STONEWORK}
${GROUND.SAND}
${GROUND.WATER}
float box(vec2 p, vec4 b) { vec2 d = abs(p - 0.5 * (b.xy + b.zw)) - 0.5 * (b.zw - b.xy); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main(){
  vec2 p = vP;
  filterPixel = pixelSize(p);
  vec3 col = cloverGrass(p, grass, 0.0);
  // a dirt path across the meadow, fringed with grass
  float path = abs(p.y - 160.0 - 30.0 * sin(p.x / 140.0)) - 26.0;
  float lawn = grassFringe(-path, p, 7.0);
  vec3 ground = dirt * (1.0 - 0.18 * fringeShade(-path, 7.0));
  col = mix(ground, col, lawn);
  // the sand strip
  float sandD = box(p, vec4(-200.0, -120.0, 330.0, 150.0));
  float sandy = 1.0 - grassFringe(-sandD, p, 6.0);
  col = mix(col, bdspSand(p, sand, 0.0) * (1.0 - 0.15 * fringeShade(-sandD, 6.0)), sandy);
  // the plaza of flagstones
  float plazaD = box(p, vec4(-720.0, -330.0, 270.0, -110.0));
  vec3 stone = flagstones(p, 36.0, 0.9, uSun);
  vec3 slab = plaza * (0.9 + 0.16 * stone.y) * (1.0 + 0.18 * stone.z);
  vec3 paved = mix(grout, slab, stone.x);
  float paving = 1.0 - grassFringe(-plazaD, p, 6.0);
  col = mix(col, paved, paving);
  // the pond, its sand bank running wet into the water
  float d = length(p - vec2(430.0, -210.0)) - 90.0;
  col = mix(col, mix(bdspSand(p, sand, 0.0), bdspSand(p, sand, 0.0) * 0.82, smoothstep(14.0, 0.0, d)), 1.0 - grassFringe(16.0 - d, p, 6.0));
  float depth = clamp(-d / 70.0, 0.0, 1.0);
  vec3 wet = mix(shallow, water, smoothstep(0.0, 0.7, depth));
  wet += vec3(0.8, 0.9, 1.0) * lightStreaks(p, uTime) * 0.28 * smoothstep(0.05, 0.25, depth);
  wet += vec3(1.2) * sparkles(p, uTime) * 0.8 * smoothstep(0.1, 0.3, depth);
  wet = mix(wet, vec3(1.0), (1.0 - smoothstep(0.0, 0.06, depth)) * 0.75);
  col = mix(col, wet, step(d, 0.0));
  gl_FragColor = vec4(col * 1.12, 1.0);
}`,
});
const ground = new three.Mesh(new three.PlaneGeometry(4 * W, 4 * H), groundMaterial);
scene.add(ground);

// Two cards for scale (a card is 100 px wide at world unit 1).
for (const x of [560, 680]) {
  const card = new three.Mesh(new three.PlaneGeometry(100, 140), new three.MeshBasicMaterial({ color: 0xf2f2f2 }));
  card.position.set(x, 40, 1);
  const back = new three.Mesh(new three.PlaneGeometry(104, 144), new three.MeshBasicMaterial({ color: 0x1d3b8a }));
  back.position.set(x, 40, 0.8);
  scene.add(back, card);
}

const mood = params.get('mood') || 'day';
const kit = createKitProps({ three, material, mood });

for (const object of kit.objects) scene.add(object);

const props = createPropBuilder();
const scenes = {
  gallery() {
    const row = (y, items) => items.forEach(([name, x, options = {}]) => placeAsset(props, name, { x, y, seed: x * 7 + y, ...options }));
    row(260, [
      ['treeRound', -650, { size: 60 }],
      ['pine', -500, { size: 34 }],
      ['pine', -420, { size: 30, snow: true, tiers: 4 }],
      ['palm', -330, { height: 150, leanYaw: 0.3 }],
      ['bush', -170, { size: 26 }],
      ['bush', -110, { size: 22, berries: '#ff5a6e' }],
      ['hedge', 0, { size: 16, length: 90 }],
      ['fern', 70, { size: 28 }],
      ['tallGrass', 130, { size: 32 }],
      ['flowers', 210, { size: 16 }],
      ['flowerBed', 250, { size: 24, depth: 0.5, y: 220 }],
      ['mushroom', 300, { size: 9 }],
      ['mushroom', 318, { size: 6, seed: 4 }],
      ['stump', 380, { size: 14 }],
      ['deadTree', 520, { height: 90 }],
    ]);
    row(40, [
      ['boulder', -660, { size: 26 }],
      ['pebbles', -580, { size: 14 }],
      ['spire', -480, { size: 24 }],
      ['ledgeRock', -420, { size: 26, y: -10 }],
      ['crystals', -360, { size: 42 }],
      ['crystals', -280, { size: 30, colors: { base: '#e58fd8', tip: '#ffe6fb' } }],
      ['cloud', -140, { size: 46, z: 50 }],
      ['pokeBall', -10, { size: 10 }],
      ['beachBall', 40, { size: 9 }],
      ['starfish', 80, { size: 8 }],
      ['shell', 110, { size: 6 }],
      ['towel', 170, { size: 46, yaw: 0.3 }],
      ['surfboard', 270, { size: 64, yaw: -0.5 }],
    ]);
    row(-220, [
      ['lamp', -680, { height: 70 }],
      ['lamp', -640, { height: 60, style: 'lantern' }],
      ['bench', -560, { size: 40 }],
      ['parasol', -440, { size: 30 }],
      ['planter', -330, { size: 16, plant: 'tree' }],
      ['planter', -260, { size: 14, plant: 'flowers' }],
      ['topiary', -190, { size: 14 }],
      ['fence', -140, { path: [[0, -60], [0, 0], [60, 20]], height: 16 }],
      ['signpost', 20, { size: 26 }],
      ['gravestone', 90, { size: 16 }],
      ['gravestone', 130, { size: 14, style: 'slab' }],
      ['reeds', 200, { size: 10 }],
      ['bollard', 240, { size: 6 }],
      ['lilyPad', 400, { size: 12, y: -230 }],
      ['lilyPad', 440, { size: 10, y: -190, bloom: true }],
    ]);
  },
};
scenes.gallery();
kit.set(props);

const plate = new three.WebGLRenderTarget(W * renderer.getPixelRatio(), H * renderer.getPixelRatio(), { type: three.HalfFloatType, samples: 4 });
const blit = new three.Mesh(
  new three.PlaneGeometry(2, 2),
  new three.ShaderMaterial({
    uniforms: { uPlate: { value: plate.texture } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D uPlate; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uPlate, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    depthTest: false,
    depthWrite: false,
  })
);
blit.frustumCulled = false;
const blitScene = new three.Scene();
blitScene.add(blit);
const blitCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);

renderer.setRenderTarget(plate);
renderer.render(scene, camera);
renderer.setRenderTarget(null);
renderer.render(blitScene, blitCamera);
window.__ready = true;
