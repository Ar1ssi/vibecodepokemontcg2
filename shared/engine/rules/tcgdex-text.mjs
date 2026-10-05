/**
 * @file TCGdex card text → the notation every parser and reader is tested on (the pkmncards
 * corpora). Older TCGdex sets spell types as words ("any Darkness Energy attached", "is Colorless
 * more", "provides PsychicPsychic Energy") and a few BW rows carry encoding damage or typos. The
 * damage parser symbolized its own input, but the passive Ability, Tool, Stadium and Trainer
 * readers never did, so Darkrai-EX Dark Cloak (bw5-63) and Jellicent Stickiness (bw7-45) were
 * dead in live games (design 063, audit F1). Applied once where TCGdex text enters the engine —
 * client enrichment and the server `cardStats` command (D202) — never inside readers.
 *
 * Pure and idempotent: symbol text (modern TCGdex, pkmncards) passes through unchanged.
 */

import { symbolizeTypeWords } from './attack-text.mjs';

// Each repair names the TCGdex rows that print it (snapshot 2026-10-01).
const REPAIRS = [
  // bw6-64 Claydol Rapid Spin, bw9-110 Thundurus-EX Thunderous Noise: "Pok��mon".
  [/Pok�+mon/g, 'Pokémon'],
  // bw2-25 Basculin Splatter: "one of your oppoent's Pokémon".
  [/\boppoent(?=['’]s\b)/g, 'opponent'],
  // bw4-12 Arcanine Blazing Mane: "Knocked Out),the Attacking Pokémon".
  [/([),])(?=[A-Za-z])/g, '$1 '],
];

/** One TCGdex text in parser notation; anything that is not a string is returned unchanged. */
export function normalizeTcgdexText(text) {
  if (typeof text !== 'string' || text === '') return text;
  let out = text;
  for (const [pattern, replacement] of REPAIRS) out = out.replace(pattern, replacement);
  return symbolizeTypeWords(out);
}

/** A copy of an attack or ability entry with its rules text normalized (`text` and `effect`). */
export function normalizeTcgdexEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if (typeof out.text === 'string') out.text = normalizeTcgdexText(out.text);
  if (typeof out.effect === 'string') out.effect = normalizeTcgdexText(out.effect);
  return out;
}
