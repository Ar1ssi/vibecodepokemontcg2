// Elite Trainer Box promos (design 057 § Data), one row per ETB key in the deck-row shape.
// Baked 2026-09-29 by scripts/generate-build-battle-box.mjs (design 057 slice 2): TCGdex `mep-022`,
// name-checked "Charcadet"; art from the Limitless scan (TCGdex has none). Moved here verbatim
// when design 054 split the generated data per box; that generator no longer writes this file, so
// `--check` does not cover it: re-verify by hand against TCGdex when a row is added.
export const ETB_PROMOS = {
  "phantasmal-flames-etb": {
    "id": "mep-022",
    "name": "Charcadet",
    "supertype": "Pokémon",
    "localId": "022",
    "image": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/MEP/MEP_022_R_EN_LG.png",
    "images": {
      "small": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/MEP/MEP_022_R_EN.png",
      "large": "https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/MEP/MEP_022_R_EN_LG.png"
    },
    "set": {
      "id": "mep",
      "name": "MEP Black Star Promos",
      "releaseDate": ""
    },
    "rarity": "Promo",
    "category": "Pokemon",
    "stage": "Basic",
    "types": [
      "Fire"
    ],
    "hp": 70,
    "qty": 1
  }
};
