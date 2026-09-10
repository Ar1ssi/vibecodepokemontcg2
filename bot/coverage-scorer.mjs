// Design 004 / S86: the coverage scorer — an alternate brain for the pluggable
// OptionScorer seam (see bot.mjs). Where heuristic-scorer.mjs plays a plausible
// game, this one plays a *thorough* one: its objective is to exercise as many
// distinct mechanics per game as possible, because the point of the soak is to
// reach code no fixture deck otherwise touches (Stadiums, abilities, Tools,
// evolution chains) — not to win.
//
// Policy:
//   1. Empty-bench guard, kept from the heuristic scorer. A game that ends on
//      turn 1 exercises nothing, so benching a Basic still outranks everything.
//   2. Otherwise pick the LEAST-exercised option this game, counted by
//      coverageKey. Abilities and Stadiums are rare, so they sit at count 0 and
//      get picked the moment they become legal — "use abilities whenever
//      possible" falls out of the ranking rather than needing a special case.
//   3. `attack` and `pass` are held back until every non-terminating option is
//      spent. Both end the turn in this client (attack -> endTurnWithBanner ->
//      endTurn), so picking either early caps the turn at one action and starves
//      coverage. Attack still happens — every turn ends — just last.
//
// Deterministic given a seed: the RNG only breaks ties inside one count tier.

const TURN_ENDING_KINDS = new Set(['attack', 'pass', 'end']);

/**
 * Identity for "a mechanic already exercised this game", finer-grained than the
 * option kind so that a second, different ability outranks a second use of the
 * first one. Card-name-keyed where a name exists (hand indices shift; names
 * don't), position-keyed for in-play targets.
 * @returns {string}
 */
export function coverageKey(option, observation) {
  const hand = observation?.self?.hand || [];
  const named = (index) => hand[index]?.name || `#${index}`;
  switch (option?.kind) {
    case 'playBasic':
      return `playBasic:${named(option.handIndex)}:${option.targetZone}`;
    case 'evolve':
      return `evolve:${named(option.handIndex)}`;
    case 'playTrainer':
      return `playTrainer:${named(option.handIndex)}`;
    case 'attach':
      return `attach:${named(option.handIndex)}:${option.targetZone}`;
    case 'ability':
      return `ability:${option.zone}:${option.index}:${option.abilityIndex ?? 0}`;
    case 'attack':
      return `attack:${option.attackIndex}`;
    case 'retreat':
      return `retreat:${option.benchIndex}`;
    default:
      return String(option?.kind);
  }
}

function pickRandom(list, rng) {
  if (list.length === 1) return list[0];
  return list[Math.floor(rng() * list.length) % list.length];
}

// Least-exercised first; ties broken by the seeded RNG so a run stays reproducible.
function leastExercised(options, counts, observation, rng) {
  let best = Infinity;
  let tier = [];
  for (const option of options) {
    const count = counts.get(coverageKey(option, observation)) ?? 0;
    if (count < best) {
      best = count;
      tier = [option];
    } else if (count === best) {
      tier.push(option);
    }
  }
  return pickRandom(tier, rng);
}

export function createCoverageScorer({ rng = Math.random } = {}) {
  return {
    choose(observation) {
      const allOptions = observation?.options || [];
      if (!allOptions.length) return null;

      // Guard 3, shared with the heuristic scorer: skip Trainers the runner has
      // already shown to be inert this turn (see heuristic-scorer.mjs optionKey).
      const tried = new Set(observation?.triedThisTurn || []);
      const options = allOptions.filter(
        (option) =>
          !(option.kind === 'playTrainer' &&
            tried.has(`playTrainer:${(observation?.self?.hand || [])[option.handIndex]?.name || option.handIndex}`))
      );
      if (!options.length) return null;

      const counts = new Map();
      for (const key of observation?.exercised || []) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Guard 1: never end a turn with an empty bench while a Basic can fill it.
      const benchIsEmpty = !(observation?.self?.bench || []).length;
      const benchPlays = options.filter(
        (option) => option.kind === 'playBasic' && option.targetZone === 'bench'
      );
      if (benchIsEmpty && benchPlays.length) {
        return leastExercised(benchPlays, counts, observation, rng);
      }

      const developing = options.filter(
        (option) => !TURN_ENDING_KINDS.has(option.kind)
      );
      if (developing.length) {
        return leastExercised(developing, counts, observation, rng);
      }

      const attacks = options.filter((option) => option.kind === 'attack');
      if (attacks.length) return leastExercised(attacks, counts, observation, rng);

      return options.find((option) => option.kind === 'pass') || options[0];
    },
  };
}
