// Hosts /api/card-image may fetch from (design 074 D8): the hosts cardArtSrc can produce.
// Kept in step with CARD_ART_CORS_HOSTS (client/src/setup/gl/card-art-hosts.mjs); card-image-url.mjs
// only rewrites within images.pokemontcg.io, so that host has no other variant to list.
export const CARD_ART_PROXY_HOSTS = new Set([
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'limitlesstcg.nyc3.digitaloceanspaces.com',
  'limitlesstcg.nyc3.cdn.digitaloceanspaces.com',
  'ptcgsim.online',
  // Card sleeves not replaced by a TCG Live scan (client/src/assets/catalogs/sleeves.json): the board's
  // WebGL card backs need them same-origin.
  'pokemon-sleeve-database.com',
]);
