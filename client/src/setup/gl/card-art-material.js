// Material for printed card art on the 3D board (card faces, sleeves). `three` is the namespace
// from `import('three')`; this module never imports it statically.

/**
 * Mip LOD bias of the art sample. A hand card draws ~700 px art at ~100 px, where plain trilinear
 * mipmapping reads a blurred level; a browser <img> downscale stays sharp. Anisotropy covers tilt.
 */
export const CARD_ART_LOD_BIAS = -0.75;

/**
 * Unlit and outside tone mapping, so the face shows the art's own colours (the key light and the
 * room environment washed lit faces out), sampled with CARD_ART_LOD_BIAS.
 * @param {typeof import('three')} three
 * @param {{ map?: import('three').Texture|null }} [options]
 * @returns {import('three').MeshBasicMaterial}
 */
export function createCardArtMaterial(three, { map = null } = {}) {
  const material = new three.MeshBasicMaterial({ color: 0xffffff, map, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv, ${CARD_ART_LOD_BIAS.toFixed(2)} );
        diffuseColor *= sampledDiffuseColor;
      #endif`
    );
  };
  material.customProgramCacheKey = () => 'card-art-lod-bias';
  return material;
}
