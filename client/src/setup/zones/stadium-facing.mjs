/**
 * The Stadium reads upright for whoever played it and upside down for the other
 * player. `#stadium` itself carries the table-tilt transform (apply-table-tilt.js
 * writes `--tilt-transform` with a transform-origin far outside the element), so
 * an inline transform on it would both drop the tilt and pivot the card around
 * that distant origin — off-screen. The flip therefore lives on a class that
 * rotates only the child <img> (index.css).
 */
export const STADIUM_OPP_FACING_CLASS = 'stadium-opp-facing';

/**
 * @param {Element|null} stadiumElement `#stadium`
 * @param {boolean} facesOpponent true when the local player did not play the Stadium
 */
export function setStadiumFacing(stadiumElement, facesOpponent) {
  if (!stadiumElement?.classList) return;
  if (facesOpponent) {
    stadiumElement.classList.add(STADIUM_OPP_FACING_CLASS);
  } else {
    stadiumElement.classList.remove(STADIUM_OPP_FACING_CLASS);
  }
}
