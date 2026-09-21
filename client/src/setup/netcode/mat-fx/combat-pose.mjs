// Design 022 slice 1: pure math for the combat effects (damage popup, hit
// shake, screen shake, attack lunge). DOM-free; combat.js drives overlays.

export const DAMAGE_POP_MS = 900;
export const HIT_FLASH_MS = 380;
export const LUNGE_MS = 420;
export const SCREEN_SHAKE_MS = 260;
export const SCREEN_SHAKE_MIN_DAMAGE = 30;
export const SCREEN_SHAKE_MAX_PX = 6;

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

/** Floating number: pops in, rises `rise` px, holds, then fades out. */
export function damagePopPose(t, { rise = 48 } = {}) {
  const c = clamp01(t);
  return {
    y: -rise * easeOutCubic(c),
    scale: c < 0.2 ? 0.6 + 0.4 * easeOutCubic(c / 0.2) : 1,
    opacity: c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35,
  };
}

/** Damped horizontal jitter used on the hit-flash overlay. */
export function shakePose(t, amplitude) {
  const c = clamp01(t);
  return { x: amplitude * Math.sin(c * Math.PI * 7) * (1 - c), opacity: 1 - c ** 2 };
}

/**
 * `translate` values for a whole-table shake, decaying to rest.
 * @returns {string[]}
 */
export function screenShakeOffsets(amplitude, steps = 6) {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const decay = 1 - i / steps;
    const sign = i % 2 === 0 ? 1 : -1;
    const x = (sign * amplitude * decay).toFixed(2);
    const y = (-sign * amplitude * 0.5 * decay).toFixed(2);
    out.push(`${x}px ${y}px`);
  }
  out.push('0px 0px');
  return out;
}

const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * Attacker ghost lunge: snap toward the defender (up to `maxPx`), then recoil.
 * Returns null when the two centers coincide (no direction).
 * @returns {((t:number) => {x:number,y:number,scale:number})|null}
 */
export function lungePoseFor(fromRect, toRect, { maxPx = 56, fraction = 0.3 } = {}) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return null;
  const reach = Math.min(maxPx, dist * fraction);
  const ux = dx / dist;
  const uy = dy / dist;
  return (t) => {
    const c = clamp01(t);
    const f = c < 0.3 ? easeOutCubic(c / 0.3) : 1 - easeInOutCubic((c - 0.3) / 0.7);
    return { x: ux * reach * f, y: uy * reach * f, scale: 1 + 0.06 * f };
  };
}
