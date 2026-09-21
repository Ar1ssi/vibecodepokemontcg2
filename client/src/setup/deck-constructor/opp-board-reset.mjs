// Under server-authoritative rendering the opponent's board is owned by the
// server view (apply-view.js). A peer's deck-data replay (sent again when the
// peer rejoins) must not run the legacy reset on it: legacy zone arrays are
// empty there, so reset strips only the <img> tags and leaves the holo
// wrappers behind as empty, unclickable foil frames.
export const shouldResetBoardOnDeckData = (user, systemState) =>
  !(user === 'opp' && systemState?.serverAuthoritative);
