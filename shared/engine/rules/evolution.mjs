// Evolution legality: a Pokémon can't evolve (1) on either player's first
// turn of the game, (2) the same turn it was played to the bench/active,
// (3) twice in one turn. Rare Candy skips stage 1.

import { rulesState, ensureCardData, cardDataCache, fetchCardDetail } from './rules-state.mjs';
import { getStadiumEvolutionSpeed } from './stadium-effects.mjs';
import {
  isModernMegaCard,
  isLegacyMegaCard as isLegacyMegaOrPrimalCard,
} from './card-classify.mjs';

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

/**
 * Normalizes a Pokémon name for EVOLUTION matching (p.21 + App. 9/13):
 * - Level is not part of the name: `Gengar`, `Gengar LV.43` and `Gengar LV.X`
 *   are one species.
 * - `VMAX`/`VSTAR` collapse to `V`, never disappear: `Lapras VMAX` === `Lapras
 *   V` but !== `Lapras` (a VMAX can only evolve from a V).
 * - `ex`/`GX` are stripped — species identity ignores those suffixes.
 * - Owner/form words (`Alolan Meowth`, `Rocket's Meowth`) and `Team Plasma`
 *   are preserved (App. 2/14/27), accents folded.
 *
 * This is deliberately NOT the same as `deck-validation.mjs`'s
 * `officialCardName`: the 4-copy limit keeps `ex`/`V`/`GX`/form suffixes
 * because they ARE part of the name for that rule, while stripping the
 * `Team Plasma ` prefix. Level stripping is the shared part.
 */
export function cleanPokemonName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Level marker ("LV.43", "LV. X") is not part of the name.
    .replace(/\blv\.\s*(?:x|\d+)\b/gi, '')
    // VMAX/VSTAR are V for evolution matching — keep the V, don't erase it.
    .replace(/\b(?:vmax|vstar)\b/gi, 'v')
    // ex/GX are not species identity.
    .replace(/\b(?:ex|gx)\b/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Checks whether two Pokémon names refer to the same base species
 * (e.g. "Charmeleon" matches "Charmeleon ex", "Litten" matches "Litten ex").
 */
export function pokemonNamesMatch(a, b) {
  const normA = cleanPokemonName(a);
  const normB = cleanPokemonName(b);
  if (!normA || !normB) return false;
  return normA === normB;
}

export async function resolveStage1EvolvesFrom(stage1Name) {
  if (!stage1Name) return null;
  const key = stage1Name.toLowerCase();
  if (STAGE1_EVOLVES_FROM.has(key)) return STAGE1_EVOLVES_FROM.get(key);
  const cleanKey = cleanPokemonName(stage1Name);
  if (cleanKey && STAGE1_EVOLVES_FROM.has(cleanKey)) return STAGE1_EVOLVES_FROM.get(cleanKey);

  if (cardDataCache) {
    for (const [, data] of cardDataCache) {
      if (data?.name && (data.name.toLowerCase() === key || pokemonNamesMatch(data.name, stage1Name)) && data.evolvesFrom) {
        const base = data.evolvesFrom.toLowerCase();
        STAGE1_EVOLVES_FROM.set(key, base);
        if (cleanKey) STAGE1_EVOLVES_FROM.set(cleanKey, base);
        return base;
      }
    }
  }

  if (typeof fetch === 'function' && typeof fetchCardDetail === 'function') {
    try {
      const searchName = cleanKey || stage1Name;
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(searchName)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const detail = await fetchCardDetail(list[0].id);
          const from = detail?.evolveFrom || detail?.evolvesFrom;
          if (from) {
            const base = String(from).toLowerCase();
            STAGE1_EVOLVES_FROM.set(key, base);
            if (cleanKey) STAGE1_EVOLVES_FROM.set(cleanKey, base);
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

  const isFirstTurnForPlayer =
    rulesState.turnNumber <= 1 ||
    (rulesState.playerTurnCount &&
      (rulesState.playerTurnCount[player] < 1 ||
        (rulesState.turnPlayer === player && rulesState.playerTurnCount[player] <= 1)));

  if (isFirstTurnForPlayer) {
    return { allowed: false, reason: "Can't evolve on the first turn." };
  }

  // Stadium evolution-speed modifier ("as if it had been in play for 1
  // more turn") relaxes the just-played gate; "costs N less Energy" is
  // surfaced as `costReduce` for the cost layer (no live charge site yet).
  // `bypassJustEvolvedGate` is Grand Tree's own printed exception: "If that
  // Pokémon was evolved in this way, [you] may search... evolve it [again]"
  // — the card explicitly allows chaining a Stage 2 evolve onto a Pokémon
  // that evolved into Stage 1 earlier THIS SAME activation, skipping both
  // the just-played and already-evolved-this-turn gates for that one
  // chained step. It does NOT relax the Basic's own "put into play this
  // turn" gate (still enforced above via wasPlayedThisTurn on the Basic).
  const evoSpeed = getStadiumEvolutionSpeed(player, baseCardInPlay);
  const bypassJustEvolvedGate = Boolean(options.bypassJustEvolvedGate);
  if (wasPlayedThisTurn && !evoSpeed.relaxTurnGate && !bypassJustEvolvedGate) {
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
      pokemonNamesMatch(evolvesFrom, baseName) ||
      (evolvesFromBase && pokemonNamesMatch(evolvesFromBase, baseName)) ||
      (stage1Base && pokemonNamesMatch(stage1Base, baseName)) ||
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
    if (evolvesFrom && baseName && !pokemonNamesMatch(evolvesFrom, baseName)) {
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

  // once per turn per card instance — Grand Tree's chained Stage 2 step is
  // the one printed exception (see bypassJustEvolvedGate above).
  if (!bypassJustEvolvedGate) {
    const instanceId = getCardInstanceId(baseCardInPlay);
    if (instanceId && rulesState.flags[player]?.evolved?.[instanceId]) {
      return { allowed: false, reason: 'Already evolved that Pokémon this turn.' };
    }
    const cleanBase = cleanPokemonName(baseName);
    if (
      !instanceId &&
      (rulesState.flags[player]?.evolved?.[baseName] ||
        (cleanBase && rulesState.flags[player]?.evolved?.[cleanBase]))
    ) {
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
  }

  return { allowed: true, costReduce: evoSpeed.costReduce };
}

// Stage strings vary by source: local card data uses 'Stage 1' while
// TCGdex can return 'Stage1' (and case can differ). Canonicalize to the
// 'Basic' | 'Stage 1' | 'Stage 2' forms used by the stage-order check.
export function normalizeStage(stage) {
  const s = String(stage || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s === 'basic' || s.startsWith('basic')) return 'Basic';
  if (s === 'stage1' || s.startsWith('stage1')) return 'Stage 1';
  if (s === 'stage2' || s.startsWith('stage2')) return 'Stage 2';
  if (s === 'mega' || s.startsWith('mega')) return 'Stage 1';
  // BREAK Evolution is an Evolution (not Basic); it keeps the previous
  // Evolution's stats and attacks (see evolved-pokemon.mjs).
  if (s === 'break' || s.startsWith('break')) return 'BREAK';
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
    const clean = cleanPokemonName(targetCardOrName);
    if (clean) f.evolved[clean] = true;
  } else if (targetCardOrName?.name) {
    f.evolved[targetCardOrName.name.toLowerCase()] = true;
    const clean = cleanPokemonName(targetCardOrName.name);
    if (clean) f.evolved[clean] = true;
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

// Generation 6 (XY, 2015) Mega Evolution / Primal Reversion turn-end rule:
// playing an "M <Name>-EX" or "Primal <Name>-EX" card from hand to evolve a
// Pokémon-EX in play ends the turn immediately, UNLESS the matching
// "<Name> Spirit Link" Trainer card is already attached to that Pokémon.
// Legacy naming only ("M "/"Primal " prefix) — the modern (2025+) "Mega
// <Name> ex" line uses a different, unrelated mechanic and must NOT trigger
// this turn-end. The two predicates live in card-classify.mjs now (rulebook
// 30c Phase 0) and are re-exported for existing importers.
export { isModernMegaCard, isLegacyMegaOrPrimalCard };

// Spirit Link cards are named "<Species> Spirit Link" and attach to the
// Basic/EX Pokémon they cover. Match on the evolving card's base species
// name (its "M "/"Primal " prefix and EX suffix stripped) against every
// attached card's name.
export function hasMatchingSpiritLink(baseCardInPlay, evolvingCardName) {
  const attached = Array.isArray(baseCardInPlay?.attachedCards)
    ? baseCardInPlay.attachedCards
    : [];
  const baseSpecies = cleanPokemonName(
    String(evolvingCardName || '').replace(/^(?:m|primal)\s+/i, '')
  );
  if (!baseSpecies) return false;
  return attached.some((c) => {
    const n = String(c?.name || '').toLowerCase().trim();
    if (!n.endsWith('spirit link')) return false;
    return cleanPokemonName(n.replace(/\s*spirit link\s*$/i, '')) === baseSpecies;
  });
}

// True when evolving `evolvingCard` onto `baseCardInPlay` must end the
// turn immediately per the Gen 6 Mega Evolution / Primal Reversion rule.
export function requiresTurnEndOnEvolve(evolvingCard, baseCardInPlay) {
  if (!isLegacyMegaOrPrimalCard(evolvingCard)) return false;
  if (hasMatchingSpiritLink(baseCardInPlay, evolvingCard?.name)) return false;
  return true;
}

// Playing a Pokémon from hand onto Active/Bench (not evolving onto one
    // already in play) is limited to Basic stage. Restored Pokémon (Fossil
    // items only), BREAK Evolution cards and V-UNION pieces are never played
    // from hand, so reject their stage markers too.
    export async function canPlayPokemonFromHand(pokemonCard) {
      if (!rulesState.enabled) return { allowed: true };

      await ensureCardData(pokemonCard);
      const stage = normalizeStage(pokemonCard.stage);
      const collapsed = String(pokemonCard.stage || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const notPlayableFromHand =
        stage === 'Stage 1' ||
        stage === 'Stage 2' ||
        stage === 'BREAK' ||
        collapsed === 'restored' ||
        collapsed === 'vunion';
      if (notPlayableFromHand) {
        const label = stage || String(pokemonCard.stage || '').trim();
        return {
          allowed: false,
          reason: `${pokemonCard.name} is a ${label} Pokémon — only Basic Pokémon can be played from your hand.`,
        };
      }
      return { allowed: true };
    }
    