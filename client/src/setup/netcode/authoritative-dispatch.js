/**
 * @file Authoritative interaction dispatch primitive (design 003, slice 0).
 *
 * Under `systemState.serverAuthoritative`, a `server_command`-disposition action must NOT
 * run its legacy local-mutation body: the server adjudicates the action and the resulting
 * view is the only thing that renders it (design 003 §Design, O1-B). This module is the
 * shared primitive those gated call sites use — it resolves card identity from
 * `apply-view.js`'s `cardRegistry` (already server-shaped, rebuilt from every view, so no
 * legacy `zoneArrays` staleness, O2-B), then hands the action to `processAction`.
 *
 * `processAction` is injected rather than imported: it pulls in `state.js`, whose module
 * scope calls `io()` and touches `document`, which would make this file unimportable under
 * `node --test`. Same injection seam and reason as `apply-view.js`'s
 * `setDefaultNetcodeContext`.
 */

import { getCardRegistry } from './apply-view.js';
import { translateActionToCmd } from './dual-run-bridge.js';
import { soloCommandSeat } from './solo-seat.mjs';
import { DISPOSITION_TABLE } from '../../../../shared/engine/commands.mjs';
import { log } from '../../log/client-log.js';

export const NO_ROOM_MESSAGE = 'Join a room or open Solo to play.';
export const DISPATCH_MISS_MESSAGE = "That action can't be sent to the server.";

// One chat line per user action: a click can reach several dispatch calls (a board-wide zone op
// loops), so refusals inside this window share the line already posted.
const NOTICE_WINDOW_MS = 1000;

let dispatchContext = {
  processAction: null,
  systemState: null,
  notify: null,
};
let lastNoticeAt = -Infinity;

/**
 * Wires the production dependencies this module cannot statically import.
 * Only the keys present in `ctx` are updated, so callers can seed one field at a time.
 *
 * @param {object} [ctx={}]
 * @param {Function} [ctx.processAction] `(user, emit, action, parameters) => void`
 *   from `client/src/setup/general/process-action.js`.
 * @param {object} [ctx.systemState] Live `systemState` — read for `serverAuthoritative`.
 * @param {Function} [ctx.notify] `(text) => void` — posts one chat line to the player.
 */
export function setAuthoritativeDispatchContext(ctx = {}) {
  if (ctx.processAction !== undefined)
    dispatchContext.processAction = ctx.processAction;
  if (ctx.systemState !== undefined)
    dispatchContext.systemState = ctx.systemState;
  if (ctx.notify !== undefined) dispatchContext.notify = ctx.notify;
}

/**
 * Clears the injected context (room teardown, and between test cases).
 */
export function resetAuthoritativeDispatchContext() {
  dispatchContext = { processAction: null, systemState: null, notify: null };
  lastNoticeAt = -Infinity;
}

/**
 * True when this client is in a room the server runs: seated in a two-player or solo room, or
 * watching one. False before the join acknowledgement, in the Multiplayer lobby, and after a
 * leave, since each of those clears the three flags this reads.
 *
 * @param {object} [options={}] Test seam: `options.systemState`.
 * @returns {boolean}
 */
export function isInRoom(options = {}) {
  const systemState = options.systemState || dispatchContext.systemState;
  return Boolean(
    systemState?.serverAuthoritative || systemState?.solo || systemState?.isTwoPlayer
  );
}

function postNotice(text, options) {
  const now = (options.now || Date.now)();
  if (now - lastNoticeAt < NOTICE_WINDOW_MS) return;
  lastNoticeAt = now;
  const notify = options.notify || dispatchContext.notify;
  if (typeof notify === 'function') notify(text);
}

/**
 * The no-room refusal. When the client is in no room, tells the player once ("Join a room or
 * open Solo to play."), logs `dispatch.refused`, and returns true: the caller must stop, not
 * fall through to a local body. Returns false in a room, and when no `systemState` has been
 * wired (module tests; the page wires it before any action can fire).
 *
 * @param {object} [options={}] Test seams: `systemState`, `notify`, `now`; `options.action`
 *   names the refused action in the log line.
 * @returns {boolean} True when the action was refused.
 */
export function refuseWithoutRoom(options = {}) {
  const systemState = options.systemState || dispatchContext.systemState;
  if (!systemState || isInRoom(options)) return false;
  log.warn('cmd', 'dispatch.refused', {
    action: options.action ?? null,
    reason: 'no_room',
  });
  postNotice(NO_ROOM_MESSAGE, options);
  return true;
}

/**
 * The in-room gate-miss refusal for a caller with no local body to fall back on (attack,
 * retreat, pass, Stadium, ability): logs `dispatch.refused`, tells the player once, and
 * returns true so the caller stops.
 *
 * @param {string} action The action that could not be sent.
 * @param {string} reason Why: `untranslatable`, `unregistered_card`, `not_wired`.
 * @param {object} [options={}] Test seams: `notify`, `now`.
 * @returns {true}
 */
function refuseGateMiss(action, reason, options) {
  log.warn('cmd', 'dispatch.refused', { action, reason });
  postNotice(DISPATCH_MISS_MESSAGE, options);
  return true;
}

/**
 * True when gated call sites must skip their legacy local-mutation body.
 * False whenever the flag is off or no context has been wired — flag-off (legacy)
 * behavior is therefore provably unchanged (design 003 §Design step 5).
 *
 * @param {object} [options={}] Test seam: `options.systemState` overrides the injected one.
 * @returns {boolean}
 */
export function isAuthoritativeDispatchActive(options = {}) {
  const systemState = options.systemState || dispatchContext.systemState;
  return !!systemState?.serverAuthoritative;
}

/**
 * True when this client sends `user`'s actions itself: always its own side, and in a solo
 * room (design 074 D7) the far side too, since one player owns both seats there.
 *
 * @param {string} user 'self' | 'opp'
 * @param {object} [options={}] Test seam: `options.systemState`.
 * @returns {boolean}
 */
export function actsForSide(user, options = {}) {
  if (user === 'self') return true;
  const systemState = options.systemState || dispatchContext.systemState;
  return user === 'opp' && Boolean(systemState?.solo);
}

/**
 * Resolves one server `instanceId` to the card-identity hint shape the
 * `dual-run-bridge.js` translators consume (`resolveHintInstanceId` reads `.instanceId`
 * first, so a registry-sourced hint needs no syncInstance translation at all).
 *
 * Returns null when the card is not in the registry — a stale click, or a card removed by
 * a concurrent server view (design 003 edge case 1). Callers must treat null as
 * "cannot address this card", never as "address card 0".
 *
 * @param {number|string} instanceId
 * @param {object} [options={}] Test seam: `options.registry` overrides the live registry.
 * @returns {{ instanceId: number, name: string, zone: string, side: string }|null}
 */
export function buildAuthoritativeCardHint(instanceId, options = {}) {
  if (instanceId == null) return null;
  const numericId = Number(instanceId);
  if (!Number.isInteger(numericId)) return null;

  const registry = options.registry || getCardRegistry();
  const record = registry?.get?.(numericId);
  if (!record) return null;

  return {
    instanceId: numericId,
    name: record.card?.name || '',
    zone: record.zone || '',
    side: record.side || '',
  };
}

/**
 * Builds the `{ moving, target }` cardHints bundle `translateActionToCmd` expects for the
 * move/attach/evolve family. Fails closed as a unit: if any *requested* card is missing
 * from the registry, the whole bundle is null, so a caller can never send a command that
 * addresses one resolved card and one guessed one.
 *
 * `target` is optional by nature (a plain move has no target); omitting it is not a
 * failure, but passing an unresolvable one is.
 *
 * @param {{ moving?: number|string, target?: number|string }} instanceIds
 * @param {object} [options={}] Test seam: `options.registry`.
 * @returns {{ moving: object, target?: object }|null}
 */
export function buildAuthoritativeCardHints(instanceIds = {}, options = {}) {
  const moving = buildAuthoritativeCardHint(instanceIds.moving, options);
  if (!moving) return null;

  const hints = { moving };

  if (instanceIds.target != null) {
    const target = buildAuthoritativeCardHint(instanceIds.target, options);
    if (!target) return null;
    hints.target = target;
  }

  return hints;
}

/**
 * Sends a `server_command` action to the server without running its legacy local body.
 *
 * Returns false without emitting whenever the command cannot be built: no `processAction`
 * wired, or `translateActionToCmd` yields null for this action/parameters pair. A false
 * return means "this action was not dispatched"; a call site that still has a local body
 * (the zone ops) falls through to it, and one that has none refuses (`failClosed` on
 * `dispatchAuthoritativeAction`). (Design 003 slice 0, design 090.)
 *
 * With the client in no room it returns **true** after refusing (`refuseWithoutRoom`): the
 * return value means "the caller must stop", whether the command was sent or refused.
 *
 * One exception to failing open: `translateActionToCmd` throws in dev-like environments for
 * an action with no `DISPOSITION_TABLE` entry (its own edge case 14 — an unclassified action
 * "must never silently no-op"). That throw is deliberately not caught here; a missing
 * classification is a build-time bug, not a runtime fallback.
 *
 * `pushAction` relaying lives inside `processAction` and is untouched by this path
 * (design 003 §Constraints, edge case 8).
 *
 * @param {string} action Legacy action name, e.g. `'moveCardBundle'`.
 * @param {any[]} parameters Parameters exactly as the legacy call site would have passed
 *   them to `processAction`, with registry-sourced hints already in place.
 * @param {object} [options={}] `options.user` ('self' | 'opp', default 'self'): the side
 *   acting, which a solo room turns into the command's seat. Test seams:
 *   `options.processAction`, `options.translate`.
 * @returns {boolean} True when the action was handed to `processAction`, or refused for want
 *   of a room — either way the caller stops.
 */
export function emitAuthoritativeCommand(
  action,
  parameters = [],
  options = {}
) {
  if (!action || typeof action !== 'string') return false;
  if (refuseWithoutRoom({ ...options, action })) return true;

  const processAction = options.processAction || dispatchContext.processAction;
  if (typeof processAction !== 'function') return false;

  const translate = options.translate || translateActionToCmd;
  const user = options.user === 'opp' ? 'opp' : 'self';
  // The seat processAction will translate for: a solo room holds one instance map per seat,
  // so a seatless check cannot resolve a syncInstance the send itself can.
  const systemState = options.systemState || dispatchContext.systemState;
  const seat = soloCommandSeat({ ...systemState, user });
  if (!translate(action, parameters, { seat })) return false;

  processAction(user, true, action, parameters);
  return true;
}

/**
 * Reads a server `instanceId` off a DOM element rendered by `apply-view.js`
 * (`createOrUpdateCardElement` stamps `img.dataset.instanceId`; `placeCardInZone`
 * stamps the same value on a play-container). Walks up to the nearest
 * `[data-instance-id]` ancestor so a holo wrapper or play-container click target
 * still resolves to the card it wraps.
 *
 * Returns null for a legacy-rendered card (no stamp at all) — the gated call site
 * then falls through to its legacy body, per the fail-open contract.
 *
 * @param {object|null} element DOM element (or any object exposing `dataset`/`closest`).
 * @returns {number|null}
 */
export function readCardInstanceId(element) {
  if (!element) return null;

  let raw = element.dataset?.instanceId;
  if (raw == null && typeof element.closest === 'function') {
    raw = element.closest('[data-instance-id]')?.dataset?.instanceId;
  }
  if (raw == null || raw === '') return null;

  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

/**
 * The `moveCardBundle` gate (design 003 slice 1) — the whole decision, extracted so it
 * is unit-testable: `move-card-bundle.js` itself imports `state.js` and cannot be
 * loaded under `node --test`.
 *
 * Returns true when the action was handed to the server, or refused because the client is in
 * no room (`refuseWithoutRoom`). A true return is the caller's instruction to skip its legacy
 * local-mutation body entirely (`moveCard`, `moveCardMessage`, the rules-bridge dispatch).
 * Every false path — relayed mirror-apply, a card this client cannot identify from the
 * authoritative registry, an untranslatable action — leaves the caller running the kept
 * local body.
 *
 * Scope, deliberately tight: only a locally-initiated action on this client's own side
 * (`user === 'self'`, or either side in a solo room — `actsForSide`; `emit` true, no
 * incoming relay `cardHints`) is gated. A relayed
 * opponent action still runs its legacy mirror body; suppressing *that* is a
 * relay-layer question that applies identically to every action family, not a
 * `moveCardBundle` one (see ISSUES I21).
 *
 * @param {object} params
 * @param {string} params.user 'self' | 'opp' — whose zone is being acted on.
 * @param {boolean} params.emit True for a fresh local UI action.
 * @param {object|null} params.cardHints Relay hints, if this call is a mirror replay.
 * @param {string} params.oZoneId Origin zone id.
 * @param {string} params.dZoneId Destination zone id.
 * @param {number|boolean} params.index Legacy origin index (relayed verbatim; the server
 *   addresses the card by instanceId, so this is carried only for the mirror relay).
 * @param {number|boolean} params.targetIndex Legacy destination index, same caveat.
 * @param {string} params.action Action type: 'move' | 'attach' | 'evolve'.
 * @param {{ moving?: number|string, target?: number|string }} [params.authoritativeIds]
 *   Server instanceIds captured at the interaction site (`readCardInstanceId`).
 * @param {object} [options={}] Test seams: `systemState`, `registry`, `processAction`,
 *   `translate`.
 * @returns {boolean} True when dispatched — caller must skip its legacy body.
 */
/**
 * The zone-op family gate (design 003 slice 2): `shuffleIntoDeck`, `moveToDeckTop`,
 * `switchWithDeckTop`, `shuffleZone`, `shuffleBottom`, `discardAll`, `lostZoneAll`,
 * `handAll`, `leaveAll`, `shuffleAll`, `discardAndDraw`, `shuffleAndDraw`,
 * `shuffleBottomAndDraw`, `shufflePrizesToDeckBottom`.
 *
 * Unlike `moveCardBundle`, none of these legacy actions ever attached a cardHint — the
 * `dual-run-bridge.js` translators for this whole family address by zone id / position and
 * let the server resolve against its own zone array (shuffles are always server-rolled via
 * `activeRng`, never the client's indices). So there is no registry lookup here at all: the
 * gate just forwards the same `[oInitiator, ...commandArgs]` shape the legacy call site
 * already builds for its own `processAction` call, unchanged.
 *
 * Same scope as `dispatchAuthoritativeMoveCardBundle`: only a locally-initiated call
 * (`user === 'self'`, `emit` true) is gated; a relayed mirror-apply (`emit` false) or, in a
 * room, an untranslatable action falls through to the kept local body (design 090 Options 3).
 * With the client in no room a local call is refused instead: one chat line, return true.
 *
 * @param {string} action Legacy action name, e.g. `'shuffleZone'`.
 * @param {object} params
 * @param {string} params.user 'self' | 'opp'.
 * @param {boolean} params.emit
 * @param {string} params.oInitiator Precomputed opposite-initiator, as every zone-op call
 *   site already does before its `processAction` call.
 * @param {any[]} params.commandArgs Action-specific args after `oInitiator`, in the exact
 *   order the legacy call site already passes to its own `processAction`.
 * @param {object} [options={}] Test seams: `systemState`, `processAction`, `translate`.
 * @returns {boolean} True when dispatched — caller must skip its legacy body.
 */
export function dispatchAuthoritativeZoneOp(action, params = {}, options = {}) {
  const { user, emit, oInitiator, commandArgs = [] } = params;

  return dispatchAuthoritativeAction(
    action,
    { user, emit, commandArgs: [oInitiator, ...commandArgs] },
    options
  );
}

/**
 * The generic gate for a `server_command` action whose parameter list carries no card
 * identity at all (design 003 slice 5): `attack`, `retreat`, `stadium-effect`.
 *
 * Unlike the zone-op family, these call sites do **not** prefix their `processAction`
 * parameters with `oInitiator` — `attack` sends `[attackIndex, rngBundle]`, `retreat`
 * sends `[]`, `stadium-effect` sends `[payload]` — so `commandArgs` is forwarded verbatim,
 * exactly as the legacy call site already builds it. The server resolves the acting
 * Pokemon itself (its own `active` zone), which is why no registry lookup is needed here.
 *
 * Same scope as every other gate in this module: only a locally-initiated call
 * (`user === 'self'`, `emit` true) is gated; a relayed mirror-apply (`emit` false) returns
 * false. With the client in no room a local call is refused (design 090): one chat line,
 * return true, the caller stops. In a room an untranslatable action returns false so a call
 * site with a local body falls through to it, unless `params.failClosed` — for a caller with
 * no body to fall back on — which logs `dispatch.refused`, tells the player once and
 * returns true.
 *
 * @param {string} action Legacy action name, e.g. `'attack'`.
 * @param {object} params
 * @param {string} params.user 'self' | 'opp'.
 * @param {boolean} params.emit
 * @param {any[]} params.commandArgs Parameters in the exact order the legacy call site
 *   already passes to its own `processAction`.
 * @param {boolean} [params.failClosed=false] Refuse on a gate miss in a room.
 * @param {object} [options={}] Test seams: `systemState`, `processAction`, `translate`,
 *   `notify`, `now`.
 * @returns {boolean} True when dispatched or refused — caller must stop, not run a local body.
 */
export function dispatchAuthoritativeAction(action, params = {}, options = {}) {
  const { user, emit, commandArgs = [], failClosed = false } = params;

  if (emit && refuseWithoutRoom({ ...options, action })) return true;
  if (!isAuthoritativeDispatchActive(options)) return false;
  if (!actsForSide(user, options) || !emit) return false;

  const sent = emitAuthoritativeCommand(action, commandArgs, { ...options, user });
  if (!sent && failClosed) return refuseGateMiss(action, 'not_dispatched', options);
  return sent;
}

/**
 * The `useAbility` gate (design 003 slice 5).
 *
 * `useAbility` is the one action in this family that addresses a specific card, and its
 * legacy hint (`buildCardHint(zone.array[resolved])`) is built from the legacy zone array,
 * which is empty under authoritative rendering — the same trap slice 1 hit with legacy
 * indices. So identity is captured at the interaction site instead
 * (`mouseClick.cardInstanceId`, stamped by `readCardInstanceId` in `click-events.js`) and
 * resolved here against the authoritative `cardRegistry`.
 *
 * The parameter list matches the legacy `[oInitiator, zoneId, resolved, hint]` shape the
 * `dual-run-bridge.js` `useAbility` translator already consumes via its
 * `parameters[0] is a user string` branch, so no translator change is needed. `resolved`
 * (the legacy index) is carried through for the mirror relay only; the server addresses
 * the card by the hint's `instanceId`.
 *
 * When the card is not in the registry (a stale click, or a card removed by a concurrent
 * view) it returns false so a call site with a local body runs it; `params.failClosed` — for
 * a caller with no body — logs `dispatch.refused`, tells the player once and returns true.
 * With the client in no room a local call is refused and returns true (design 090).
 *
 * @param {object} params
 * @param {string} params.user 'self' | 'opp'.
 * @param {boolean} params.emit
 * @param {object|null} params.incomingHint Relay hint, if this call is a mirror replay.
 * @param {string} params.oInitiator Precomputed opposite-initiator.
 * @param {string} params.zoneId Zone the ability's card sits in.
 * @param {number|boolean} params.index Legacy resolved index (relayed verbatim).
 * @param {number|string|null} params.authoritativeId Server instanceId captured at the
 *   interaction site.
 * @param {boolean} [params.failClosed=false] Refuse on a gate miss in a room.
 * @param {object} [options={}] Test seams: `systemState`, `registry`, `processAction`,
 *   `translate`, `notify`, `now`.
 * @returns {boolean} True when dispatched or refused — caller must stop.
 */
export function dispatchAuthoritativeUseAbility(params = {}, options = {}) {
  const {
    user,
    emit,
    incomingHint,
    oInitiator,
    zoneId,
    index,
    authoritativeId,
    failClosed = false,
  } = params;

  if (emit && !incomingHint && refuseWithoutRoom({ ...options, action: 'useAbility' })) {
    return true;
  }
  if (!isAuthoritativeDispatchActive(options)) return false;
  if (!actsForSide(user, options) || !emit) return false;
  if (incomingHint) return false;

  const hint = buildAuthoritativeCardHint(authoritativeId, options);
  if (!hint) {
    return failClosed ? refuseGateMiss('useAbility', 'unregistered_card', options) : false;
  }

  const sent = emitAuthoritativeCommand(
    'useAbility',
    [oInitiator, zoneId, index, hint],
    { ...options, user }
  );
  if (!sent && failClosed) return refuseGateMiss('useAbility', 'not_dispatched', options);
  return sent;
}

/**
 * The relay-mirror suppression gate (design 003, closing I21).
 *
 * `acceptAction('opp', ...)` replays every relayed peer action through its legacy
 * local-mutation body regardless of `serverAuthoritative` — under the flag the server's own
 * view (`applyView`) already renders that action, so running the legacy mirror body too
 * double-renders the opponent's move. This is a relay-layer decision, unlike the gates
 * above: it applies identically to every `server_command`/`manual_override` action, not one
 * family at a time, so it lives in `accept-action.js` (the one place every relayed action
 * passes through) rather than at each call site.
 *
 * Every other disposition (`server_lifecycle`, `replaced_by_protocol`,
 * `replaced_by_redaction`, `ui_local`, `announcement_only`, ...) has no server-view
 * equivalent and must still run its legacy body for the mirror to reflect it at all — an
 * action absent from `DISPOSITION_TABLE` is treated as not suppressed (fail open, same
 * contract as the rest of this module).
 *
 * @param {string} actionName Legacy action name as `acceptAction` resolves it.
 * @returns {boolean} True when the relay mirror must skip its legacy body.
 */
export function isMirrorSuppressedAction(actionName) {
  const entry = DISPOSITION_TABLE[actionName];
  if (!entry) return false;
  return entry.disposition === 'server_command' || entry.disposition === 'manual_override';
}

export function dispatchAuthoritativeMoveCardBundle(params = {}, options = {}) {
  const {
    user,
    emit,
    cardHints,
    oZoneId,
    dZoneId,
    index,
    targetIndex,
    action,
    authoritativeIds,
  } = params;

  if (emit && !cardHints && refuseWithoutRoom({ ...options, action: 'moveCardBundle' })) {
    return true;
  }
  if (!isAuthoritativeDispatchActive(options)) return false;
  if (!actsForSide(user, options) || !emit) return false;
  if (cardHints) return false;

  const hints = buildAuthoritativeCardHints(authoritativeIds || {}, options);
  if (!hints) return false;

  // `moveCardBundle`'s own relay flips the user before sending, so the mirror applies
  // the move to its copy of the right side. Mirror that exactly.
  const oInitiator = user === 'self' ? 'opp' : 'self';

  return emitAuthoritativeCommand(
    'moveCardBundle',
    [oInitiator, oZoneId, dZoneId, index, targetIndex, action, hints],
    { ...options, user }
  );
}
