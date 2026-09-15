export function shouldAnimateDrawFlight({
  syncReplay = false,
  syncReplaying = false,
  hidden = false,
} = {}) {
  return !syncReplay && !syncReplaying && !hidden;
}

// Design 009: a live action relayed from the other player also carries
// syncReplay (moveCardBundle's isMirrorReplay, shuffle's !emit path), so
// syncReplay cannot tell "mirror of a live action" from catch-up. Catch-up
// replay of the peer log is flagged by systemState.isCatchingUp.
export function shouldAnimateMirror({
  syncReplaying = false,
  isCatchingUp = false,
  hidden = false,
} = {}) {
  return !syncReplaying && !isCatchingUp && !hidden;
}
