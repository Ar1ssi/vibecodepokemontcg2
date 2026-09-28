// Condition-true replay for conditional damage bonuses ("If <condition>, this attack does N more
// damage"). The rich board meets few printed conditions, so the attack gate saw the same base
// damage whether the engine understood the condition or not: Keldeo ex Gale Thrust dealt 30 and
// read `ok`. Here each bonus clause whose condition this table can stage is replayed on a board
// where the condition holds, and must deal at least base + bonus.
import { createCard } from '../../shared/engine/cards.mjs';
import { addCondition } from '../../shared/engine/rules/special-conditions.mjs';
import { runAttackOnce } from './attack-harness.mjs';

const normalizeAttackText = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const STATUS = {
  asleep: 'Asleep',
  burned: 'Burned',
  confused: 'Confused',
  paralyzed: 'Paralyzed',
  poisoned: 'Poisoned',
};
const OPP = "(?:your opponent's active pokémon|the defending pokémon)";

const root = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);
const attacker = (state) => root(state, 'p1');
const defender = (state) => root(state, 'p2');

// Printed rule-box spellings → the name suffix and subtype card-classify reads.
const RULE_BOX = {
  ex: [' ex', 'ex'],
  '-ex': ['-EX', 'EX'],
  gx: ['-GX', 'GX'],
  '-gx': ['-GX', 'GX'],
  v: [' V', 'V'],
  vmax: [' VMAX', 'VMAX'],
  vstar: [' VSTAR', 'VSTAR'],
};

function giveRuleBox(card, printed) {
  const [suffix, subtype] = RULE_BOX[printed];
  card.name = `Replay Target${suffix}`;
  card.subtypes = [...(card.subtypes || []).filter((s) => s !== 'Basic'), 'Basic', subtype];
}

function evolve(card) {
  card.stage = 'Stage 1';
  card.subtypes = ['Stage 1'];
  card.evolvesFrom = 'Replay Basic';
}

function trimPrizes(state, pid, left) {
  state.players[pid].zones.prizes.splice(left);
}

/**
 * `[regex over the normalized condition clause, (state, match) => void]`. Each setup makes the
 * printed condition true on the rich board with the state the engine itself keeps for it.
 */
export const CONDITION_SETUPS = [
  [
    /^this pokémon (?:moved from (?:your|the) bench to the active spot|was on (?:your|the) bench and became your active pokémon) this turn$/,
    (state) => {
      attacker(state).movedToActiveTurn = state.turn.number;
    },
  ],
  [
    new RegExp(`^${OPP} is (${Object.keys(STATUS).join('|')})$`),
    (state, m) => addCondition(defender(state), STATUS[m[1]]),
  ],
  [
    new RegExp(`^${OPP} is affected by a special condition$`),
    (state) => addCondition(defender(state), 'Poisoned'),
  ],
  [
    new RegExp(`^this pokémon is (${Object.keys(STATUS).join('|')})$`),
    (state, m) => addCondition(attacker(state), STATUS[m[1]]),
  ],
  [
    new RegExp(`^${OPP} is an? pokémon ?(ex|-ex|gx|-gx|v|vmax|vstar)\\b`),
    (state, m) => giveRuleBox(defender(state), m[1]),
  ],
  [
    new RegExp(`^${OPP} is an? (?:evolution|evolved|stage 1) pokémon$`),
    (state) => evolve(defender(state)),
  ],
  [
    /^this pokémon has (\d+) or more damage counters on it$/,
    (state, m) => {
      attacker(state).damage = Number(m[1]) * 10;
    },
  ],
  [
    /^this pokémon has no damage counters on it$/,
    (state) => {
      attacker(state).damage = 0;
    },
  ],
  [
    new RegExp(`^${OPP} (?:already )?has (?:at least )?(\\d+) or more damage counters on it$`),
    (state, m) => {
      defender(state).damage = Number(m[1]) * 10;
    },
  ],
  [
    /^you played (?:a|any) supporter card from your hand during this turn$/,
    (state) => {
      const flags = (state.players.p1.flags ??= {});
      flags.supporterPlayed = true;
      flags.supportersPlayedCount = 1;
    },
  ],
  [
    /^this pokémon evolved during this turn$/,
    (state) => {
      const flags = (state.players.p1.flags ??= {});
      flags.evolved = { ...(flags.evolved || {}), [attacker(state).instanceId]: true };
    },
  ],
  [
    /^(?:you have a stadium(?: card)? in play|there is (?:a|any) stadium card in play|a stadium is in play)$/,
    (state) => {
      state.stadium = createCard({
        instanceId: 99001,
        name: 'Replay Stadium',
        supertype: 'Trainer',
        subtypes: ['Stadium'],
        type: 'Stadium',
        ownerId: 'p1',
      });
    },
  ],
  [
    /^your opponent has (?:only )?(\d+) (?:or fewer )?prize cards? (?:remaining|left)$/,
    (state, m) => trimPrizes(state, 'p2', Number(m[1])),
  ],
  [
    /^you have (?:only )?(\d+) (?:or fewer )?prize cards? (?:remaining|left)$/,
    (state, m) => trimPrizes(state, 'p1', Number(m[1])),
  ],
];

/** The board setup that makes `clause` true, or null when the table cannot stage it. */
export function setupFor(clause) {
  for (const [re, setup] of CONDITION_SETUPS) {
    const m = re.exec(clause);
    if (m) return (state) => setup(state, m);
  }
  return null;
}

// Coin and cost-gated ("if you do") clauses are outcomes of the attack itself, not board state.
const NOT_BOARD_STATE = /^(?:heads|tails|you do|you did|\d+ of them|all of them|either of them|both of them|you get)\b/;

/**
 * Every "If <condition>, this attack does N more damage" clause in `text`:
 * `[{ clause, bonus }]`, clause normalized and without its leading "if".
 */
export function bonusClauses(text) {
  const out = [];
  const re = /\bif ([^.,]+?),? this attack does (\d+) more damage\b/g;
  for (const m of normalizeAttackText(text).matchAll(re)) {
    const clause = m[1].trim();
    if (NOT_BOARD_STATE.test(clause)) continue;
    out.push({ clause, bonus: Number(m[2]) });
  }
  return out;
}

/**
 * Replays each stageable bonus clause with its condition true (seed 1). Returns
 * `{ failed: [{ clause, bonus, dealt, want }], untested: [clause] }`: `failed` lists clauses whose
 * bonus did not land, `untested` the ones the setup table cannot stage.
 */
export function replayBonuses(holder, attackIndex, { text, printedBase, costPool, seed = 1 }) {
  const failed = [];
  const untested = [];
  for (const { clause, bonus } of bonusClauses(text)) {
    const setup = setupFor(clause);
    if (!setup) {
      untested.push(clause);
      continue;
    }
    const run = runAttackOnce(holder, attackIndex, seed, costPool, setup);
    // An attack that cannot run here (unpayable, gated) proves nothing either way.
    if (run.error || run.dealt == null) continue;
    const want = printedBase + bonus;
    if (run.dealt < want) failed.push({ clause, bonus, dealt: run.dealt, want });
  }
  return { failed, untested };
}
