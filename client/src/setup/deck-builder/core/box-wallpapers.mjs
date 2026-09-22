/**
 * PC Box wallpapers (design 025) — the Gen V Box backgrounds a deck can wear
 * behind its card list. Each entry has a banner (the strip behind the deck
 * header) and a body tile (behind the deck rows), both vendored 1x pixel art
 * under client/src/assets/box-wallpapers and scaled up pixelated in CSS.
 */
export const BOX_WALLPAPER_BASE_PATH = '/src/assets/box-wallpapers';

const WALLPAPER_NAMES = [
  'Forest',
  'City',
  'Desert',
  'Savanna',
  'Crag',
  'Volcano',
  'Snow',
  'Cave',
  'Beach',
  'Seafloor',
  'River',
  'Sky',
  'Checks',
  'PokeCenter',
  'Machine',
  'Simple',
];

export const BOX_WALLPAPERS = WALLPAPER_NAMES.map((name) => {
  const id = name.toLowerCase();
  return {
    id,
    name: name === 'PokeCenter' ? 'Poké Center' : name,
    banner: `${BOX_WALLPAPER_BASE_PATH}/${id}-banner.png`,
    body: `${BOX_WALLPAPER_BASE_PATH}/${id}-wall.png`,
  };
});

export const DEFAULT_WALLPAPER_ID = 'forest';

/** @returns the wallpaper for `id`, or the default for anything unknown. */
export function findWallpaper(id) {
  return (
    BOX_WALLPAPERS.find((wallpaper) => wallpaper.id === id) ||
    BOX_WALLPAPERS.find((wallpaper) => wallpaper.id === DEFAULT_WALLPAPER_ID)
  );
}

/** Steps through the list from `id`, wrapping at both ends. */
export function cycleWallpaper(id, step = 1) {
  const current = BOX_WALLPAPERS.indexOf(findWallpaper(id));
  const count = BOX_WALLPAPERS.length;
  const offset = Number.isInteger(step) ? step : 0;
  return BOX_WALLPAPERS[(((current + offset) % count) + count) % count];
}
