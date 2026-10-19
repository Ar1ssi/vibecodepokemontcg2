/**
 * The Stadium reads upright for whoever played it and upside down for the other
 * player. The flip lives on a class that rotates only the child <img> (index.css),
 * never an inline transform on `#stadium` itself, which would pivot the whole slot
 * around its own origin and move it off its place on the page.
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
