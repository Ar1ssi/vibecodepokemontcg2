// The holo sparkle toggle (Settings → Holo sparkle shapes) for the TCG Live foil shader. fx-settings.js sets it on
// every apply; each foil material follows it. Pure, so fx-settings and node tests can import it without three.
//
// Each name is a texture the game's shader adds or masks as star, speck or glitter shapes. Swapping one for black
// removes its contribution from an additive sparkle; the spectrum and shine textures stay.
export const SPARKLE_TEXTURES = new Set([
  'FX_T_SVUltra_Glitter',
  'T_Holofoil_Noise_Pixel',
  'T_Holofoil_Star_Classic',
  'T_Holofoil_Galaxy_Stars',
  'T_Holofoil_Cosmos_Dots_RGBA_Gradient',
  'T_Holofoil_Pikachu_Dot',
]);

let sparklesOn = true;
const listeners = new Set();

export const foilSparklesOn = () => sparklesOn;

export function setFoilSparklesOn(on) {
  if (on === sparklesOn) return;
  sparklesOn = on;
  for (const listener of listeners) listener(on);
}

/** Returns an unsubscribe function. */
export function onFoilSparklesChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
