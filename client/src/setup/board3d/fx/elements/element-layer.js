// Design 079 § Element layer: per-type shader meshes drawn in the FX pass beside the gpu-canvas
// mesh. Each kind (ELEMENT_KINDS) owns its three objects and instance buffers; element kits emit
// into them through `emitter` while an FX frame records, and `finish` uploads what was emitted.
// Kinds that refract or lens the board ask for it (`needsBoard`), and only then is the board's
// rendered frame copied into `uBoard`, once per frame.
import { ELEMENT_KINDS } from './index.js';
import { createElementTextures } from './element-textures.js';

const TIME_WRAP_S = 512;

/**
 * @param {{ three: typeof import('three'), renderer: import('three').WebGLRenderer, group: import('three').Group,
 *   layer: number, kinds?: Record<string, Function>, textures?: object, debug?: (...args: unknown[]) => void }} options
 */
export function createElementLayer({
  three,
  renderer,
  group,
  layer,
  kinds = ELEMENT_KINDS,
  textures = null,
  debug = (...args) => console.debug(...args),
}) {
  const ownTextures = textures ?? createElementTextures({ three, debug });
  const black = new three.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, three.RGBAFormat);
  black.needsUpdate = true;
  const uniforms = {
    uTime: { value: 0 },
    uStageToWorld: { value: new three.Matrix4() },
    uBoard: { value: black },
    uViewport: { value: new three.Vector2(1, 1) },
    uHasBoard: { value: 0 },
  };

  const defined = new Map();
  for (const [name, define] of Object.entries(kinds)) {
    const kind = define({ three, textures: ownTextures, uniforms, layer, debug });
    kind.object3d.layers.set(layer);
    group.add(kind.object3d);
    defined.set(name, kind);
  }

  const warned = new Set();
  const warnOnce = (key, ...args) => {
    if (warned.has(key)) return;
    warned.add(key);
    debug(...args);
  };

  const emitter = {
    /** True while the recorder is in a lit (non-cast) pass of an FX frame; set by gpu-canvas `begin`. */
    live: false,
    /** @returns {boolean} whether the element was queued */
    emit(kind, params) {
      if (!emitter.live) return false;
      const target = defined.get(kind);
      if (!target) {
        warnOnce(`unknown:${kind}`, 'elements: unknown kind', kind);
        return false;
      }
      try {
        return target.push(params) === true;
      } catch (error) {
        warnOnce(`throw:${kind}`, 'elements: a kind threw on push', kind, error?.message || error);
        return false;
      }
    },
  };

  let board = null;
  const size = new three.Vector2();

  return {
    emitter,
    /** Starts an FX frame: every kind empties its queue. */
    begin() {
      emitter.live = false;
      for (const kind of defined.values()) kind.begin();
    },
    /** Ends the frame's recording: uploads every kind's instances with this frame's uniforms. */
    finish({ timeSeconds = 0, stageToWorld = null } = {}) {
      emitter.live = false;
      uniforms.uTime.value = ((Number(timeSeconds) || 0) % TIME_WRAP_S + TIME_WRAP_S) % TIME_WRAP_S;
      if (stageToWorld) uniforms.uStageToWorld.value.fromArray(stageToWorld);
      renderer.getDrawingBufferSize(size);
      uniforms.uViewport.value.set(Math.max(1, size.x), Math.max(1, size.y));
      for (const [name, kind] of defined) {
        try {
          kind.finish(uniforms);
        } catch (error) {
          warnOnce(`finish:${name}`, 'elements: a kind failed to upload', name, error?.message || error);
          kind.object3d.visible = false;
        }
      }
    },
    /**
     * The size of the target the elements render into, in its pixels: refracting kinds map
     * gl_FragCoord through it onto the board copy. fx-layer renders at CSS-pixel size on high-DPI
     * screens (fxTargetScale), so this is not the drawing buffer's size there.
     */
    setViewport(width, height) {
      uniforms.uViewport.value.set(Math.max(1, Number(width) || 1), Math.max(1, Number(height) || 1));
    },
    /** Whether any kind drawing this frame reads the board behind it. */
    needsBoard() {
      for (const kind of defined.values()) if (kind.needsBoard()) return true;
      return false;
    },
    /**
     * Copies the framebuffer bound now (the canvas, after the board's render) into `uBoard` when a
     * kind needs it; otherwise binds the 1×1 black stand-in (design 079 edge 9).
     */
    captureBoard() {
      if (!this.needsBoard()) {
        uniforms.uBoard.value = black;
        uniforms.uHasBoard.value = 0;
        return false;
      }
      renderer.getDrawingBufferSize(size);
      const width = Math.max(1, size.x);
      const height = Math.max(1, size.y);
      if (!board || board.image.width !== width || board.image.height !== height) {
        board?.dispose();
        board = new three.FramebufferTexture(width, height);
        board.name = 'board3d-fx-board-copy';
      }
      // three's texture-binding cache can disagree with GL here (the copy then lands in whatever
      // texture is really bound, a 1×1 stand-in → INVALID_VALUE); a reset makes it bind for real.
      renderer.resetState();
      renderer.copyFramebufferToTexture(board);
      uniforms.uBoard.value = board;
      uniforms.uHasBoard.value = 1;
      return true;
    },
    /** Each kind's queued count this frame (`{ kind: number | object }`), for tests and fx-preview. */
    counts() {
      return Object.fromEntries([...defined].map(([name, kind]) => [name, kind.counts?.() ?? null]));
    },
    textures: ownTextures,
    dispose() {
      emitter.live = false;
      for (const kind of defined.values()) {
        group.remove(kind.object3d);
        kind.dispose();
      }
      defined.clear();
      board?.dispose();
      black.dispose();
      if (!textures) ownTextures.dispose();
    },
  };
}
