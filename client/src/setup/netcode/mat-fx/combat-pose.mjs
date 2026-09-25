// Design 022 slice 1: pure math for the combat effects (damage popup, hit
// shake, screen shake, attack lunge, impact timing). DOM-free; combat.js drives
// overlays. Design 026 reworked the curves (elastic pop, wind-up lunge).

export const DAMAGE_POP_MS = 1100;
export const HIT_FLASH_MS = 420;
export const LUNGE_MS = 560;
export const LUNGE_IMPACT = 0.36;
export const SCREEN_SHAKE_MS = 360;
export const HIT_SPARKS_MS = 520;
export const SCREEN_SHAKE_MIN_DAMAGE = 30;
export const SCREEN_SHAKE_MAX_PX = 6;
export const TARGET_RING_MS = 620;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Classify one `damageUpdated` fx plan. The engine's `dealt` / `healed` fields
 * are the hit amount; when both are absent, fall back to the change against the
 * last damage seen for this card (`lastSeen`, updated here). Returns null when
 * there is nothing to show (no amount, zero, or an unknown baseline).
 * @returns {{kind:'hit'|'heal', amount:number, weakness:boolean}|null}
 */
export function classifyDamagePlan(plan, lastSeen) {
  const prev = lastSeen.get(plan.instanceId);
  if (isNum(plan.damage)) lastSeen.set(plan.instanceId, plan.damage);
  if (isNum(plan.healed) && plan.healed > 0) {
    return { kind: 'heal', amount: plan.healed, weakness: false };
  }
  let amount = null;
  if (isNum(plan.dealt)) amount = plan.dealt;
  else if (isNum(plan.damage) && isNum(prev)) amount = plan.damage - prev;
  if (amount == null || amount === 0) return null;
  if (amount > 0) return { kind: 'hit', amount, weakness: !!plan.weakness };
  return { kind: 'heal', amount: -amount, weakness: false };
}

/** Amplitude (px) of the whole-table shake for a hit; 0 below the threshold. */
export function screenShakeAmplitude(amount) {
  if (!isNum(amount) || amount < SCREEN_SHAKE_MIN_DAMAGE) return 0;
  return Math.min(SCREEN_SHAKE_MAX_PX, 2 + amount / 30);
}

/**
 * Floating number: elastic pop (overshoot then settle), rises `rise` px while
 * drifting `drift` px sideways, holds, then fades as it keeps climbing.
 */
export function damagePopPose(t, { rise = 48, drift = 0 } = {}) {
  const c = clamp01(t);
  let scale = 1;
  if (c < 0.12) scale = 0.4 + 1.05 * easeOutCubic(c / 0.12);
  else if (c < 0.28) scale = 1.45 - 0.45 * easeInOutCubic((c - 0.12) / 0.16);
  const climb = c < 0.3 ? 0.7 * easeOutCubic(c / 0.3) : 0.7 + 0.3 * ((c - 0.3) / 0.7);
  return {
    x: drift * easeOutCubic(c),
    y: -rise * climb,
    scale,
    opacity: c < 0.7 ? 1 : (1 - c) / 0.3,
  };
}

/** Vertical offset (px) for the `index`-th number already floating on a card. */
export function stackOffset(index, cardHeight) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  return -i * cardHeight * 0.22;
}

/** Damped horizontal jitter used on the hit-flash overlay. */
export function shakePose(t, amplitude) {
  const c = clamp01(t);
  return { x: amplitude * Math.sin(c * Math.PI * 7) * (1 - c), opacity: 1 - c ** 2 };
}

/** White flash over the struck card: instant peak, fast falloff. */
export function hitFlashPose(t) {
  const c = clamp01(t);
  return { opacity: c < 0.08 ? c / 0.08 : (1 - (c - 0.08) / 0.92) ** 2 };
}

/** Slash streak across the card: draws in fast, then thins and fades. */
export function slashPose(t) {
  const c = clamp01(t);
  const draw = easeOutCubic(Math.min(1, c / 0.35));
  return {
    scaleX: draw,
    scaleY: c < 0.35 ? 1 : 1 - 0.8 * ((c - 0.35) / 0.65),
    opacity: c < 0.35 ? 1 : 1 - (c - 0.35) / 0.65,
  };
}

/**
 * `translate` values for a whole-table shake: a damped sine, so the motion
 * reads as one impact settling rather than a random jitter.
 * @returns {string[]}
 */
export function screenShakeOffsets(amplitude, steps = 12) {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const f = i / steps;
    const decay = (1 - f) ** 2;
    const x = (amplitude * Math.cos(f * Math.PI * 5) * decay).toFixed(2);
    const y = (amplitude * 0.6 * Math.sin(f * Math.PI * 4) * decay).toFixed(2);
    out.push(`${x}px ${y}px`);
  }
  out.push('0px 0px');
  return out;
}

const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Direction (degrees, 0 = right, 90 = down) from one rect's center to another's. */
export function attackAngleDeg(fromRect, toRect) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/**
 * Attacker ghost lunge: wind up (pull back and lift), strike toward the
 * defender (up to `maxPx`) — contact at t = LUNGE_IMPACT — then recoil home.
 * Returns null when the two centers coincide (no direction).
 * @returns {((t:number) => {x:number,y:number,scale:number})|null}
 */
export function lungePoseFor(fromRect, toRect, { maxPx = 64, fraction = 0.34 } = {}) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return null;
  const reach = Math.min(maxPx, dist * fraction);
  const ux = dx / dist;
  const uy = dy / dist;
  const windEnd = LUNGE_IMPACT * 0.55;
  return (t) => {
    const c = clamp01(t);
    let f;
    let lift;
    if (c < windEnd) {
      const w = easeOutCubic(c / windEnd);
      f = -0.22 * w;
      lift = 0.08 * w;
    } else if (c < LUNGE_IMPACT) {
      const s = (c - windEnd) / (LUNGE_IMPACT - windEnd);
      f = -0.22 + 1.22 * s * s;
      lift = 0.08;
    } else {
      const r = easeInOutCubic((c - LUNGE_IMPACT) / (1 - LUNGE_IMPACT));
      f = 1 - r;
      lift = 0.08 * (1 - r);
    }
    return { x: ux * reach * f, y: uy * reach * f, scale: 1 + lift };
  };
}

/**
 * Holds hit/KO effects until the attacker's lunge connects. Effects queued in
 * one synchronous event batch wait one macrotask; if an attack was announced
 * in that batch (`strikeIn`) they fire at its contact moment with its context
 * (direction, attacker card), otherwise immediately. `setTimer(fn, ms)` is
 * injected so the timing is unit-testable.
 */
export function createImpactQueue({ setTimer }) {
  let jobs = [];
  let delayMs = 0;
  let context = null;
  let scheduled = false;
  const flush = () => {
    const batch = jobs;
    const wait = delayMs;
    const ctx = context;
    jobs = [];
    delayMs = 0;
    context = null;
    scheduled = false;
    const run = () => {
      for (const job of batch) job(ctx);
    };
    if (batch.length === 0) return;
    if (wait > 0) setTimer(run, wait);
    else run();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimer(flush, 0);
  };
  return {
    add(job) {
      jobs.push(job);
      schedule();
    },
    strikeIn(ms, ctx = null) {
      delayMs = Math.max(delayMs, ms);
      context = ctx;
      schedule();
    },
  };
}

/**
 * Design 024 slice 2: attack-name banner text. The attacker's name is the
 * subtitle so the player can read WHO is attacking, not just with what.
 * @returns {{title:string, sub:string}|null} null when there is no attack name.
 */
export function attackBannerText(attackName, attackerName) {
  const title = typeof attackName === 'string' ? attackName.trim() : '';
  if (!title) return null;
  const sub = typeof attackerName === 'string' ? attackerName.trim() : '';
  return { title, sub };
}

/**
 * Design 024 slice 2: targeting ring drawn on the defender while the banner
 * reads, so the player sees WHO is about to be hit before damage lands.
 * Two quick pulses that shrink onto the card, then fade.
 */
export function targetRingPose(t) {
  const c = clamp01(t);
  const pulse = 1 + 0.18 * Math.abs(Math.sin(c * Math.PI * 2));
  return {
    scale: (1.5 - 0.5 * easeOutCubic(c)) * pulse,
    opacity: c < 0.12 ? c / 0.12 : Math.max(0, 1 - (c - 0.12) / 0.88),
  };
}
