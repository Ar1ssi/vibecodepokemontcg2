// Design 068: pick the pass and compiled variant a Unity shader draws a particle with, translate
// both stages, and bake each material's constant buffers. The dump holds the reflection tables
// in two places (the program's common table and the variant's own); both are merged here.
import { constantReads, parseSignatures, transpile } from './dxbc-to-glsl.mjs';

const PASS_NORMAL = 0;
const PASS_GRAB = 2;
/** Keywords the game has on while it draws these (forward base pass, soft particles off). */
const ENABLED_KEYWORDS = new Set(['DIRECTIONAL']);
const QUEUES = { Background: 1000, Geometry: 2000, AlphaTest: 2450, Transparent: 3000, Overlay: 4000 };
const PROP_COLOR = 0;
const PROP_VECTOR = 1;
const PROP_TEXTURE = 4;
const FLAG_HDR = 16;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Built-in uniforms the stage fills every frame; the two object matrices are identity (world-space vertices). */
export const DYNAMIC_PARAMS = Object.freeze({
  _Time: 'time',
  unity_MatrixVP: 'viewProjection',
  _WorldSpaceCameraPos: 'cameraPosition',
  _ProjectionParams: 'projection',
});
const STATIC_PARAMS = { unity_ObjectToWorld: IDENTITY, unity_WorldToObject: IDENTITY };
export const GRAB_TEXTURE = '_GrabTexture';

const tagsOf = (tagMap) => Object.fromEntries(tagMap?.tags ?? []);

/** `Transparent+10` → 3010. */
export function queueFromTag(tag) {
  const match = /^([A-Za-z]+)\s*([+-]\s*\d+)?$/.exec(String(tag ?? 'Geometry').trim());
  if (!match || !(match[1] in QUEUES)) throw new Error(`unknown render queue: ${tag}`);
  return QUEUES[match[1]] + (match[2] ? Number(match[2].replace(/\s/g, '')) : 0);
}

const keywordNames = (shader, variant) => variant.keywords.map((index) => shader.keywordNames[index]);

const isShadowPass = (shader, pass) =>
  tagsOf(pass.tags).LIGHTMODE?.toUpperCase() === 'SHADOWCASTER' ||
  (pass.fragment?.variants ?? []).every((variant) => keywordNames(shader, variant).includes('UNITY_PASS_SHADOWCASTER'));

/** The variant whose keywords are all on in the game, the one with the most of them. */
export function pickVariant(shader, program) {
  const usable = program.variants
    .filter((variant) => variant.asm && keywordNames(shader, variant).every((keyword) => ENABLED_KEYWORDS.has(keyword)))
    .sort((a, b) => b.keywords.length - a.keywords.length);
  if (usable.length === 0) throw new Error(`${shader.name}: no variant for the enabled keywords`);
  if (usable[0].params.error) throw new Error(`${shader.name}: parameter table unread (${usable[0].params.error})`);
  return usable[0];
}

/** Merge the common and the variant tables into `{buffers: Map name → {size, params}, slots, textures}`. */
export function mergeParameters(pass, program, variant) {
  const names = pass.names;
  const buffers = new Map();
  const bufferOf = (name, size) => {
    if (!buffers.has(name)) buffers.set(name, { name, size, params: new Map() });
    return buffers.get(name);
  };
  for (const buffer of program.common?.m_ConstantBuffers ?? []) {
    const target = bufferOf(names[buffer.m_NameIndex], buffer.m_Size);
    for (const param of buffer.m_VectorParams) {
      target.params.set(names[param.m_NameIndex], { offset: param.m_Index, floats: param.m_Dim * Math.max(1, param.m_ArraySize) });
    }
    for (const param of buffer.m_MatrixParams) {
      target.params.set(names[param.m_NameIndex], { offset: param.m_Index, floats: 16 });
    }
  }
  for (const buffer of variant.params.buffers) {
    const target = bufferOf(buffer.name, buffer.size);
    for (const param of buffer.params) {
      target.params.set(param.name, { offset: param.offset, floats: param.isMatrix ? param.rows * param.columns : param.columns * Math.max(1, param.arraySize) });
    }
  }
  const slots = new Map();
  for (const binding of program.common?.m_ConstantBufferBindings ?? []) slots.set(binding.m_Index, names[binding.m_NameIndex]);
  for (const binding of variant.params.bindings) if (binding.type === 1) slots.set(binding.slot, binding.name);
  const textures = new Map();
  for (const texture of program.common?.m_TextureParams ?? []) textures.set(texture.m_Index, names[texture.m_NameIndex]);
  for (const binding of variant.params.bindings) if (binding.type === 0) textures.set(binding.slot, binding.name);
  return { buffers, slots, textures };
}

const translateStage = (shader, pass, stage) => {
  const program = pass[stage];
  const variant = pickVariant(shader, program);
  const translated = transpile(variant.asm, { stage });
  const merged = mergeParameters(pass, program, variant);
  const buffers = translated.buffers.map((buffer) => {
    const name = merged.slots.get(buffer.slot) ?? (buffer.slot === 0 ? '$Globals' : null);
    const layout = name ? merged.buffers.get(name) : null;
    if (!layout) throw new Error(`${shader.name} ${stage}: constant buffer cb${buffer.slot} has no layout`);
    return { uniform: buffer.uniform, slot: buffer.slot, length: buffer.length, name, params: [...layout.params].map(([param, at]) => ({ name: param, ...at })) };
  });
  for (const read of constantReads(variant.asm)) {
    const buffer = buffers.find((entry) => entry.slot === read.slot);
    for (const component of read.components) {
      const offset = read.row * 16 + component * 4;
      if (!buffer.params.some((param) => offset >= param.offset && offset < param.offset + param.floats * 4)) {
        throw new Error(`${shader.name} ${stage}: cb${read.slot}[${read.row}].${'xyzw'[component]} is read but not in the reflection tables`);
      }
    }
  }
  const textures = translated.textures.map((texture) => {
    const name = merged.textures.get(texture.slot);
    if (!name) throw new Error(`${shader.name} ${stage}: texture t${texture.slot} has no name`);
    return { uniform: texture.uniform, type: texture.type, name };
  });
  return { ...translated, buffers, textures, asm: variant.asm };
};

/**
 * The two stages are joined by register number (`io3` out, `io3` in). Direct3D joins them by
 * semantic, so check that each semantic the pixel shader reads sits in the register the vertex
 * shader wrote it to.
 */
export function checkStageLink(name, vertexAsm, fragmentAsm) {
  const written = new Map(parseSignatures(vertexAsm).output.map((row) => [`${row.semantic}${row.index}`, row.register]));
  for (const row of parseSignatures(fragmentAsm).input) {
    if (row.systemValue !== 'NONE' || !row.used) continue;
    const key = `${row.semantic}${row.index}`;
    if (written.get(key) !== row.register) {
      throw new Error(`${name}: the pixel shader reads ${key} from register ${row.register}, the vertex shader writes it to ${written.get(key) ?? 'none'}`);
    }
  }
}

/**
 * @returns {{name:string, grab:boolean, queue:number, blend:{src:number,dst:number,srcAlpha:number,dstAlpha:number},
 *   cull:number, vs:string, fs:string, attributes:object[], buffers:{v:object[], f:object[]}, textures:object[],
 *   usesFragCoord:boolean}}
 */
export function buildShader(shader) {
  const pass = shader.passes.find((entry) => entry.type === PASS_NORMAL && !isShadowPass(shader, entry));
  if (!pass) throw new Error(`${shader.name}: no drawable pass`);
  const state = pass.state;
  const blend = state.rtBlend0;
  for (const [label, value] of [['srcBlend', blend.srcBlend], ['destBlend', blend.destBlend], ['culling', state.culling]]) {
    if (value.name && value.name !== '<noninit>') throw new Error(`${shader.name}: ${label} is driven by the property ${value.name}`);
  }
  const vertex = translateStage(shader, pass, 'vertex');
  const fragment = translateStage(shader, pass, 'fragment');
  if (vertex.textures.length > 0) throw new Error(`${shader.name}: vertex textures are not supported`);
  checkStageLink(shader.name, vertex.asm, fragment.asm);
  return {
    name: shader.name,
    grab: shader.passes.some((entry) => entry.type === PASS_GRAB),
    queue: queueFromTag(tagsOf(shader.subShaderTags).QUEUE),
    blend: { src: blend.srcBlend.val, dst: blend.destBlend.val, srcAlpha: blend.srcBlendAlpha.val, dstAlpha: blend.destBlendAlpha.val },
    cull: state.culling.val,
    vs: vertex.glsl,
    fs: fragment.glsl,
    attributes: vertex.inputs.map(({ semantic, index, attribute }) => ({ semantic, index, attribute })),
    buffers: { v: vertex.buffers, f: fragment.buffers },
    textures: fragment.textures,
    usesFragCoord: fragment.usesFragCoord,
  };
}

const srgbToLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

const propDefault = (prop) => [prop.m_DefValue_0 ?? 0, prop.m_DefValue_1 ?? 0, prop.m_DefValue_2 ?? 0, prop.m_DefValue_3 ?? 0];

/** A `$Globals` parameter's value for one material, as `floats` numbers; null when nothing defines it. */
export function globalValue(name, floats, material, props, textureSize) {
  const prop = props.get(name);
  if (prop?.m_Type === PROP_COLOR || prop?.m_Type === PROP_VECTOR) {
    const value = material.colors[name] ?? propDefault(prop);
    // The project renders in linear space: a Color property is authored in sRGB (alpha is not).
    const linear = prop.m_Type === PROP_COLOR && !(prop.m_Flags & FLAG_HDR);
    return value.map((channel, index) => (linear && index < 3 ? srgbToLinear(channel) : channel)).slice(0, floats);
  }
  if (prop && prop.m_Type !== PROP_TEXTURE) {
    return [material.floats[name] ?? material.ints[name] ?? propDefault(prop)[0]];
  }
  if (name.endsWith('_ST')) {
    const env = material.textures[name.slice(0, -3)];
    return [...(env?.scale ?? [1, 1]), ...(env?.offset ?? [0, 0])];
  }
  if (name.endsWith('_TexelSize')) {
    const size = textureSize(name.slice(0, -'_TexelSize'.length));
    return size ? [1 / size.width, 1 / size.height, size.width, size.height] : null;
  }
  return null;
}

/**
 * One material's uniforms for `shader` (a `buildShader` result): each buffer's floats, where the
 * stage patches the per-frame built-ins, and the texture bound to each sampler.
 * `resolveTexture(name) → string` maps a sampler name to a texture key or a default's name.
 */
export function bakeMaterial(material, shader, rawShader, { resolveTexture, textureSize }) {
  const props = new Map(rawShader.props.map((prop) => [prop.m_Name, prop]));
  const missing = [];
  const bake = (stage) =>
    shader.buffers[stage].map((buffer) => {
      const data = new Array(buffer.length * 4).fill(0);
      for (const param of buffer.params) {
        const at = param.offset / 4;
        if (at >= data.length || param.name in DYNAMIC_PARAMS) continue;
        let value = null;
        if (param.name in STATIC_PARAMS) value = STATIC_PARAMS[param.name];
        else if (buffer.name === '$Globals') value = globalValue(param.name, param.floats, material, props, textureSize);
        if (value === null) missing.push(`${buffer.name}.${param.name}`);
        (value ?? []).forEach((number, index) => {
          if (at + index < data.length) data[at + index] = number;
        });
      }
      return data.map((number) => Number(number.toPrecision(7)));
    });
  return {
    v: bake('v'),
    f: bake('f'),
    textures: shader.textures.map((texture) => resolveTexture(texture.name)),
    missing,
  };
}

/** What the stage needs of a `buildShader` result: sources, state, and where the per-frame built-ins go. */
export function runtimeShader(shader) {
  const slim = (buffers) =>
    buffers.map((buffer) => ({
      uniform: buffer.uniform,
      length: buffer.length,
      dynamic: buffer.params
        .filter((param) => param.name in DYNAMIC_PARAMS && param.offset / 4 < buffer.length * 4)
        .map((param) => ({ at: param.offset / 4, kind: DYNAMIC_PARAMS[param.name] })),
    }));
  return {
    name: shader.name,
    grab: shader.grab,
    queue: shader.queue,
    blend: shader.blend,
    cull: shader.cull,
    vs: shader.vs,
    fs: shader.fs,
    attributes: shader.attributes,
    buffers: { v: slim(shader.buffers.v), f: slim(shader.buffers.f) },
    textures: shader.textures.map((texture) => ({ uniform: texture.uniform, type: texture.type })),
    usesFragCoord: shader.usesFragCoord,
  };
}
