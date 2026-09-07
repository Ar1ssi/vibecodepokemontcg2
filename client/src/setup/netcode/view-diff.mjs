/**
 * @file Pure view diff calculation between previous and next authoritative GameState views.
 * Pure and DOM-free (Invariants 6 & 8).
 */

export const DIFF_ZONES = [
  'active',
  'bench',
  'hand',
  'prizes',
  'discard',
  'lostZone',
  'board',
];

/**
 * Normalizes card identity from view entry.
 *
 * @param {object} card
 * @returns {number|null}
 */
export function getCardInstanceId(card) {
  if (!card || typeof card !== 'object') return null;
  return typeof card.instanceId === 'number' ? card.instanceId : null;
}

/**
 * Builds a map of instanceId -> { card, zone, side, index } for a given player view.
 *
 * @param {object} playerView Player view section (you or them)
 * @param {string} side 'you' | 'them'
 * @returns {Map<number, { card: object, zone: string, side: string, index: number }>}
 */
export function indexPlayerZones(playerView, side) {
  const index = new Map();
  if (!playerView || !playerView.zones) return index;

  for (const zone of DIFF_ZONES) {
    const list = Array.isArray(playerView.zones[zone])
      ? playerView.zones[zone]
      : [];
    for (let i = 0; i < list.length; i++) {
      const card = list[i];
      const id = getCardInstanceId(card);
      if (id != null) {
        index.set(id, { card, zone, side, index: i });
      }
    }
  }

  return index;
}

/**
 * Checks whether two card representations differ in data state or reveal status.
 *
 * @param {object} prev
 * @param {object} next
 * @returns {boolean}
 */
export function hasCardChanged(prev, next) {
  if (!prev || !next) return true;
  if (prev.instanceId !== next.instanceId) return true;
  if ((prev.damage || 0) !== (next.damage || 0)) return true;
  if ((prev.specialCondition || null) !== (next.specialCondition || null)) return true;
  if (Boolean(prev.abilityUsed) !== Boolean(next.abilityUsed)) return true;
  if ((prev.attachedTo ?? null) !== (next.attachedTo ?? null)) return true;

  // Reveal state check: redacted entries lack name/src
  const prevRevealed = Boolean(prev.name || prev.src);
  const nextRevealed = Boolean(next.name || next.src);
  if (prevRevealed !== nextRevealed) return true;
  if (prevRevealed && nextRevealed) {
    if (prev.name !== next.name || prev.src !== next.src) return true;
  }

  return false;
}

/**
 * Computes structural differences between previousView and nextView.
 *
 * @param {object|null} previousView
 * @param {object} nextView
 * @returns {object} Diff report
 */
export function diffViews(previousView, nextView) {
  if (!nextView || typeof nextView !== 'object') {
    throw new Error('nextView must be a valid view object');
  }

  const prev = previousView || {};
  const isInitial = !previousView;

  const versionChanged = prev.stateVersion !== nextView.stateVersion;
  const turnChanged =
    prev.turn?.player !== nextView.turn?.player ||
    prev.turn?.number !== nextView.turn?.number ||
    prev.turn?.phase !== nextView.turn?.phase;

  const prevStadiumId = getCardInstanceId(prev.stadium);
  const nextStadiumId = getCardInstanceId(nextView.stadium);
  const stadiumChanged =
    prevStadiumId !== nextStadiumId ||
    hasCardChanged(prev.stadium, nextView.stadium);

  const prevChoiceId = prev.pendingChoice?.choiceId || null;
  const nextChoiceId = nextView.pendingChoice?.choiceId || null;
  const choiceChanged =
    prevChoiceId !== nextChoiceId ||
    prev.pendingChoice?.player !== nextView.pendingChoice?.player;

  const sides = ['you', 'them'];
  const playersDiff = {};

  for (const side of sides) {
    const prevSide = prev[side] || null;
    const nextSide = nextView[side] || null;

    if (!nextSide) {
      playersDiff[side] = null;
      continue;
    }

    const prevIndex = indexPlayerZones(prevSide, side);
    const nextIndex = indexPlayerZones(nextSide, side);

    const added = [];
    const removed = [];
    const moved = [];
    const updated = [];

    // Find added, moved, updated
    for (const [id, nextEntry] of nextIndex.entries()) {
      const prevEntry = prevIndex.get(id);
      if (!prevEntry) {
        added.push(nextEntry);
      } else {
        if (prevEntry.zone !== nextEntry.zone || prevEntry.side !== nextEntry.side) {
          moved.push({
            instanceId: id,
            fromZone: prevEntry.zone,
            toZone: nextEntry.zone,
            fromSide: prevEntry.side,
            toSide: nextEntry.side,
            fromIndex: prevEntry.index,
            toIndex: nextEntry.index,
            card: nextEntry.card,
          });
        }
        if (hasCardChanged(prevEntry.card, nextEntry.card)) {
          updated.push({
            instanceId: id,
            zone: nextEntry.zone,
            side: nextEntry.side,
            prevCard: prevEntry.card,
            card: nextEntry.card,
          });
        }
      }
    }

    // Find removed
    for (const [id, prevEntry] of prevIndex.entries()) {
      if (!nextIndex.has(id)) {
        removed.push(prevEntry);
      }
    }

    const prevDeckCount = prevSide?.zones?.deck?.count ?? 0;
    const nextDeckCount = nextSide?.zones?.deck?.count ?? 0;

    playersDiff[side] = {
      playerId: nextSide.playerId,
      username: nextSide.username,
      flags: nextSide.flags || {},
      deckCount: {
        previous: prevDeckCount,
        current: nextDeckCount,
        changed: prevDeckCount !== nextDeckCount,
      },
      added,
      removed,
      moved,
      updated,
    };
  }

  return {
    isInitial,
    versionChanged,
    turnChanged,
    stadiumChanged,
    choiceChanged,
    stateVersion: nextView.stateVersion,
    turn: nextView.turn,
    stadium: {
      previous: prev.stadium || null,
      current: nextView.stadium || null,
      changed: stadiumChanged,
    },
    pendingChoice: {
      previous: prev.pendingChoice || null,
      current: nextView.pendingChoice || null,
      changed: choiceChanged,
    },
    players: playersDiff,
  };
}
