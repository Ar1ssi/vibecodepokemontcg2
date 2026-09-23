// Modern (Mega Evolution / Scarlet & Violet) card ids are TCGdex ids such as
// "sv06-106" or "me02.5-142". pokemontcg.io does not host them under that name,
// so their images come from the TCGdex CDN instead.
const TCGDEX_MODERN_ID = /^((?:me\d\d(?:\.\d+)?|mep|mee|sv\d\d(?:\.\d+[bw]?)?|svp|sve))-([\w.]+)$/i;

export function tcgdexImageUrl(id, language = 'EN') {
  const match = TCGDEX_MODERN_ID.exec(String(id ?? ''));
  if (!match) return null;
  const [, setId, number] = match;
  const series = setId.slice(0, 2).toLowerCase();
  return `https://assets.tcgdex.net/${language.toLowerCase()}/${series}/${setId.toLowerCase()}/${number}/high.webp`;
}
