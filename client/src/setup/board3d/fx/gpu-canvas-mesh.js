// Design 075 § GPU canvas material: one three Mesh that draws a gpu-canvas.mjs recording. The
// vertices go up in one interleaved dynamic buffer, the paint rows in a float texture, and each
// run of the recording is a geometry group with the material for its blend / depth / stencil
// state, drawn in recording order (all FX materials are transparent with equal sort keys, and
// three's transparent sort is stable).
import { MAX_IMAGES, PAINT_TEXELS, VERTEX_FLOATS } from './gpu-canvas.mjs';
import { GPU_CANVAS_FRAGMENT, GPU_CANVAS_VERTEX } from './gpu-canvas-shader.mjs';
import { FX_LAYER } from './fx-layers.mjs';

const INITIAL_VERTICES = 8192;
const INITIAL_PAINT_ROWS = 256;

/**
 * @param {{ three: typeof import('three'), renderOrder?: number }} options
 * @returns {{ object3d: import('three').Mesh, upload: (recording: object, frame: { timeSeconds: number,
 *   stageToWorld: ArrayLike<number> }) => void, materialCount: () => number, dispose: () => void }}
 */
export function createGpuCanvasMesh({ three, renderOrder = 10 }) {
  const white = new three.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;

  let paintRows = INITIAL_PAINT_ROWS;
  let paintTexture = null;
  const makePaintTexture = (rows) => {
    paintTexture?.dispose();
    paintTexture = new three.DataTexture(new Float32Array(PAINT_TEXELS * 4 * rows), PAINT_TEXELS, rows, three.RGBAFormat, three.FloatType);
    paintTexture.minFilter = three.NearestFilter;
    paintTexture.magFilter = three.NearestFilter;
    paintTexture.generateMipmaps = false;
    paintTexture.needsUpdate = true;
  };
  makePaintTexture(paintRows);

  const uniforms = {
    uPaints: { value: paintTexture },
    uPattern: { value: white },
    uImageFlip: { value: new Array(MAX_IMAGES).fill(0) },
    uImageSrgb: { value: new Array(MAX_IMAGES).fill(0) },
    uTime: { value: 0 },
    uStageToWorld: { value: new three.Matrix4() },
  };
  for (let i = 0; i < MAX_IMAGES; i += 1) uniforms[`uImage${i}`] = { value: white };

  let capacity = 0;
  let buffer = null;
  let geometry = null;
  const makeGeometry = (vertices) => {
    geometry?.dispose();
    capacity = vertices;
    buffer = new three.InterleavedBuffer(new Float32Array(capacity * VERTEX_FLOATS), VERTEX_FLOATS);
    buffer.setUsage(three.DynamicDrawUsage);
    geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('fxEdge', new three.InterleavedBufferAttribute(buffer, 4, 3));
    geometry.setAttribute('fxPaint', new three.InterleavedBufferAttribute(buffer, 2, 7));
    if (mesh) mesh.geometry = geometry;
  };

  let mesh = null;
  makeGeometry(INITIAL_VERTICES);
  mesh = new three.Mesh(geometry, []);
  mesh.name = 'board3d-fx-canvas';
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.layers.set(FX_LAYER);
  mesh.visible = false;

  const materials = new Map();
  const materialList = [];
  const stencilOps = {
    write: three.IncrementStencilOp,
    clear: three.DecrementStencilOp,
    test: three.KeepStencilOp,
  };
  const materialIndexFor = (run) => {
    const key = `${run.blend}|${run.depthTest}|${run.colorWrite}|${run.stencil.op}|${run.stencil.ref}`;
    if (materials.has(key)) return materials.get(key);
    const material = new three.RawShaderMaterial({
      name: `fx-canvas:${key}`,
      glslVersion: three.GLSL3,
      vertexShader: GPU_CANVAS_VERTEX,
      fragmentShader: GPU_CANVAS_FRAGMENT,
      uniforms,
      transparent: true,
      depthTest: run.depthTest,
      depthWrite: false,
      side: three.DoubleSide,
      colorWrite: run.colorWrite,
      blending: three.CustomBlending,
      blendEquation: three.AddEquation,
      blendSrc: three.OneFactor,
      blendDst: run.blend === 'add' ? three.OneFactor : three.OneMinusSrcAlphaFactor,
      // Additive light leaves coverage alone; an over-blended veil adds its own.
      blendSrcAlpha: run.blend === 'add' ? three.ZeroFactor : three.OneFactor,
      blendDstAlpha: run.blend === 'add' ? three.OneFactor : three.OneMinusSrcAlphaFactor,
    });
    if (run.stencil.op !== 'none') {
      material.stencilWrite = true;
      material.stencilFunc = three.EqualStencilFunc;
      // A clip write passes inside the clip it nests in (ref − 1); test and clear compare with ref.
      material.stencilRef = run.stencil.op === 'write' ? run.stencil.ref - 1 : run.stencil.ref;
      material.stencilFuncMask = 0xff;
      material.stencilWriteMask = run.stencil.op === 'test' ? 0 : 0xff;
      material.stencilFail = three.KeepStencilOp;
      material.stencilZFail = three.KeepStencilOp;
      material.stencilZPass = stencilOps[run.stencil.op];
    }
    const index = materialList.length;
    materialList.push(material);
    materials.set(key, index);
    mesh.material = materialList;
    return index;
  };

  let patternSource = null;
  let patternTexture = null;
  const textureFor = (source) => {
    if (!source) return white;
    if (source.isTexture) return source;
    if (source === patternSource && patternTexture) return patternTexture;
    patternTexture?.dispose();
    patternSource = source;
    patternTexture = new three.Texture(source);
    patternTexture.wrapS = three.RepeatWrapping;
    patternTexture.wrapT = three.RepeatWrapping;
    patternTexture.flipY = false;
    patternTexture.needsUpdate = true;
    return patternTexture;
  };

  const upload = (recording, { timeSeconds = 0, stageToWorld } = {}) => {
    const count = recording?.vertexCount ?? 0;
    mesh.visible = count > 0 && recording.runs.length > 0;
    if (!mesh.visible) return;
    if (count > capacity) {
      let next = capacity;
      while (next < count) next *= 2;
      makeGeometry(next);
    }
    buffer.array.set(recording.vertices.subarray(0, count * VERTEX_FLOATS));
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, count * VERTEX_FLOATS);
    buffer.needsUpdate = true;

    if (recording.paintCount > paintRows) {
      while (paintRows < recording.paintCount) paintRows *= 2;
      makePaintTexture(paintRows);
      uniforms.uPaints.value = paintTexture;
    }
    paintTexture.image.data.set(recording.paints);
    paintTexture.needsUpdate = true;

    uniforms.uPattern.value = recording.pattern ? textureFor(recording.pattern) : white;
    for (let i = 0; i < MAX_IMAGES; i += 1) {
      const image = recording.images?.[i];
      const texture = image?.isTexture ? image : white;
      uniforms[`uImage${i}`].value = texture;
      uniforms.uImageFlip.value[i] = texture.flipY ? 1 : 0;
      uniforms.uImageSrgb.value[i] = texture.colorSpace === three.SRGBColorSpace ? 1 : 0;
    }
    uniforms.uTime.value = timeSeconds;
    if (stageToWorld) uniforms.uStageToWorld.value.fromArray(stageToWorld);

    geometry.clearGroups();
    for (const run of recording.runs) {
      if (run.count > 0) geometry.addGroup(run.first, run.count, materialIndexFor(run));
    }
  };

  const dispose = () => {
    mesh.removeFromParent();
    geometry?.dispose();
    paintTexture?.dispose();
    patternTexture?.dispose();
    white.dispose();
    for (const material of materialList) material.dispose();
    materialList.length = 0;
    materials.clear();
  };

  return { object3d: mesh, upload, materialCount: () => materialList.length, dispose };
}
