// Design 069: an attack that damages several Pokémon reaches each of them. Pure layout: which
// card the move scene plays against (primary), and when each other card's hit lands (a ripple
// outward from the primary). DOM-free; combat.js measures the cards and drives the overlays.

export const HIT_STEP_MS = 80;
export const HIT_SPREAD_MAX_MS = 400;
export const MAX_BRANCH_LANES = 5;

const centreOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

const distance = (a, b) => {
  const p = centreOf(a);
  const q = centreOf(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

const isRect = (rect) =>
  rect != null && [rect.left, rect.top, rect.width, rect.height].every((value) => Number.isFinite(value));

/**
 * @param {{id: *, rect: {left:number, top:number, width:number, height:number}, amount: number,
 *   isDefender?: boolean}[]} targets - the attack's hits that can be drawn (heals already dropped)
 * @returns {{primaryId: *, secondaries: {id: *, delayMs: number, lane: boolean}[]}|null}
 *   null when there is no target; the primary is the hit Active defender, else the most damaged
 *   card (ties: first); the rest ripple outward, nearest to the primary first
 */
export function layoutHits(targets) {
  const usable = Array.isArray(targets) ? targets.filter((target) => target && isRect(target.rect)) : [];
  if (usable.length === 0) return null;
  const primary =
    usable.find((target) => target.isDefender && target.amount > 0) ??
    usable.reduce((best, target) => (target.amount > best.amount ? target : best));
  const secondaries = usable
    .filter((target) => target !== primary)
    .map((target, index) => ({ target, index, away: distance(target.rect, primary.rect) }))
    .sort((a, b) => a.away - b.away || a.index - b.index)
    .map(({ target }, order) => ({
      id: target.id,
      delayMs: Math.min(HIT_STEP_MS * (order + 1), HIT_SPREAD_MAX_MS),
      lane: order < MAX_BRANCH_LANES,
    }));
  return { primaryId: primary.id, secondaries };
}

/** The strike context's `hitDelays` as an id-keyed map (object keys are strings). */
export const hitDelaysOf = (layout) =>
  Object.fromEntries((layout?.secondaries ?? []).map((secondary) => [String(secondary.id), secondary.delayMs]));

/** How long after the contact `id`'s hit lands: its ripple delay, else 0. */
export const hitDelayFor = (ctx, id) => {
  const delay = ctx?.hitDelays?.[String(id)];
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
};

/**
 * How long from `now` until a hit lands: `delayMs` after the attack's contact (`contactAt`, same
 * clock as `now`), never negative. Without a known contact the delay counts from now.
 */
export const hitWaitMs = (contactAt, delayMs, now) => {
  const delay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
  if (!Number.isFinite(contactAt) || !Number.isFinite(now)) return delay;
  return Math.max(0, contactAt + delay - now);
};

/**
 * The push a recoiling card takes, in its own frame's px: `magnitude` along the attacker -> card
 * direction on screen, turned back by the card frame's rotation (`turnDeg`, the opponent's board
 * is turned 180°). Null when the centres coincide or an input is unusable.
 */
export function recoilVector(fromRect, toRect, turnDeg = 0, magnitude = 0) {
  if (!isRect(fromRect) || !isRect(toRect) || !(magnitude > 0)) return null;
  const a = centreOf(fromRect);
  const b = centreOf(toRect);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(length >= 1)) return null;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const turn = ((Number.isFinite(turnDeg) ? -turnDeg : 0) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { x: (ux * cos - uy * sin) * magnitude, y: (ux * sin + uy * cos) * magnitude };
}

/**
 * Design 069: each attack's contact and context, by its strike key (the `attackExecuted` event
 * its plans share, advisory-animations `attackStrikes`). The FX queue holds an attack until its
 * contact, so its damage and knockout plans run after the impact queue flushed (and dropped the
 * context); they find the attack here instead, and land at `contactAt + their ripple delay`.
 * `now` and `setTimer` are injected so the timing is testable on a fake clock.
 */
export function createStrikeBook({ now, setTimer }) {
  const strikes = new WeakMap();
  const entryOf = (plan) => (plan?.strike && typeof plan.strike === 'object' ? strikes.get(plan.strike) : undefined);
  return {
    /** Record that the attack keyed `key` connects `ms` from now with `ctx`. */
    announce(key, ms, ctx = null) {
      if (key && typeof key === 'object') strikes.set(key, { ctx, contactAt: now() + ms });
    },
    /** The strike context of `plan`'s attack, or null. */
    contextOf: (plan) => entryOf(plan)?.ctx ?? null,
    /** True when `plan` belongs to an attack whose hits ripple (more than one target). */
    isRipple: (plan) => Object.keys(entryOf(plan)?.ctx?.hitDelays ?? {}).length > 0,
    /** ms from now until `plan`'s card is hit (0 when already due or unknown). */
    waitMs(plan) {
      const entry = entryOf(plan);
      return entry ? hitWaitMs(entry.contactAt, hitDelayFor(entry.ctx, plan.instanceId), now()) : 0;
    },
    /**
     * Run `job(ctx)` on `impacts` (combat-pose `createImpactQueue`) when `plan`'s hit lands, with
     * its attack's context; without a known attack, at the queue's contact with its context.
     */
    afterHit(impacts, plan, job) {
      impacts.add((queued) => {
        const entry = entryOf(plan);
        const ctx = entry?.ctx ?? queued ?? null;
        const wait = hitWaitMs(entry?.contactAt ?? null, hitDelayFor(ctx, plan?.instanceId), now());
        if (wait > 0) setTimer(() => job(ctx), wait);
        else job(ctx);
      });
    },
  };
}

/**
 * Design 069: a knockout's FX-queue hold. A ripple attack's knockouts play back to back (each
 * ghost waits for its own hit), so only the last holds — its usual hold counted from its hit.
 */
export function knockoutHoldMs({ ripple = false, moreKnockouts = false, waitMs = 0, holdMs = 0 } = {}) {
  if (!ripple) return holdMs;
  if (moreKnockouts) return 0;
  return holdMs + Math.max(0, Number.isFinite(waitMs) ? waitMs : 0);
}
