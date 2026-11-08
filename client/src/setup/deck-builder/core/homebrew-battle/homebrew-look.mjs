// What the unboxing scene dresses the Homebrew box in (design 078): the exterior of the Scarlet &
// Violet—151 Ultra-Premium Collection and its Mew booster front, nothing else — no promo, props or
// tray contents. Art is vendored by scripts/build-battle/vendor-homebrew-skin.mjs. Pure.

import { HOMEBREW_PACK_COUNT } from './homebrew-pack.mjs';

const ART_BASE = 'src/assets/build-battle/homebrew';
const TCGDEX_151 = 'https://assets.tcgdex.net/en/sv/sv03.5';

export const HOMEBREW_BOOSTER_SRC = `${ART_BASE}/sv03.5-booster.webp`;
// The render's front panel, cut out for the lid (vendor-homebrew-skin.mjs).
export const HOMEBREW_LID_SRC = `/${ART_BASE}/sv03.5-ultra-premium-lid.webp`;
export const HOMEBREW_BOX_RENDER = Object.freeze({
  src: `${ART_BASE}/sv03.5-ultra-premium.webp`,
  width: 1985,
  height: 1400,
});

const LOGO_URL = `${TCGDEX_151}/logo.webp`;

/** `contents` of the scene's lift-off box with nothing in it: only the packs. */
export function homebrewContents() {
  return {
    promo: null,
    promoTier: 0,
    energy: [],
    sleeveId: '',
    sleeveCount: 0,
    coinId: '',
    props: { damageDice: 0, flipDie: 0, coin: 0, dividers: 0, guide: 0, codeCard: 0 },
  };
}

/** @returns {object} the scene's `look` (skin, printed words, series and set names). */
export function homebrewLook(packCount = HOMEBREW_PACK_COUNT) {
  return {
    skin: {
      setLogoUrl: LOGO_URL,
      keyArtUrl: null,
      lidArt: HOMEBREW_LID_SRC,
      palette: 'sv',
      packArts: [{ kind: 'vendored', src: HOMEBREW_BOOSTER_SRC, shape: null }],
      faces: null,
      render: null,
    },
    labels: {
      productTitle: 'Ultra-Premium Collection',
      deckLabel: '',
      backLines: [`${packCount} Homebrew booster packs`, 'Build a 60-card deck from your pull'],
      codeCardGame: '',
    },
    seriesName: 'Scarlet & Violet',
    setName: 'Homebrew',
    playLevel: false,
  };
}

/**
 * The scene's words for this mode: the last summary says the packs are open and its one button goes
 * to the Pool tab (no collection, no "Open another").
 */
export function homebrewPresentation(packCount = HOMEBREW_PACK_COUNT) {
  return {
    doneText: `All ${packCount} packs are open. Build your 60-card deck from your pool.`,
    finishLabel: 'Build your deck',
    singleExit: true,
  };
}
