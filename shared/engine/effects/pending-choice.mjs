// Leaf module (no imports): the one builder for a PendingChoice. Kept apart from executor so
// special-energy can use it without closing an import cycle through trainer-steps.
/**
 * Deterministically creates a PendingChoice without Math.random (Invariant 6).
 */
export function createPendingChoice({
  choiceId = null,
  player,
  prompt,
  source = '',
  options = [],
  min = 1,
  max = 1,
  cancellable = false,
  resumeToken = {},
  stateVersion = 0,
  stepIndex = 0,
}) {
  const token = resumeToken ? { ...resumeToken } : {};
  if (token && !token.initiatorPlayerId && player) {
    token.initiatorPlayerId = player;
  }
  return {
    choiceId: choiceId || `choice_${player}_${stateVersion}_${stepIndex}`,
    player,
    prompt,
    source,
    // Blind picks (face-down Prizes) reach the chooser without name or image (I141).
    options: options.map((opt) =>
      opt.faceDown
        ? { instanceId: opt.instanceId, faceDown: true }
        : {
            instanceId: opt.instanceId,
            name: opt.name || '',
            src: opt.src || '',
            type: opt.type || '',
          }
    ),
    min,
    max,
    cancellable: Boolean(cancellable),
    resumeToken: token,
  };
}
