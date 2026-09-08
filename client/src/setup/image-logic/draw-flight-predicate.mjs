export function shouldAnimateDrawFlight({
  syncReplay = false,
  syncReplaying = false,
  hidden = false,
} = {}) {
  return !syncReplay && !syncReplaying && !hidden;
}
