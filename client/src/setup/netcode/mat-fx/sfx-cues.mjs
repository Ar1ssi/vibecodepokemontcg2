// Design 064: which sampled cue (if any) an fx plan sounds. Pure data + lookups, no Audio.
//
// A cue key names a group of files in the importer's manifest (scripts/sfx/source-map.mjs). The
// driver (fx-audio.js) tries the cue first and falls back to the synthesized palette
// (fx-audio.mjs) when the sample is missing or not decoded yet.
//
//   CUES[key] = { gain, preload, bus: 'sfx'|'ui'|'crowd'|'status', loop?, delayMs? }
//     gain     per-cue mix knob (the transcode keeps source loudness)
//     preload  decode after the first gesture (cues of 2 s or less) instead of on first request
//     delayMs  default start offset
//
// Card-dependent rows (Tool vs Energy, Pokémon type) read `plan.soundCard`, which index.js
// `soundPlanFor` resolves from the card registry, so this module stays registry-free.
//
// Attack-owned effects (design 063) deliberately have no cue: they keep their synthesized voices.
import { classifyHitOnce } from './damage-hit.mjs';
import { FLIGHT_MS } from './card-flight.mjs';
import { coinCeremonyTimeline } from './coin-pose.mjs';
import { RETREAT_SLIDE_MS } from './lifecycle-pose.mjs';
import { PREVIEW_DROP_MS } from './opp-play.mjs';
import { isEnergyCard, normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';

const EMPTY = Object.freeze([]);
const sfx = (gain, preload) => Object.freeze({ gain, preload, bus: 'sfx' });
const ui = (gain, preload) => Object.freeze({ gain, preload, bus: 'ui' });
const crowd = (gain, loop = false) => Object.freeze({ gain, preload: false, bus: 'crowd', ...(loop && { loop }) });

const POKEMON_TYPE_KEYS = Object.freeze({
  colorless: 'colorless',
  darkness: 'dark',
  dragon: 'dragon',
  lightning: 'electric',
  fairy: 'fairy',
  fighting: 'fighting',
  fire: 'fire',
  grass: 'grass',
  metal: 'metal',
  psychic: 'psychic',
  water: 'water',
});

export const STATUS_CONDITION_KEYS = Object.freeze({
  Poisoned: 'poison',
  Burned: 'burn',
  Asleep: 'sleep',
  Paralyzed: 'paralyze',
  Confused: 'confusion',
});

const activeCues = Object.fromEntries(
  Object.values(POKEMON_TYPE_KEYS).map((type) => [`active-${type}`, sfx(0.7, false)])
);
const statusCues = Object.fromEntries(
  Object.values(STATUS_CONDITION_KEYS).flatMap((condition) => [
    [`${condition}-intro`, sfx(0.7, condition !== 'sleep')],
    [`${condition}-outro`, sfx(0.7, true)],
    // Ambient bed under a held condition (design O6). Preloaded (~3 s each): a lazy first load
    // would leave the loop silent until the next view arrives, which can be a whole opponent turn.
    [`${condition}-loop`, Object.freeze({ gain: 0.25, preload: true, bus: 'status', loop: true })],
  ])
);

export const CUES = Object.freeze({
  'your-turn': sfx(0.7, true),
  'opp-turn': sfx(0.7, true),
  'attach-energy': sfx(0.7, true),
  'attach-energy-opp': sfx(0.7, true),
  'tool-attach': sfx(0.7, true),
  'trainer-to-board': sfx(0.7, true),
  'prize-card': sfx(0.7, true),
  'card-flip': sfx(0.7, true),
  'opp-card-played': sfx(0.7, true),
  'discard-whoosh': sfx(0.7, true),
  'discard-finished': sfx(0.7, true),
  'discard-deposit': sfx(0.7, true),
  'opp-pending-discard': sfx(0.7, true),
  'card-swoosh': sfx(0.7, true),
  'coin-appear': sfx(0.7, true),
  'coin-toss-metal': sfx(0.7, true),
  'coin-toss-plastic': sfx(0.7, true),
  'coin-spin-metal': sfx(0.7, true),
  'coin-spin-plastic': sfx(0.7, true),
  'coin-win': sfx(0.7, true),
  'coin-loss': sfx(0.7, true),
  'heal-card': sfx(0.7, true),
  // 5.1 s sample under the 3.5 s evolution scene: the tail is covered by the scene's fade.
  'evolve-card': sfx(0.8, false),
  'deck-to-hand': sfx(0.7, true),
  'card-drawn': sfx(0.7, true),
  'opp-deck-to-hand': sfx(0.7, true),
  'shuffle-deck': sfx(0.7, true),
  shuffle: sfx(0.7, true),
  'cards-to-prizes': sfx(0.7, true),
  'knocked-out': sfx(0.7, false),
  'rival-ko-ding': sfx(0.7, true),
  'rival-ko-whistle': sfx(0.7, true),
  'card-reveal': sfx(0.7, true),
  'place-active-opening': sfx(0.7, true),
  'opp-place-active': sfx(0.7, true),
  'place-active': sfx(0.7, true),
  'place-bench': sfx(0.7, true),
  'retreat-lock-flare': sfx(0.7, true),
  'retreat-lock-intro': sfx(0.7, true),
  'itchy-pollen-hand': sfx(0.7, false),
  'doom-curse-1': sfx(0.7, false),
  'doom-curse-2': sfx(0.7, false),
  // 1.75 s: short enough to decode after the first gesture.
  'instant-ko-impact': sfx(0.7, true),
  'darkrai-ex-entrance': sfx(0.7, false),
  'setup-phase': sfx(0.7, false),
  victory: sfx(0.7, false),
  defeat: sfx(0.7, false),
  // UI chrome (playUiCue). Preload only what is 2 s or less.
  'end-turn': ui(0.7, true),
  'attack-button': ui(0.7, true),
  'button-click': ui(0.7, true),
  'choose-first-second': ui(0.7, true),
  'big-card-in': ui(0.7, true),
  'big-card-out': ui(0.7, true),
  'card-view': ui(0.7, true),
  'pile-search': ui(0.7, true),
  'card-slot-drop': ui(0.7, true),
  'search-to-hand': ui(0.7, false),
  'menu-pop-in': ui(0.7, false),
  'card-from-hand': ui(0.7, true),
  'card-place': ui(0.7, true),
  'card-no-match': ui(0.7, false),
  'itchy-pollen-hand-card': ui(0.7, false),
  'card-to-board': ui(0.7, true),
  // Crowd (design O7): long beds and reactions decode on first use; the bus sits at 0.5 under master.
  'crowd-amb-small': crowd(0.8, true),
  'crowd-amb-large': crowd(0.8, true),
  'crowd-crazy': crowd(0.6, true),
  'to-large': crowd(0.9),
  'cheer-medium': crowd(1),
  'cheer-large': crowd(1),
  'cheer-disappoint': crowd(1),
  surprise: crowd(1),
  'additional-reactions': crowd(1),
  'small-reactions': crowd(0.8),
  ...activeCues,
  ...statusCues,
});

/** Keys `playUiCue` accepts: UI chrome has no plan, so the caller names the cue. */
export const UI_CUES = Object.freeze(
  new Set(Object.keys(CUES).filter((key) => CUES[key].bus === 'ui'))
);

const cueRow = (key, delayMs = CUES[key].delayMs ?? 0) => ({ key, gain: CUES[key].gain, delayMs });

/** `active-<type>` for the Pokémon that becomes Active; unknown or missing card is colorless. */
const activeCueKey = (card) => {
  const type = normalizeEnergyType(Array.isArray(card?.types) ? card.types[0] : null);
  return `active-${POKEMON_TYPE_KEYS[type] ?? 'colorless'}`;
};

const sideKey = (plan, keys) => keys[plan?.user] ?? null;

/** Gold, silver and metal coins ring; enamel, cardboard and anything unknown clack. */
export function coinSoundMaterial(material) {
  return ['gold', 'silver', 'metal'].includes(material) ? 'metal' : 'plastic';
}

// A toss at least this long is the full throw; shorter ones (fast multi-flip pacing) spin.
const FULL_TOSS_MS = 1500;

function coinPlays(plan) {
  const faces = Array.isArray(plan?.faces) && plan.faces.length > 0 ? plan.faces : [plan?.face];
  const { tossMs, landsAt } = coinCeremonyTimeline(faces.length, { reducedMotion: plan?.coinReducedMotion === true });
  const material = plan?.coinMaterial === undefined ? 'metal' : coinSoundMaterial(plan.coinMaterial);
  const toss = tossMs >= FULL_TOSS_MS ? `coin-toss-${material}` : `coin-spin-${material}`;
  const plays = [['coin-appear', 0]];
  landsAt.forEach((landedAt, i) => {
    if (tossMs > 0) plays.push([toss, landedAt - tossMs]);
    plays.push([faces[i] === 'heads' ? 'coin-win' : 'coin-loss', landedAt]);
  });
  return plays;
}

function discardPlays(plan) {
  const landing = plan?.sweep ? 'discard-deposit' : 'discard-finished';
  if (plan?.user === 'self') return [['discard-whoosh', 0], [landing, FLIGHT_MS]];
  if (plan?.user === 'opp') {
    return plan.sweep ? [['opp-pending-discard', 0], [landing, FLIGHT_MS]] : [['opp-pending-discard', 0]];
  }
  return [];
}

// Your Pokémon falls alone; the opponent's also draws the rival crowd sting, plus a whistle for a rule box.
function knockoutPlays(plan) {
  const fall = plan?.effectKo === true ? 'instant-ko-impact' : 'knocked-out';
  if (plan?.user !== 'opp') return [[fall, 0]];
  const plays = [[fall, 0], ['rival-ko-ding', 0]];
  if (plan.ruleBoxes > 0) plays.push(['rival-ko-whistle', 0]);
  return plays;
}

// `plan.setup` (advisory-animations.js) marks an entry during the opening placement.
function enterPlays(plan) {
  const plays = placePlays(plan);
  return plays.length > 0 && plan.soundCard?.name === DARKRAI_EX ? [['darkrai-ex-entrance', 0]] : plays;
}

function placePlays(plan) {
  if (plan?.to === 'bench') return [['place-bench', 0]];
  if (plan?.to !== 'active') return [];
  if (!plan.setup) return [['place-active', 0]];
  return [[plan.user === 'opp' ? 'opp-place-active' : 'place-active-opening', 0]];
}

const DARKRAI_EX = 'Darkrai ex';
const ITEM_LOCK_KINDS = ['item', 'trainer', 'any'];

// Design 064: the Item lock cue; other locks (Supporter, Stadium, Energy) stay silent.
const playLockPlays = (plan) =>
  Array.isArray(plan?.kinds) && plan.kinds.some((kind) => ITEM_LOCK_KINDS.includes(kind))
    ? [['itchy-pollen-hand', 0]]
    : [];

const single = (key) => (key ? [[key, undefined]] : []);

// Each resolver returns [key, delayMs] pairs (delayMs undefined = the cue's default). Effects
// owned by design 063 (`attack`, `attack-banner`) are absent; `damage` resolves only its heal kind.
const CUE_PLAYS_FOR_EFFECT = {
  'turn-banner': (plan) => single(sideKey(plan, { self: 'your-turn', opp: 'opp-turn' })),
  attach: (plan) => single(sideKey(plan, { self: 'attach-energy', opp: 'attach-energy-opp' })),
  'tool-attach': () => single('tool-attach'),
  'trainer-play': (plan) => single(plan?.user === 'self' ? 'trainer-to-board' : null),
  'opp-trainer-play': () => [['card-flip', 0], ['opp-card-played', PREVIEW_DROP_MS]],
  discard: discardPlays,
  'prize-claim': () => single('prize-card'),
  promote: (plan) => single(activeCueKey(plan?.soundCard)),
  retreat: (plan) => [['card-swoosh', 0], [activeCueKey(plan?.soundCard), RETREAT_SLIDE_MS]],
  evolve: () => single('evolve-card'),
  'evolve-scene': () => single('evolve-card'),
  damage: (plan) => single(classifyHitOnce(plan)?.kind === 'heal' ? 'heal-card' : null),
  status: (plan) => {
    const condition = STATUS_CONDITION_KEYS[plan?.condition];
    return single(condition ? `${condition}-intro` : null);
  },
  'status-clear': (plan) => {
    const condition = STATUS_CONDITION_KEYS[plan?.condition];
    return single(condition ? `${condition}-outro` : null);
  },
  // Non-fx moments: advisory-animations.js and draw-scene.js sound these directly (design 064).
  'draw-start': () => single('deck-to-hand'),
  'draw-card': () => single('card-drawn'),
  'opp-draw': () => single('opp-deck-to-hand'),
  'shuffle-flight': () => single('shuffle-deck'),
  'search-shuffle': () => single('shuffle'),
  'prizes-set': () => single('cards-to-prizes'),
  knockout: knockoutPlays,
  'deck-reveal': () => single('card-reveal'),
  enter: enterPlays,
  'retreat-blocked': () => single('retreat-lock-flare'),
  'retreat-lock-applied': () => single('retreat-lock-intro'),
  'play-lock': playLockPlays,
  'attack-marker': (plan) => (plan?.markerKind === 'deferredKnockOut' ? [['doom-curse-1', 0]] : []),
  'deferred-ko': () => [['doom-curse-2', 0]],
  'setup-begin': () => single('setup-phase'),
  // Non-fx moments: advisory-animations.js and draw-scene.js sound these directly (design 064).
  'coin-flip': coinPlays,
  'game-over': (plan) => single(sideKey(plan, { self: 'victory', opp: 'defeat' })),
};

/**
 * The sampled cues one fx plan sounds, each with its start offset; [] means no sample and the
 * caller uses the synthesized voices.
 * @returns {ReadonlyArray<{key: string, gain: number, delayMs: number}>}
 */
export function cuesFor(effect, plan) {
  if (!Object.hasOwn(CUE_PLAYS_FOR_EFFECT, effect)) return EMPTY;
  const plays = CUE_PLAYS_FOR_EFFECT[effect](plan).map(([key, delayMs]) => Object.freeze(cueRow(key, delayMs)));
  return Object.freeze(plays);
}

/**
 * Resolve the card-dependent parts of a plan before it is sounded. `cardOf` is the registry
 * lookup (index.js). A Tool arrives as the `attach` effect, so it is renamed `tool-attach` (which
 * also revives its synthesized voice); an Active-bound Pokémon carries its card as `soundCard`
 * for the type cue. Anything unresolved returns the plan itself.
 */
export function withSoundCard(plan, cardOf) {
  if (!plan || typeof cardOf !== 'function') return plan;
  if (plan.effect === 'attach') {
    const card = cardOf(plan.instanceId);
    return card && !isEnergyCard(card) ? { ...plan, effect: 'tool-attach' } : plan;
  }
  if (plan.effect === 'promote' || plan.effect === 'retreat' || plan.effect === 'enter') {
    const soundCard = cardOf(plan.promotedId ?? plan.instanceId);
    return soundCard ? { ...plan, soundCard } : plan;
  }
  return plan;
}

/**
 * Next variant of a cue: random, never the one just played (design O8). `last` is the previous
 * index or -1; `rng` is injected so tests are deterministic.
 * @returns {number} index below `count`, or -1 when there are no variants
 */
export function pickVariant(count, last = -1, rng = Math.random) {
  if (!(count > 0)) return -1;
  if (count === 1) return 0;
  const repeats = last >= 0 && last < count;
  const pool = repeats ? count - 1 : count;
  const roll = Math.min(pool - 1, Math.floor(rng() * pool));
  return repeats && roll >= last ? roll + 1 : roll;
}
