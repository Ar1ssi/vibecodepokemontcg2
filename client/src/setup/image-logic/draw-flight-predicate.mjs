export function shouldAnimateDrawFlight({
  syncReplay = false,
  syncReplaying = false,
  hidden = false,
} = {}) {
  return !syncReplay && !syncReplaying && !hidden;
}

// Design 009 slice 4: a mirror-apply of the other player's live action also
// sets syncReplay (moveCardBundle's isMirrorReplay / shuffle's !emit path) —
// that flag alone can't distinguish "live action relayed to this client" from
// true catch-up replay, so this predicate ignores it and gates only on
// syncReplaying (actual catch-up) and tab visibility.
export function shouldAnimateMirror({
  syncReplay = false,
  syncReplaying = false,
  hidden = false,
} = {}) {
  return !syncReplaying && !hidden;
}
