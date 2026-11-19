/**
 * @file Design 090: the game page joins its solo room by itself at load, so there is always a
 * board. This is the one decision of whether it should, kept pure so it is unit-testable.
 */

import { resolveBuilderRole } from '../deck-builder/core/builder-window.mjs';

/**
 * False when the page was opened for something other than playing a solo game:
 * - the deck builder / Build & Battle windows (`resolveBuilderRole` 'editor'; the standalone
 *   `/unboxing` page loads its own script, never this one);
 * - the two-player e2e harness, which joins its own room through `window.__ptcg`. Opening the
 *   page with `?e2e=1&autosolo=1` keeps the automatic join for a test of the real boot.
 *
 * The client has no URL that joins or spectates a multiplayer room (rooms are joined from the
 * Multiplayer tab), so there is no such case to exclude.
 *
 * @param {object} page
 * @param {string} [page.pathname] `location.pathname`
 * @param {string} [page.search] `location.search`
 * @param {boolean} [page.e2eMode] `isE2eMode()` — the e2e bridge is armed and requested
 * @returns {boolean}
 */
export function shouldAutoJoinSolo({ pathname = '', search = '', e2eMode = false } = {}) {
  if (resolveBuilderRole(pathname) === 'editor') return false;
  if (e2eMode && new URLSearchParams(search).get('autosolo') !== '1') return false;
  return true;
}
