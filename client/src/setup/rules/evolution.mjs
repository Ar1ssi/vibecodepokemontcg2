// Evolution legality: a Pokémon can't evolve (1) on either player's first
// turn of the game, (2) the same turn it was played to the bench/active,
// (3) twice in one turn. Rare Candy skips stage 1.

import { rulesState, ensureCardData, cardDataCache, fetchCardDetail } from './rules-state.mjs';
import { getStadiumEvolutionSpeed } from './stadium-effects.mjs';

export const STAGE1_EVOLVES_FROM = new Map([
  ['piloswine', 'swinub'],
  ['haunter', 'gastly'],
  ['charmeleon', 'charmander'],
  ['wartortle', 'squirtle'],
  ['ivysaur', 'bulbasaur'],
  ['metang', 'beldum'],
  ['dragonair', 'dratini'],
  ['pupitar', 'larvitar'],
  ['shelgon', 'bagon'],
  ['gabite', 'gible'],
  ['zweilous', 'deino'],
  ['machoke', 'machop'],
  ['graveler', 'geodude'],
  ['kadabra', 'abra'],
  ['kirlia', 'ralts'],
  ['drakloak', 'dreepy'],
  ['arctibax', 'frigibax'],
  ['floragato', 'sprigatito'],
  ['crocalor', 'fuecoco'],
  ['quaxwell', 'quaxly'],
  ['thwackey', 'grookey'],
  ['raboot', 'scorbunny'],
  ['drizzile', 'sobble'],
  ['dartrix', 'rowlet'],
  ['torracat', 'litten'],
  ['brionne', 'popplio'],
  ['luxio', 'shinx'],
  ['flaaffy', 'mareep'],
  ['marill', 'azurill'],
  ['chansey', 'happiny'],
  ['roselia', 'budew'],
  ['chimecho', 'chingling'],
  ['sudowoodo', 'bonsly'],
  ['mr. mime', 'mime jr.'],
  ['snorlax', 'munchlax'],
  ['lucario', 'riolu'],
  ['mantine', 'mantyke'],
  ['electabuzz', 'elekid'],
  ['magmar', 'magby'],
  ['pikachu', 'pichu'],
  ['clefairy', 'cleffa'],
  ['jigglypuff', 'igglybuff'],
  ['togetic', 'togepi'],
  ['wobbuffet', 'wynaut'],
  ['nidorino', 'nidoran♂'],
  ['nidorina', 'nidoran♀'],
  ['gloom', 'oddish'],
  ['poliwhirl', 'poliwag'],
  ['weepinbell', 'bellsprout'],
  ['magneton', 'magnemite'],
  ['rhydon', 'rhyhorn'],
  ['seadra', 'horsea'],
  ['porygon2', 'porygon'],
  ['bayleef', 'chikorita'],
  ['quilava', 'cyndaquil'],
  ['croconaw', 'totodile'],
  ['skiploom', 'hoppip'],
  ['vibrava', 'trapinch'],
  ['sealeo', 'spheal'],
  ['grotle', 'turtwig'],
  ['monferno', 'chimchar'],
  ['prinplup', 'piplup'],
  ['staravia', 'starly'],
  ['servine', 'snivy'],
  ['pignite', 'tepig'],
  ['dewott', 'oshawott'],
  ['quilladin', 'chespin'],
  ['braixen', 'fennekin'],
  ['frogadier', 'froakie'],
  ['doublade', 'honedge'],
  ['tinkatuff', 'tinkatink'],
  ['houndoom', 'houndour'],
  ['manectric', 'electrike'],
  ['lairon', 'aron'],
]);

export async function resolveStage1EvolvesFrom(stage1Name) {
  if (!stage1Name) return null;
  const key = stage1Name.toLowerCase();
  if (STAGE1_EVOLVES_FROM.has(key)) return STAGE1_EVOLVES_FROM.get(key);

  if (cardDataCache) {
    for (const [, data] of cardDataCache) {
      if (data?.name && data.name.toLowerCase() === key && data.evolvesFrom) {
        const base = data.evolvesFrom.toLowerCase();
        STAGE1_EVOLVES_FROM.set(key, base);
        return base;
      }
    }
  }

  if (typeof fetch === 'function' && typeof fetchCardDetail === 'function') {
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(stage1Name)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const detail = await fetchCardDetail(list[0].id);
          const from = detail?.evolveFrom || detail?.evolvesFrom;
          if (from) {
            const base = String(from).toLowerCase();
            STAGE1_EVOLVES_FROM.set(key, base);
            return base;
          }
        }
      }
    } catch {}
  }
  return null;
}

export function getCardInstanceId(card) {
  if (!card || typeof card !== 'object') return null;
  if (card.cardId) return String(card.cardId);
  if (card.uuid) return String(card.uuid);
  if (card.syncInstance != null) return `sync:${card.syncInstance}`;
  if (card.image?.dataset?.cardId) return String(card.image.dataset.cardId);
  return null;
}

export async function canEvolve(
  player,
  baseCardInPlay,
  evolutionCardInHand,
  wasPlayedThisTurn,
  options = {}
) {
  if (!rulesState.enabled) return { allowed: true };

  if (rulesState.turnNumber <= 1) {
    return { allowed: false, reason: "Can't evolve on the first turn." };
  }

  // Stadium evolution-speed modifier ("as if it had been in play for 1
  // more turn") relaxes the just-played gate; "costs N less Energy" is
  // surfaced as `costReduce` for the cost layer (no live charge site yet).
  const evoSpeed = getStadiumEvolutionSpeed(player, baseCardInPlay);
  if (wasPlayedThisTurn && !evoSpeed.relaxTurnGate) {
    return { allowed: false, reason: "That Pokémon was just played this turn — it can't evolve yet." };
  }

  await ensureCardData(baseCardInPlay);
  await ensureCardData(evolutionCardInHand);

  // stage chain check: evolution must be exactly the next stage (or a
  // legal Rare Candy jump from Basic to Stage 2)
  const baseStage = normalizeStage(baseCardInPlay.stage) || 'Basic';
  const evoStage = normalizeStage(evolutionCardInHand.stage);
  // A card in hand that has no valid stage (e.g. a misclassified Energy
  // card) is not a Pokémon evolution — reject it instead of silently
  // defaulting to 'Stage 1' and mis-evaluating the stage chain.
  if (!evoStage) {
    return {
      allowed: false,
      reason: `${evolutionCardInHand.name} is not a Pokémon evolution card (no valid stage).`,
    };
  }

  const evolvesFrom = String(evolutionCardInHand.evolvesFrom || '').toLowerCase();
  const baseName = String(baseCardInPlay.name || '').toLowerCase();
  const rareCandyJump = isRareCandyJump(baseCardInPlay, evolutionCardInHand);
  const isRareCandy = Boolean(options.isRareCandy);

  if (isRareCandy) {
    if (!rareCandyJump) {
      return {
        allowed: false,
        reason: "Rare Candy can only evolve a Basic Pokémon into a Stage 2 Pokémon.",
      };
    }
    // Evolution line verification for Rare Candy
    const evolvesFromBase = String(evolutionCardInHand.evolvesFromBase || '').toLowerCase();
    const stage1Base = evolvesFrom ? await resolveStage1EvolvesFrom(evolvesFrom) : null;
    const matchesLine =
      !evolvesFrom ||
      evolvesFrom === baseName ||
      (evolvesFromBase && evolvesFromBase === baseName) ||
      (stage1Base && stage1Base === baseName) ||
      stage1Base === null; // graceful fallback if stage 1 cannot be resolved offline

    if (!matchesLine) {
      const parentLine = stage1Base ? ` (which evolves from ${stage1Base})` : '';
      return {
        allowed: false,
        reason: `${evolutionCardInHand.name} evolves from ${evolutionCardInHand.evolvesFrom}${parentLine}, not ${baseCardInPlay.name}.`,
      };
    }
  } else {
    // Normal evolution without Rare Candy
    if (evolvesFrom && baseName && evolvesFrom !== baseName) {
      return {
        allowed: false,
        reason: `${evolutionCardInHand.name} evolves from ${evolutionCardInHand.evolvesFrom}, not ${baseCardInPlay.name}.`,
      };
    }

    const order = ['Basic', 'Stage 1', 'Stage 2'];
    const baseIdx = order.indexOf(baseStage);
    const evoIdx = order.indexOf(evoStage);
    if (evoIdx !== baseIdx + 1 && !rareCandyJump) {
      return {
        allowed: false,
        reason: `${evoStage} can't evolve from ${baseStage} directly (needs Rare Candy for a skip).`,
      };
    }
  }

  // once per turn per card instance
  const instanceId = getCardInstanceId(baseCardInPlay);
  if (instanceId && rulesState.flags[player]?.evolved?.[instanceId]) {
    return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
  }
  if (!instanceId && rulesState.flags[player]?.evolved?.[baseName]) {
    return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
  }
  if (Array.isArray(baseCardInPlay.attachedCards)) {
    for (const sub of baseCardInPlay.attachedCards) {
      const subId = getCardInstanceId(sub);
      if (subId && rulesState.flags[player]?.evolved?.[subId]) {
        return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
      }
    }
  }

  return { allowed: true, costReduce: evoSpeed.costReduce };
}

// Stage strings vary by source: local card data uses 'Stage 1' while
// TCGdex can return 'Stage1' (and case can differ). Canonicalize to the
// 'Basic' | 'Stage 1' | 'Stage 2' forms used by the stage-order check.
export function normalizeStage(stage) {
  const s = String(stage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'basic') return 'Basic';
  if (s === 'stage1') return 'Stage 1';
  if (s === 'stage2') return 'Stage 2';
  return null;
}

// Rare Candy: Basic -> Stage 2 directly (item, so it also needs the item
// to be playable — the item rules are handled by trainer guidance)
export function isRareCandyJump(baseCardInPlay, evolutionCardInHand) {
  const baseStage = normalizeStage(baseCardInPlay.stage) || 'Basic';
  const evoStage = normalizeStage(evolutionCardInHand.stage) || 'Stage 1';
  return baseStage === 'Basic' && evoStage === 'Stage 2';
}

export function markEvolvedThisTurn(player, targetCardOrName) {
  const f = rulesState.flags[player];
  if (!f) return;
  const instanceId = getCardInstanceId(targetCardOrName);
  if (instanceId) {
    f.evolved[instanceId] = true;
  } else if (typeof targetCardOrName === 'string') {
    f.evolved[targetCardOrName.toLowerCase()] = true;
  } else if (targetCardOrName?.name) {
    f.evolved[targetCardOrName.name.toLowerCase()] = true;
  }
  if (
    targetCardOrName &&
    typeof targetCardOrName === 'object' &&
    Array.isArray(targetCardOrName.attachedCards)
  ) {
    for (const sub of targetCardOrName.attachedCards) {
      const subId = getCardInstanceId(sub);
      if (subId) f.evolved[subId] = true;
    }
  }
}

    // Playing a Pokémon from hand onto Active/Bench (not evolving onto one
    // already in play) is limited to Basic stage.
    export async function canPlayPokemonFromHand(pokemonCard) {
      if (!rulesState.enabled) return { allowed: true };

      await ensureCardData(pokemonCard);
      const stage = normalizeStage(pokemonCard.stage);
      if (stage === 'Stage 1' || stage === 'Stage 2') {
        return {
          allowed: false,
          reason: `${pokemonCard.name} is a ${stage} Pokémon — only Basic Pokémon can be played from your hand.`,
        };
      }
      return { allowed: true };
    }
    