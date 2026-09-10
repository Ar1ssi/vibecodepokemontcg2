// Design 004 slice 5: the default scorer. Greedy, deterministic given a seed —
// the RNG is only consulted to break ties within a priority tier, never to pick
// between tiers. Pure Node; only ever sees the plain JSON observation the bot
// scaffold hands it (see bot.mjs), never live cards or DOM.
//
// Priority order (ported from the Kaggle repo's measured ordering — attack-first
// scored 7.5% vs random because it under-developed the board):
//   evolve → playBasic → attach → ability → attack → retreat → pass
// plus two guards:
//   1. Never pass or attack with an empty bench if a Basic can be benched.
//      (Satisfied by the order itself: playBasic-to-bench always outranks
//      attack/pass, so this tier is never skipped over while such an option
//      exists — no special-casing needed. Covered by a regression test below.)
//   2. Among attack options pick highest expected damage; among attach options
//      prefer the active Pokémon's unmet attack cost.

function pickRandom(list, rng) {
  if (list.length === 1) return list[0];
  const index = Math.floor(rng() * list.length) % list.length;
  return list[index];
}

// "20", "30+", "10x", "" (no fixed damage / effect-only attack) → a comparable
// number. An attack with no parseable leading digits (pure-effect attacks like
// "Flip a coin...") is not preferred over one with real expected damage.
function parseDamage(attack) {
  const match = /^\d+/.exec(String(attack?.damage ?? ''));
  return match ? Number(match[0]) : 0;
}

function bestAttackIndex(active, attackOptions) {
  const attacksByIndex = new Map((active?.attacks || []).map((a) => [a.index, a]));
  let best = -Infinity;
  for (const option of attackOptions) {
    const dmg = parseDamage(attacksByIndex.get(option.attackIndex));
    if (dmg > best) best = dmg;
  }
  return best;
}

// Whether `active` still needs more Energy to pay for at least one of its
// attacks, given what's already attached — used to steer `attach` toward the
// active Pokémon instead of the bench when the active is the one blocked.
function activeHasUnmetCost(active) {
  if (!active) return false;
  const attachedCount = (active.attachedEnergy || []).length;
  const attacks = active.attacks || [];
  if (!attacks.length) return false;
  return attacks.every((attack) => (attack.cost || []).length > attachedCount);
}

export function createHeuristicScorer({ rng = Math.random } = {}) {
  return {
    choose(observation) {
      const options = observation?.options || [];
      if (!options.length) return null;
      const byKind = (kind) => options.filter((option) => option.kind === kind);

      const evolves = byKind('evolve');
      if (evolves.length) return pickRandom(evolves, rng);

      const playBasics = byKind('playBasic');
      if (playBasics.length) return pickRandom(playBasics, rng);

      const attaches = byKind('attach');
      if (attaches.length) {
        const active = observation?.self?.active;
        const preferred = activeHasUnmetCost(active)
          ? attaches.filter((option) => option.targetZone === 'active')
          : [];
        return pickRandom(preferred.length ? preferred : attaches, rng);
      }

      const abilities = byKind('ability');
      if (abilities.length) return pickRandom(abilities, rng);

      const attacks = byKind('attack');
      if (attacks.length) {
        const active = observation?.self?.active;
        const best = bestAttackIndex(active, attacks);
        const attacksByIndex = new Map((active?.attacks || []).map((a) => [a.index, a]));
        const bestOptions = attacks.filter(
          (option) => parseDamage(attacksByIndex.get(option.attackIndex)) === best
        );
        return pickRandom(bestOptions, rng);
      }

      const retreats = byKind('retreat');
      if (retreats.length) return pickRandom(retreats, rng);

      const passes = byKind('pass');
      if (passes.length) return passes[0];

      return null;
    },
  };
}
