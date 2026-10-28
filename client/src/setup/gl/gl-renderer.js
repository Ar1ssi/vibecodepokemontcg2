// Shared WebGL2 renderer setup (design 074 O11), after the pack3d stage. Loaded only through import().
import { NeutralToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';

const MAX_PIXEL_RATIO = 2;
/** From this pixel ratio up the drawing buffer is dense enough that 4x MSAA on top buys little. */
const MSAA_MAX_PIXEL_RATIO = 2;

const pixelRatio = () => Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);

/**
 * Whether to ask for MSAA. Context attributes are fixed at creation, so this follows the pixel
 * ratio at boot; a later move to another screen keeps it.
 * @param {boolean} wanted the caller's `antialias`
 * @param {number} ratio the device pixel ratio
 */
export const msaaFor = (wanted, ratio) => Boolean(wanted) && !(ratio >= MSAA_MAX_PIXEL_RATIO);

const contextAttributes = ({ alpha, antialias }) => ({
  alpha,
  antialias,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
});

/**
 * The context is created by hand so a missing WebGL2 is a quiet null, not three's console error.
 * @param {{ canvas: HTMLCanvasElement, onLost?: () => void, alpha?: boolean, antialias?: boolean }} options
 * @returns {{ renderer: WebGLRenderer, resizeTo: (host: Element) => void, syncPixelRatio: () => boolean,
 *   dispose: () => void } | null}
 *   `syncPixelRatio` follows a devicePixelRatio change (browser zoom, another screen); true when it did.
 */
export function createRenderer({ canvas, onLost = () => {}, alpha = true, antialias = true } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let renderer;
  try {
    const msaa = msaaFor(antialias, globalThis.devicePixelRatio || 1);
    const context = canvas.getContext('webgl2', contextAttributes({ alpha, antialias: msaa }));
    if (!context) return null;
    renderer = new WebGLRenderer({ canvas, context, alpha, antialias: msaa });
  } catch {
    return null;
  }
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;

  const onContextLost = (event) => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  let disposed = false;
  const syncPixelRatio = () => {
    if (disposed) return false;
    const ratio = pixelRatio();
    if (renderer.getPixelRatio() === ratio) return false;
    renderer.setPixelRatio(ratio);
    return true;
  };

  const resizeTo = (host) => {
    if (disposed || !host) return;
    syncPixelRatio();
    const width = Math.max(1, Math.round(host.clientWidth || 0));
    const height = Math.max(1, Math.round(host.clientHeight || 0));
    renderer.setSize(width, height, false);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
  };

  return { renderer, resizeTo, syncPixelRatio, dispose };
}
