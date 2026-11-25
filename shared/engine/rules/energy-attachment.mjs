// Whether a card is attached to a Pokémon. The authoritative state links a card to its host by
// `attachedTo` (host.instanceId); the legacy client board links DOM-backed cards by
// `image.relative` (host.image). Both models are read here and nowhere else.

export function isAttachedToHost(card, host) {
  if (!card || !host || card === host) return false;
  if (host.instanceId != null && card.attachedTo === host.instanceId) return true;
  return Boolean(host.image && card.image?.relative === host.image);
}
