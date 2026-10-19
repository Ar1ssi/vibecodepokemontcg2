// Design 074 D2: a server view as pure placement data for the three.js board.
// Every "what to show" decision reproduces apply-view.js (createOrUpdateCardElement,
// placeCardInZone, layoutCardStack, reconcilePlacedCard, reconcileZoneCover,
// reconcileStadium) with the same pure helpers, so the scene and the DOM board agree.

import { isPokemon } from '../../../../shared/engine/cards.mjs';
import { topPokemonCard } from '../../../../shared/engine/rules/evolved-pokemon.mjs';
import { listConditions } from '../../../../shared/engine/rules/special-conditions.mjs';
import { computeHandStacks } from '../../../../shared/engine/zones/hand-stack.mjs';
import {
  ENERGY_TOKEN_BOTTOM,
  planEnergyTokenRow,
} from '../../actions/move-card-bundle/energy-token-row.mjs';
import {
  getEnergyTokenFront,
  isDoubleEnergyToken,
  isEnergyCard,
} from '../../actions/move-card-bundle/energy-token-assets.mjs';
import { deckStackLayers } from '../zones/deck-stack.mjs';

/** Zones carried as card arrays in a view, in the order placements are listed. */
export const CARD_ZONES = ['active', 'bench', 'hand', 'prizes', 'discard', 'lostZone', 'board'];
const PLAY_ZONES = ['active', 'bench'];
const SIDES = ['self', 'opp'];

// apply-view.js ATTACHED_CARD_SHIFT / UNDER_POKEMON_SHIFT, in card widths.
export const ATTACHED_CARD_SHIFT = 1 / 6;
export const UNDER_POKEMON_SHIFT = 1 / 15;

/**
 * @typedef {'active'|'bench'|'hand'|'prizes'|'discard'|'lostZone'|'board'} ZoneId
 * @typedef {{ src:string, double:boolean, left:number, size:number, bottom:number, zIndex:number }} EnergyToken
 *   `left`/`size` in card widths from the visible card's left edge, `bottom` in card heights
 *   (planEnergyTokenRow at width 1, ENERGY_TOKEN_BOTTOM); `zIndex` as apply-view stamps it.
 * @typedef {{ left:number, label:string, fontSize:number, zIndex:number }} EnergyBadge
 *   "Nx" badge past four tokens; `left`/`fontSize` in card widths.
 * @typedef {{ instanceId:number, side:'self'|'opp', zone:ZoneId, index:number,
 *   face:'front'|'back', src:string|null, name:string, backSrc:string,
 *   role:'root'|'stage'|'tool'|'energy', host:number|null, stackIndex:number,
 *   stackOffset:[number, number],
 *   energyToken:EnergyToken|null, energyBadges:EnergyBadge[], rotation:0|90|180|270,
 *   damage:number, conditions:string[], poison:boolean, burn:boolean, abilityUsed:boolean,
 *   glow:string|null, selected:boolean, matPick:'idle'|'picked'|null, hidden:boolean }} Placement
 *   `stackOffset` = [right, up] in card widths from the host slot (Stage peeks above at 1/15,
 *   Tools fan right at 1/6). Overlay fields (damage…abilityUsed, energyBadges) sit on the
 *   stack's visible card only, as apply-view draws them over the visible card.
 * @typedef {{ count:number, sleeve:string, layers:number }} DeckPile
 * @typedef {{ count:number, top:Placement|null }} OpenPile
 * @typedef {{ deck:DeckPile, discard:OpenPile, lostZone:OpenPile,
 *   prizes:{ count:number, faceUp:number[] } }} SidePiles
 * @typedef {{ instanceId:number, src:string|null, name:string, facing:'self'|'opp' }} StadiumPlacement
 * @typedef {{ version:number, nearSeat:string, placements:Placement[],
 *   piles:{ self:SidePiles, opp:SidePiles }, stadium:StadiumPlacement|null,
 *   handStacks:{ self:number[][], opp:number[][] } }} BoardModel
 * @typedef {{ selected:Set<number>, glows:Map<number,string>,
 *   matPick:Map<number,'idle'|'picked'>, hidden:Set<number> }} UiState
 */

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const emptySidePiles = () => ({
  deck: { count: 0, sleeve: '', layers: 0 },
  discard: { count: 0, top: null },
  lostZone: { count: 0, top: null },
  prizes: { count: 0, faceUp: [] },
});

/** @type {BoardModel} */
export const EMPTY_MODEL = deepFreeze({
  version: 0,
  nearSeat: 'you',
  placements: [],
  piles: { self: emptySidePiles(), opp: emptySidePiles() },
  stadium: null,
  handStacks: { self: [], opp: [] },
});

/** @type {UiState} */
export const EMPTY_UI_STATE = Object.freeze({
  selected: new Set(),
  glows: new Map(),
  matPick: new Map(),
  hidden: new Set(),
});

class InvalidView extends Error {}

const fail = (reason) => {
  throw new InvalidView(reason);
};

const hasInstanceId = (card) => typeof card?.instanceId === 'number';
const isRedacted = (card) => !card.name && !card.src;

/**
 * The near and far players of an owner view (`you`/`them`) or a spectator view (`players`).
 * @returns {{ near:object|null, far:object|null, nearSeat:string }}
 */
function seatsOf(view, nearPlayerId) {
  if (view.you && typeof view.you === 'object') {
    return { near: view.you, far: view.them || null, nearSeat: 'you' };
  }
  if (view.players && typeof view.players === 'object') {
    const ids = Object.keys(view.players);
    if (ids.length === 0) fail('spectator view has no players');
    const nearId = nearPlayerId != null && view.players[nearPlayerId] ? nearPlayerId : ids[0];
    const farId = ids.find((id) => id !== nearId);
    return {
      near: view.players[nearId],
      far: farId ? view.players[farId] : null,
      nearSeat: nearId,
    };
  }
  return fail('view has neither you/them nor players');
}

function zoneCards(player, zoneId) {
  const list = player?.zones?.[zoneId];
  if (list == null) return [];
  if (!Array.isArray(list)) fail(`zone ${zoneId} is not an array`);
  for (const card of list) if (!hasInstanceId(card)) fail(`card in ${zoneId} has no instanceId`);
  return list;
}

/** Back unless the viewer may see the face, as view.mjs's redaction and the client hand rule decide. */
function faceOf(card, side, zoneId, player) {
  if (isRedacted(card)) return 'back';
  if (card.faceDown && !card.revealed) return 'back';
  if (zoneId === 'prizes' && !card.revealed && !player?.flags?.prizesFaceUp) return 'back';
  // Spectators receive both hands; the far hand still shows backs unless revealed.
  if (zoneId === 'hand' && side === 'opp' && !card.revealed) return 'back';
  return 'front';
}

/** Server `rotation` (reduce.mjs rotateCardCommand), snapped to a quarter turn. */
function quarterTurn(rotation) {
  const degrees = Number(rotation);
  if (!Number.isFinite(degrees)) return 0;
  return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/**
 * The root a card stacks under: walks `attachedTo` up (evolutions attach under the Basic,
 * D40) within the zone, like apply-view's attachmentHostRecord. Null = the card is a root.
 */
function hostOf(card, byId) {
  if (card.attachedTo == null) return null;
  const visited = new Set([card.instanceId]);
  let current = byId.get(card.attachedTo);
  while (current && current.attachedTo != null && !visited.has(current.instanceId)) {
    visited.add(current.instanceId);
    current = byId.get(current.attachedTo);
  }
  if (!current || current.attachedTo != null) return null;
  return current.instanceId;
}

function basePlacement(card, side, zoneId, index, player, ctx) {
  const face = faceOf(card, side, zoneId, player);
  const id = card.instanceId;
  return {
    instanceId: id,
    side,
    zone: zoneId,
    index,
    face,
    src: face === 'front' ? card.src || null : null,
    name: face === 'front' ? card.name || '' : '',
    backSrc: ctx.backSrc[side],
    role: 'root',
    host: null,
    stackIndex: 0,
    stackOffset: [0, 0],
    energyToken: null,
    energyBadges: [],
    rotation: 0,
    damage: 0,
    conditions: [],
    poison: false,
    burn: false,
    abilityUsed: false,
    glow: ctx.uiState.glows?.get?.(id) ?? null,
    selected: Boolean(ctx.uiState.selected?.has?.(id)),
    matPick: ctx.uiState.matPick?.get?.(id) ?? null,
    hidden: Boolean(ctx.uiState.hidden?.has?.(id)),
  };
}

function setOverlays(placement, root, visibleCard) {
  if (placement.face === 'back') return;
  const conditions = listConditions(root);
  placement.damage = typeof root.damage === 'number' && root.damage > 0 ? root.damage : 0;
  placement.conditions = conditions;
  placement.poison = conditions.includes('Poisoned');
  placement.burn = conditions.includes('Burned');
  placement.abilityUsed = Boolean(root.abilityUsed || visibleCard.abilityUsed);
}

/**
 * One in-play Pokémon's stack (layoutCardStack): the highest Stage is visible; the other
 * Pokémon peek out under it, the one attached last closest; Tools (and token-less Energy)
 * fan out to the right in view order; Energy with a token sits in the token row.
 */
function layoutStack(root, attached, placementOf) {
  const members = [root, ...attached];
  const top = topPokemonCard(members, root);
  const others = members.filter((card) => card !== top && isPokemon(card));
  if (!isPokemon(root) && root !== top && !others.includes(root)) others.unshift(root);
  const topIndex = others.length;

  others.forEach((card, i) => {
    const placement = placementOf(card);
    placement.stackIndex = i;
    placement.stackOffset = [0, (topIndex - i) * UNDER_POKEMON_SHIFT];
  });
  placementOf(top).stackIndex = topIndex;

  const tools = [];
  const energy = [];
  for (const card of attached) {
    if (card === top || isPokemon(card)) continue;
    const tokenSrc = isEnergyCard(card) ? getEnergyTokenFront(card) : null;
    if (tokenSrc) energy.push({ card, tokenSrc });
    else tools.push(card);
  }

  tools.forEach((card, i) => {
    const placement = placementOf(card);
    placement.role = 'tool';
    placement.stackIndex = topIndex + 1 + i;
    placement.stackOffset = [(i + 1) * ATTACHED_CARD_SHIFT, 0];
  });

  const row = planEnergyTokenRow(
    energy.map((entry) => entry.tokenSrc),
    1
  );
  energy.forEach(({ card, tokenSrc }, i) => {
    const placement = placementOf(card);
    placement.role = 'energy';
    placement.stackIndex = topIndex + 1 + tools.length + i;
    placement.energyToken = {
      src: tokenSrc,
      double: isDoubleEnergyToken(card),
      left: row.tokens[i].left,
      size: row.tokenSize,
      bottom: ENERGY_TOKEN_BOTTOM,
      zIndex: row.tokens[i].zIndex,
    };
  });

  const visible = placementOf(top);
  setOverlays(visible, root, top);
  visible.energyBadges = row.badges.map((badge) => ({ ...badge }));
  const rotation = quarterTurn(root.rotation);
  for (const card of members) placementOf(card).rotation = rotation;
}

/** The hand in the order the page renders it (apply-view's `sortZoneCards`); view order otherwise. */
function handOrder(cards, side, ctx) {
  let sorted = null;
  try {
    sorted = ctx.sortHand?.(side, cards);
  } catch {
    sorted = null;
  }
  return Array.isArray(sorted) && sorted.length === cards.length ? sorted : cards;
}

function sideZonePlacements(player, side, ctx) {
  const placements = [];
  for (const zoneId of CARD_ZONES) {
    const cards = zoneId === 'hand' ? handOrder(zoneCards(player, zoneId), side, ctx) : zoneCards(player, zoneId);
    const byId = new Map(cards.map((card) => [card.instanceId, card]));
    const zonePlacements = new Map();
    cards.forEach((card, index) => {
      zonePlacements.set(card.instanceId, basePlacement(card, side, zoneId, index, player, ctx));
    });
    const placementOf = (card) => zonePlacements.get(card.instanceId);

    const attachedByRoot = new Map();
    for (const card of cards) {
      const host = PLAY_ZONES.includes(zoneId) ? hostOf(card, byId) : null;
      if (host == null) continue;
      const placement = placementOf(card);
      placement.host = host;
      placement.role = isPokemon(card) ? 'stage' : 'tool';
      if (!attachedByRoot.has(host)) attachedByRoot.set(host, []);
      attachedByRoot.get(host).push(card);
    }

    for (const card of cards) {
      if (placementOf(card).host != null) continue;
      if (PLAY_ZONES.includes(zoneId)) {
        layoutStack(card, attachedByRoot.get(card.instanceId) || [], placementOf);
      } else {
        const placement = placementOf(card);
        setOverlays(placement, card, card);
        placement.rotation = quarterTurn(card.rotation);
      }
    }
    // Roots before attachments, each group in view order (placeCardInZone).
    const ordered = [...zonePlacements.values()];
    placements.push(
      ...ordered.filter((p) => p.host == null),
      ...ordered.filter((p) => p.host != null)
    );
  }
  return placements;
}

function openPile(placements, side, zoneId) {
  const inZone = placements.filter((p) => p.side === side && p.zone === zoneId);
  const top = inZone.reduce((best, p) => (best && best.index > p.index ? best : p), null);
  return { count: inZone.length, top };
}

function sidePiles(player, side, placements, ctx) {
  const deckCount = Math.max(0, Number(player?.zones?.deck?.count) || 0);
  const prizes = placements.filter((p) => p.side === side && p.zone === 'prizes');
  return {
    deck: { count: deckCount, sleeve: ctx.backSrc[side], layers: deckStackLayers(deckCount) },
    discard: openPile(placements, side, 'discard'),
    lostZone: openPile(placements, side, 'lostZone'),
    prizes: {
      count: prizes.length,
      faceUp: prizes.filter((p) => p.face === 'front').map((p) => p.instanceId),
    },
  };
}

/**
 * Duplicate hand cards grouped exactly as hand-stack-dom.js does: a back-face card never
 * stacks, the key is the trimmed name plus the printing (computeHandStacks).
 */
function handStacksFor(placements, side, cardsById) {
  const hand = placements
    .filter((p) => p.side === side && p.zone === 'hand')
    .sort((a, b) => a.index - b.index);
  const descriptors = hand.map((p) => {
    const card = cardsById.get(p.instanceId) || {};
    const hidden = p.face === 'back';
    return {
      instanceId: p.instanceId,
      name: hidden ? '' : String(card.name || '').trim(),
      id: card.id,
      set: card.set,
      number: card.number,
      src: p.src || '',
      isHidden: hidden,
    };
  });
  return computeHandStacks(descriptors, { isHidden: (d) => d.isHidden }).map((group) =>
    group.cards.map((item) => item.card.instanceId)
  );
}

function stadiumOf(stadium, localPlayerId) {
  if (!stadium) return null;
  if (!hasInstanceId(stadium)) fail('stadium has no instanceId');
  const ownerId = stadium.ownerId || stadium.playerId || null;
  return {
    instanceId: stadium.instanceId,
    src: stadium.src || null,
    name: stadium.name || '',
    facing: ownerId && localPlayerId && ownerId !== localPlayerId ? 'opp' : 'self',
  };
}

/**
 * @param {object} view owner view (`you`/`them`) or spectator view (`players`)
 * @param {{ selfPlayerId?: string|null, cardBackSrcFor?: (side:'self'|'opp') => string,
 *   uiState?: UiState, previous?: BoardModel|null, nearPlayerId?: string|null,
 *   sortHand?: (side:'self'|'opp', cards: object[]) => object[],
 *   onInvalid?: (reason:string) => void }} [options]
 *   `sortHand` reorders a hand as the page renders it (the deck-list sort); it must not mutate.
 * @returns {BoardModel} `previous ?? EMPTY_MODEL` when the view is malformed (never throws)
 */
export function boardModelFrom(
  view,
  {
    selfPlayerId = null,
    cardBackSrcFor = () => '',
    uiState = EMPTY_UI_STATE,
    previous = null,
    nearPlayerId = null,
    sortHand = null,
    onInvalid,
  } = {}
) {
  try {
    if (!view || typeof view !== 'object') fail('view is empty');
    const { near, far, nearSeat } = seatsOf(view, nearPlayerId);
    const ctx = {
      sortHand,
      uiState: uiState || EMPTY_UI_STATE,
      backSrc: {
        self: String(cardBackSrcFor?.('self') ?? ''),
        opp: String(cardBackSrcFor?.('opp') ?? ''),
      },
    };
    const players = { self: near, opp: far };
    const placements = SIDES.flatMap((side) => sideZonePlacements(players[side], side, ctx));

    const cardsById = new Map();
    for (const side of SIDES) {
      for (const zoneId of CARD_ZONES) {
        for (const card of zoneCards(players[side], zoneId)) cardsById.set(card.instanceId, card);
      }
    }
    const seen = new Set();
    for (const p of placements) {
      if (seen.has(p.instanceId)) fail(`instanceId ${p.instanceId} appears twice`);
      seen.add(p.instanceId);
    }

    return {
      version: Number(view.stateVersion) || 0,
      nearSeat,
      placements,
      piles: {
        self: sidePiles(near, 'self', placements, ctx),
        opp: sidePiles(far, 'opp', placements, ctx),
      },
      stadium: stadiumOf(view.stadium, selfPlayerId ?? near?.playerId ?? null),
      handStacks: {
        self: handStacksFor(placements, 'self', cardsById),
        opp: handStacksFor(placements, 'opp', cardsById),
      },
    };
  } catch (error) {
    if (!(error instanceof InvalidView)) throw error;
    onInvalid?.(error.message);
    return previous ?? EMPTY_MODEL;
  }
}

const indexCache = new WeakMap();

function indexOf(model) {
  if (!model || typeof model !== 'object') return new Map();
  let index = indexCache.get(model);
  if (!index) {
    index = new Map((model.placements || []).map((p) => [p.instanceId, p]));
    indexCache.set(model, index);
  }
  return index;
}

/** @returns {Placement|null} */
export function placementById(model, instanceId) {
  return indexOf(model).get(instanceId) ?? null;
}

const MOVE_FIELDS = ['side', 'zone', 'index', 'host', 'stackIndex'];
const STYLE_FIELDS = [
  'face',
  'src',
  'name',
  'backSrc',
  'role',
  'damage',
  'poison',
  'burn',
  'abilityUsed',
  'rotation',
  'glow',
  'selected',
  'matPick',
  'hidden',
];

const sameArray = (a, b) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function wasMoved(a, b) {
  return (
    MOVE_FIELDS.some((field) => a[field] !== b[field]) || !sameArray(a.stackOffset, b.stackOffset)
  );
}

function wasRestyled(a, b) {
  return (
    STYLE_FIELDS.some((field) => a[field] !== b[field]) ||
    !sameArray(a.conditions, b.conditions) ||
    !sameJson(a.energyToken, b.energyToken) ||
    !sameJson(a.energyBadges, b.energyBadges)
  );
}

const pileKey = (pile) => ({
  ...pile,
  top: pile?.top ? { id: pile.top.instanceId, src: pile.top.src, face: pile.top.face } : null,
});

function pilesKey(piles) {
  const key = {};
  for (const side of SIDES) {
    const sidePile = piles?.[side];
    key[side] = sidePile && {
      deck: sidePile.deck,
      discard: pileKey(sidePile.discard),
      lostZone: pileKey(sidePile.lostZone),
      prizes: sidePile.prizes,
    };
  }
  return key;
}

/**
 * @param {BoardModel|null} prev
 * @param {BoardModel} next
 * @returns {{ added:Set<number>, removed:Set<number>, moved:Set<number>, restyled:Set<number>,
 *   pilesChanged:boolean, stadiumChanged:boolean, handStacksChanged:boolean }}
 */
export function diffModels(prev, next) {
  const before = prev || EMPTY_MODEL;
  const after = next || EMPTY_MODEL;
  const beforeIndex = indexOf(before);
  const afterIndex = indexOf(after);
  const added = new Set();
  const removed = new Set();
  const moved = new Set();
  const restyled = new Set();

  for (const [id, placement] of afterIndex) {
    const old = beforeIndex.get(id);
    if (!old) {
      added.add(id);
      continue;
    }
    if (wasMoved(old, placement)) moved.add(id);
    if (wasRestyled(old, placement)) restyled.add(id);
  }
  for (const id of beforeIndex.keys()) if (!afterIndex.has(id)) removed.add(id);

  return {
    added,
    removed,
    moved,
    restyled,
    pilesChanged: !sameJson(pilesKey(before.piles), pilesKey(after.piles)),
    stadiumChanged: !sameJson(before.stadium, after.stadium),
    handStacksChanged: !sameJson(before.handStacks, after.handStacks),
  };
}
