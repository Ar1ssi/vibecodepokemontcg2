// Map a playmat / thumbnail card URL to the same scan the deck builder
// preview uses (TCGdex high.webp, pokemontcg.io *_hires.png).

export function toHighResCardImageUrl(src = '') {
  const url = String(src || '').trim();
  if (!url) return url;
  if (url.includes('/low.webp')) return url.replace('/low.webp', '/high.webp');
  if (url.includes('/low.png')) return url.replace('/low.png', '/high.png');
  if (url.includes('/low.jpg')) return url.replace('/low.jpg', '/high.jpg');

  const ptcg = url.match(
    /^(https?:\/\/images\.pokemontcg\.io\/.+\/)([^/?#]+)\.png(\?.*)?$/i
  );
  if (ptcg && !ptcg[2].endsWith('_hires')) {
    return `${ptcg[1]}${ptcg[2]}_hires.png${ptcg[3] || ''}`;
  }
  return url;
}
