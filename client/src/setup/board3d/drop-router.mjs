// Design 074 D5 "Drag": the decisions of drag.js expressed over three.js board hits, so the 3D
// board's drop ends in the same calls the HTML5 drop makes. `dropTargetFor` is dragOver's
// target predicates (drag.js:133-196) plus drop's target rule (:303-339); `routeDrop` is drop's
// branches (:341-453), returning the call to make instead of making it. DOM-free.

const PLAY_ZONES = new Set(['active', 'bench']);
/** Piles whose drop target in the DOM is their cover (`#deckCover`, …), drawn or empty. */
const COVER_ZONES = new Set(['deck', 'discard', 'lostZone']);
/** Zones a manual deck action leaves from (drag.js:390, :407). */
const DECK_SOURCES = new Set(['deck', 'viewCards']);

/**
 * @typedef {{ instanceId: number|null, side: 'self'|'opp', zone: string, index: number|string,
 *   attached?: boolean, isTrainer?: boolean, isEnergy?: boolean, isPokemon?: boolean,
 *   boardRefuses?: boolean }} Dragging
 *   The held card as `identifyCard` reads it: its owner (`mouseClick.cardUser`), zone
 *   (`mouseClick.zoneId`) and legacy index (`mouseClick.cardIndex`); `attached` is its <img>'s
 *   `.attached` flag (drag.js `draggedImage.attached`); `boardRefuses` is drop-zone.mjs's verdict
 *   on the card (a Pokémon or Energy never goes on the Trainer board).
 * @typedef {{ initiator: 'self'|'opp', isSpectator: boolean, rulesEnabled?: boolean, solo: boolean }} DragState
 * @typedef {{ kind: 'zone'|'card'|'cover'|'rail'|'stadium', side: 'self'|'opp'|null, zone: string,
 *   instanceId: number|null, highlight: 'card'|'zone'|'both'|null, refused?: boolean,
 *   attached?: boolean, targetIndex?: number }} DropTarget
 *   `zone` is the destination zone id drag.js would compute (covers as `deckCover` etc.);
 *   `highlight` is what dragOver lights; `refused` marks the Trainer board turning the card away
 *   (dragOver lights nothing, drop says why). A caller may add `targetIndex` (the legacy index
 *   `findZoneCardIndex` gives the target <img>) and `attached` (that <img>'s `.attached`).
 */

/** The DOM zone id of a hit: what `zoneOf(event.target)?.id` answers in drag.js. */
// A pile's drawn stack, its empty footprint and an open pile's face-up top card all sit in its
// cover (`#discardCover`, …).
const domZoneOf = (hit) => (COVER_ZONES.has(hit.zone) ? `${hit.zone}Cover` : hit.zone);

/** A zone id without its cover suffix: `discardCover` and `discard` are one pile. */
const pileOf = (zoneId) => String(zoneId ?? '').replace(/Cover$/, '');

const kindOf = (hit) => {
  if (hit.rail) return 'rail';
  if (hit.zone === 'stadium') return 'stadium';
  if (hit.pile || (hit.plane && COVER_ZONES.has(hit.zone))) return 'cover';
  if (Number.isFinite(hit.instanceId)) return 'card';
  return 'zone';
};

/** What dragOver lights for a target (drag.js:133-196), over a hit instead of a DOM node. */
const highlightFor = (kind, zone, dragging) => {
  const ownZone = dragging.zone;
  const attached = Boolean(dragging.attached);
  const fromPlay = PLAY_ZONES.has(ownZone);
  if (kind === 'rail') return 'zone';
  const inPlay = PLAY_ZONES.has(zone);
  if (kind !== 'card') {
    // A zone <div>: movingValidCardToContainer.
    return zone !== ownZone && (!attached || !inPlay) ? 'zone' : null;
  }
  // A card <img>: attachingValidCard lights the card; the zone block lights its zone.
  const card = inPlay && (zone !== ownZone || attached);
  const zoneLit =
    (!inPlay || (fromPlay && !attached)) &&
    ((inPlay && fromPlay && zone !== ownZone) || (!inPlay && zone !== ownZone));
  if (card && zoneLit) return 'both';
  if (card) return 'card';
  return zoneLit ? 'zone' : null;
};

/**
 * Where a held card would land under a board hit, or null when it may not land there.
 * `hit` is a `board-scene.js` hit (card, pile, zone plane, Stadium) or a page-level drop target
 * `{ rail: true, zone, side }` (the Lost Zone rail's `data-drop-zone`/`data-drop-user`).
 * A spectator drops nothing; a card lands only on its own side (the Stadium is shared), and
 * a card of the side that is not the initiator moves only in a solo room.
 * @param {object|null} hit
 * @param {Dragging} dragging
 * @param {DragState} state
 * @returns {DropTarget|null}
 */
export function dropTargetFor(hit, dragging, state) {
  if (!hit || typeof hit !== 'object' || !dragging || !state) return null;
  if (state.isSpectator) return null;
  if (dragging.side !== state.initiator && !state.solo) return null;
  if (hit.instanceId != null && hit.instanceId === dragging.instanceId) return null;
  const kind = kindOf(hit);
  const side = kind === 'stadium' ? null : hit.side;
  if (kind !== 'stadium' && side !== dragging.side) return null;
  const zone = kind === 'rail' ? hit.zone : domZoneOf(hit);
  if (!zone) return null;
  if (zone === 'board' && dragging.zone !== 'board' && dragging.boardRefuses) {
    return { kind, side, zone, instanceId: null, highlight: null, refused: true };
  }
  return {
    kind,
    side,
    zone,
    instanceId: kind === 'card' || kind === 'stadium' ? (hit.instanceId ?? null) : null,
    highlight: highlightFor(kind, zone, dragging),
  };
}

/** A gated manual deck action (`manualDeckActionAllowed(action)`) a move must pass first. */
const deckGatesFor = (fromZone, dZoneId) => {
  if (dZoneId === 'hand' && DECK_SOURCES.has(fromZone)) return ['draw'];
  if (dZoneId === 'bench' && DECK_SOURCES.has(fromZone)) return ['deckToBench'];
  if (dZoneId === 'hand' && fromZone === 'bench') return ['benchToHand'];
  return [];
};

/**
 * The call drag.js's drop makes for this target, or null when it makes none.
 * - `retreat`: `retreat(...args)`; args[2] is the dropped-on Bench card's instance id (drag.js
 *   passes its <img>; the caller resolves it) or null.
 * - `deckTop`: `moveToDeckTop(...args)`, after `manualDeckActionAllowed` of each `gates` entry.
 * - `move`: `moveCardBundle(...args)`, after the same check of each `gates` entry.
 * - `refuse`: no call; the Trainer board turns the card away and says why (drag.js :363-377).
 * @param {DropTarget|null} target
 * @param {Dragging} dragging
 * @param {DragState} state
 * @returns {{ kind: 'retreat'|'deckTop'|'move'|'refuse', args: any[], gates: string[] }|null}
 */
export function routeDrop(target, dragging, state) {
  if (!target || !dragging || !state || state.isSpectator) return null;
  if (target.refused) return { kind: 'refuse', args: [], gates: [] };
  // Only a bare card <img> or a zone <div> takes a drop (drag.js:298).
  if (target.kind === 'card' && target.attached) return null;
  if (target.kind === 'rail' && target.side !== dragging.side) return null;

  const dZoneId = target.zone;
  const onPlayCard = target.kind === 'card' && PLAY_ZONES.has(dZoneId);
  const targetIndex = onPlayCard ? (target.targetIndex ?? -1) : undefined;
  const targetInstanceId = onPlayCard ? target.instanceId : null;
  const attached = Boolean(dragging.attached);
  const user = dragging.side;
  const fromZone = dragging.zone;

  if (fromZone === 'active' && dZoneId === 'bench' && !attached) {
    return { kind: 'retreat', args: [user, true, target.kind === 'card' ? target.instanceId : null], gates: [] };
  }

  // The scene draws an open pile's top card on the pile, so its card (zone `discard`) dropped back
  // on that pile (`discardCover`) stays put.
  const moves = pileOf(fromZone) !== pileOf(dZoneId) || attached;
  const lands = !attached || !PLAY_ZONES.has(dZoneId) || targetIndex !== undefined;
  if (!moves || !lands) return null;

  if (dZoneId === 'deckCover') {
    return { kind: 'deckTop', args: [user, state.initiator, fromZone, dragging.index], gates: ['moveToDeck'] };
  }
  return {
    kind: 'move',
    args: [
      user,
      state.initiator,
      fromZone,
      dZoneId,
      dragging.index,
      targetIndex,
      'move',
      true,
      null,
      { moving: dragging.instanceId, target: targetInstanceId },
    ],
    gates: deckGatesFor(fromZone, dZoneId),
  };
}
