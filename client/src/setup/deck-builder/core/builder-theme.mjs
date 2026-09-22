/**
 * Deck-builder theme resolution (design: PTCG Live look).
 *
 * The builder is a full-screen overlay, so it carries its own theme
 * independent of the legacy per-element `dark-mode-1` body class used by the
 * game surface. Dark is the default because that is what Pokémon TCG Live
 * looks like; the light theme preserves the pre-Live grey palette.
 */

export const BUILDER_THEME_STORAGE_KEY = 'ptcg-sim.deck-builder-theme.v1';

export const BUILDER_THEMES = { DARK: 'dark', LIGHT: 'light' };

const DEFAULT_THEME = BUILDER_THEMES.DARK;

/** Coerces anything to a valid theme name, falling back to the Live dark default. */
export function normalizeBuilderTheme(value) {
  return value === BUILDER_THEMES.LIGHT ? BUILDER_THEMES.LIGHT : DEFAULT_THEME;
}

/**
 * Reads the persisted theme. A missing, unreadable, or unrecognised value
 * yields the dark default — storage is best-effort, never a failure mode.
 */
export function loadBuilderTheme(storage) {
  try {
    const raw = storage?.getItem?.(BUILDER_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return normalizeBuilderTheme(raw);
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveBuilderTheme(storage, theme) {
  try {
    storage?.setItem?.(BUILDER_THEME_STORAGE_KEY, normalizeBuilderTheme(theme));
  } catch {
    /* persistence is best-effort */
  }
}

export function toggleBuilderTheme(theme) {
  return normalizeBuilderTheme(theme) === BUILDER_THEMES.DARK
    ? BUILDER_THEMES.LIGHT
    : BUILDER_THEMES.DARK;
}

/**
 * The class list the workspace element should carry for a theme.
 * `db-live` opts the whole subtree into the Live stylesheet; `db-light`
 * layers the light palette over it.
 */
export function builderThemeClasses(theme) {
  return normalizeBuilderTheme(theme) === BUILDER_THEMES.LIGHT
    ? ['db-live', 'db-light']
    : ['db-live'];
}

/** Label/glyph for the header toggle: it advertises the theme it switches TO. */
export function builderThemeToggleLabel(theme) {
  return normalizeBuilderTheme(theme) === BUILDER_THEMES.DARK
    ? { glyph: '☀️', title: 'Switch to light theme' }
    : { glyph: '🌙', title: 'Switch to dark theme' };
}

/**
 * Applies a theme to a workspace element and persists it.
 * Tolerates a missing element so callers need no null dance.
 */
export function applyBuilderTheme(workspaceEl, theme, storage) {
  const resolved = normalizeBuilderTheme(theme);
  if (workspaceEl?.classList) {
    workspaceEl.classList.add('db-live');
    workspaceEl.classList.toggle('db-light', resolved === BUILDER_THEMES.LIGHT);
  }
  saveBuilderTheme(storage, resolved);
  return resolved;
}
