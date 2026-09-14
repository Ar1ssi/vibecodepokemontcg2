// Design 009 slice 5/6: pure plan from a server advisory event to a
// shuffle/draw/knockout animation intent. DOM-free so it can be unit-tested
// without a browser; the paired advisory-animations.js does the actual
// playShuffleFlight/playDrawToHand/playKnockoutGhost calls. The knockout ghost
// itself is captured earlier, by `onBeforeApply` (before the DOM diff removes
// the card) — this plan only carries the instanceId needed to find it.
export function advisoryAnimationPlan(event, selfPlayerId) {
  if (!event || typeof event !== 'object') return null;
  if (event.playerId == null || selfPlayerId == null) return null;
  const user = event.playerId === selfPlayerId ? 'self' : 'opp';

  switch (event.type) {
    case 'zoneShuffled':
    case 'zoneShuffledIntoDeck':
      if (!event.zoneId) return null;
      return { kind: 'shuffle', user, zoneId: event.zoneId };

    case 'cardsDrawn': {
      if (!Array.isArray(event.cards) || event.cards.length === 0) return null;
      const cards = event.cards.filter((c) => c?.instanceId != null);
      if (cards.length === 0) return null;
      return { kind: 'draw', user, cards, count: cards.length };
    }

    case 'pokemonKnockedOut':
      if (event.instanceId == null) return null;
      return { kind: 'knockout', user, instanceId: event.instanceId };

    default:
      return null;
  }
}
