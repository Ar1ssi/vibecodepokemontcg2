// Design 089: a zone's shuffle is a riffle of the pile's own card layers on the three.js board
// (board3d/pile-mesh.js `shuffle`, posed by board3d/shuffle-math.mjs). This is the entry the
// advisory plans and the board's manual shuffle call; the ring of flat sleeves that orbited over
// the deck (design 009) is gone.
import { getBoardScene } from '../board3d/board3d.js';

/**
 * @param {'self'|'opp'} user whose pile shuffles
 * @param {string} zoneId the pile (`deck`; a discard or Lost Zone stack shuffles too)
 * @param {number} zoneCount cards in it
 * @returns {number} how long the shuffle runs in ms, so the FX queue holds for it; 0 when nothing
 *   plays (a hidden tab, no board scene, a pile of under two cards)
 */
export const playShuffleFlight = (user, zoneId, zoneCount) => {
  if (typeof document === 'undefined' || document.hidden) return 0;
  return getBoardScene()?.playShuffle?.(user, zoneId, { count: zoneCount }) ?? 0;
};
