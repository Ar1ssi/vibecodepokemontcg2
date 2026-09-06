// Pokémon TCG Live deck shuffle (see "Arcanine EX - Pokemon TCG Live
// Gameplay" at 1:45): sleeve cards lift off the pile, orbit once in a
// tight ring, then collapse back onto the same pile.

export const SHUFFLE_DURATION_MS = 1320;
export const SHUFFLE_REVOLUTIONS = 1.12;
export const SHUFFLE_VISUAL_CARDS = 10;
export const SHUFFLE_BOARD_PULL = 0.16;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t ** 3;

/** Spread envelope: 0 at the pile, 1 while orbiting, 0 on restack. */
export const shuffleSpread = (t) => {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.22) return easeOutCubic(t / 0.22);
  if (t > 0.78) return 1 - easeInCubic((t - 0.78) / 0.22);
  return 1;
};

export const rectCenter = (rect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

/** Shift the orbit toward the playmat center so neither side flies off-board. */
export const towardBoardOffset = (
  deckCenter,
  boardCenter,
  pull = SHUFFLE_BOARD_PULL
) => ({
  x: (boardCenter.x - deckCenter.x) * pull,
  y: (boardCenter.y - deckCenter.y) * pull,
});

export const shuffleRadiiFor = (deckRect) => ({
  radiusX: Math.max(deckRect.width * 1.45, 56),
  radiusY: Math.max(deckRect.height * 0.58, 34),
});

export const shuffleCardPose = (
  index,
  count,
  t,
  { radiusX, radiusY, revolutions = SHUFFLE_REVOLUTIONS } = {}
) => {
  const spread = shuffleSpread(t);
  const ring = 0.78 + 0.22 * ((index % 3) / 2);
  const angle =
    (index / Math.max(count, 1)) * Math.PI * 2 + t * revolutions * Math.PI * 2;
  return {
    x: Math.cos(angle) * radiusX * ring * spread || 0,
    y: (Math.sin(angle) * radiusY * ring * spread - 8 * spread) || 0,
    rotate: Math.sin(angle) * 18 * spread,
    scale: 1 + 0.07 * spread,
    z: Math.sin(angle),
    spread,
    angle,
  };
};

export const visualCardCount = (zoneCount) => {
  if (zoneCount < 2) return 0;
  return Math.min(SHUFFLE_VISUAL_CARDS, Math.max(6, zoneCount));
};

/** Parent-viewport translates for every visual card at progress `t`. */
export const shuffleFlightPlan = ({
  deckRect,
  boardRect,
  cardCount,
  t,
}) => {
  const deck = rectCenter(deckRect);
  const board = rectCenter(boardRect);
  const offset = towardBoardOffset(deck, board);
  const radii = shuffleRadiiFor(deckRect);
  return Array.from({ length: cardCount }, (_, i) => {
    const pose = shuffleCardPose(i, cardCount, t, radii);
    return {
      x: offset.x + pose.x,
      y: offset.y + pose.y,
      rotate: pose.rotate,
      scale: pose.scale,
      z: pose.z,
      spread: pose.spread,
    };
  });
};
