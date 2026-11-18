// A keydown carries the typed character (key) and the physical key (code); either one being on
// the replay allow-list lets it through. Alt on macOS rewrites `key` to a symbol (Alt+Z types
// 'Ω'), so `code` is the only value that still names the key there.
export const isKeydownBlockedByReplay = (event, isBlockedByReplay) =>
  isBlockedByReplay('keybind', event.key) &&
  isBlockedByReplay('keybind', event.code);
