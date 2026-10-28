/**
 * Whether the cards count as moved on a frame. rects() and hitTest advance the card tweens between
 * frames, and one of those calls can finish a tween, so the next frame sees nothing moving; that
 * frame must still report the cards moved (`onRender` listeners, the mirror's rect sync, then see
 * the final pose). A call that finds the cards at rest must report nothing: the mirror syncs after a
 * moved frame by reading rects(), so counting every call would keep each frame asking for the next
 * and the board would draw at the display's rate for ever.
 */
export function createCardFrameDemand() {
  let advancedOffFrame = false;
  let movingLastFrame = false;
  return {
    /** The tweens were advanced between frames: `moving` is whether another frame is needed, `framePending` whether one is already asked for. */
    advancedBetweenFrames(moving, framePending) {
      if (framePending && (moving || movingLastFrame)) advancedOffFrame = true;
    },
    /** A frame drew with the card pool answering `poolMoving`; true when the cards count as moved on it. */
    drawn(poolMoving) {
      const moved = poolMoving || advancedOffFrame;
      advancedOffFrame = false;
      movingLastFrame = poolMoving;
      return moved;
    },
  };
}
