// A short line of text as a flat plane for the three.js board (design 074 O6-B): zone counts now,
// damage digits and name labels later. The text is drawn on a power-of-two canvas at the device
// pixel ratio and shown through a CanvasTexture. The plane is sized in CSS px of the font (1 unit
// = 1 px at `px`), centred on its origin in the xy plane, facing +z; callers scale it.
// `three` is the namespace from `import('three')`; this module never imports it statically.

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_WEIGHT = 700;
/** Room around the glyphs for the drop shadow, in font px. */
const PADDING_EM = 0.3;
const SHADOW = { color: 'rgba(0, 0, 0, 0.85)', blurEm: 0.18, offsetEm: 0.05 };
const MAX_PIXEL_RATIO = 3;
const MAX_CANVAS_PX = 2048;

const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));

const pixelRatio = () => {
  const ratio = Number(globalThis.devicePixelRatio);
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, MAX_PIXEL_RATIO) : 1;
};

/**
 * @param {{ three: typeof import('three'), text: string, px?: number, color?: string,
 *   shadow?: boolean, document?: Document }} options `px` = font size in CSS px
 * @returns {{ mesh: import('three').Mesh, setText: (text: string) => void, dispose: () => void }}
 *   `mesh.userData.textWidthPx` / `textHeightPx` give the plane's size in font px.
 */
export function createTextPlane({
  three,
  text,
  px = 28,
  color = '#fff',
  shadow = true,
  document: doc = globalThis.document,
}) {
  const fontPx = Number.isFinite(px) && px > 0 ? px : 28;
  const font = `${FONT_WEIGHT} ${fontPx}px ${FONT_FAMILY}`;
  const material = new three.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new three.Mesh(new three.PlaneGeometry(1, 1), material);
  mesh.name = 'board3d-text';
  let canvas = null;
  let texture = null;
  let current = null;
  let disposed = false;

  const measure = (value) => {
    const probe = doc.createElement('canvas').getContext('2d');
    if (!probe) return fontPx * value.length * 0.6;
    probe.font = font;
    return probe.measureText(value).width;
  };

  const draw = (value) => {
    const ratio = pixelRatio();
    const pad = fontPx * PADDING_EM;
    const widthPx = Math.ceil(measure(value) + 2 * pad);
    const heightPx = Math.ceil(fontPx * 1.25 + 2 * pad);
    const canvasW = Math.min(MAX_CANVAS_PX, nextPowerOfTwo(widthPx * ratio));
    const canvasH = Math.min(MAX_CANVAS_PX, nextPowerOfTwo(heightPx * ratio));
    if (!canvas || canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas = doc.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      texture?.dispose();
      texture = new three.CanvasTexture(canvas);
      texture.colorSpace = three.SRGBColorSpace;
      texture.minFilter = three.LinearFilter;
      texture.generateMipmaps = false;
      material.map = texture;
      material.needsUpdate = true;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The canvas spans (canvasW / ratio) × (canvasH / ratio) font px: the text keeps its size
    // whatever power of two the canvas rounded up to, and the plane matches the canvas.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    if (shadow) {
      ctx.shadowColor = SHADOW.color;
      ctx.shadowBlur = fontPx * SHADOW.blurEm * ratio;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = fontPx * SHADOW.offsetEm * ratio;
    }
    ctx.fillText(value, canvasW / ratio / 2, canvasH / ratio / 2);
    texture.needsUpdate = true;
    const planeW = canvasW / ratio;
    const planeH = canvasH / ratio;
    mesh.geometry.dispose();
    mesh.geometry = new three.PlaneGeometry(planeW, planeH);
    mesh.userData.textWidthPx = planeW;
    mesh.userData.textHeightPx = planeH;
  };

  const setText = (next) => {
    if (disposed) return;
    const value = String(next ?? '');
    if (value === current) return;
    current = value;
    mesh.visible = value.length > 0;
    if (value.length > 0) draw(value);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mesh.removeFromParent();
    mesh.geometry.dispose();
    texture?.dispose();
    material.dispose();
    canvas = null;
  };

  setText(text);
  return { mesh, setText, dispose };
}
