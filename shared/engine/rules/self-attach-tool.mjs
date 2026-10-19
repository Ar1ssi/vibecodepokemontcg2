// Pokémon that attach themselves to one of your Pokémon as a Pokémon Tool card by their own
// Ability / Poké-Power (out/pkmn-pokemon-cards.json):
//   Shedinja LOT 95 Vessel of Life, Klefki STS 80 Wonder Lock,
//   Unown Q MD 49 QUICK, Unown G GE 57 GUARD, Unown E MT 65 EQUIP.
// The printed effect the card has while attached is rewritten into the wording the Tool readers
// already parse (tool-combat.mjs, tool-conditions.mjs, ability-combat.mjs), so the attached card
// behaves as an ordinary Tool. Pure and DOM-free.

const ATTACH_CLAUSE =
  /discard all cards attached to [^.]+? and attach [^.]+? to 1 of your pok[eé]mon as a pok[eé]mon tool card\.\s*/;

const OPPONENT_TURN_DISCARD =
  /\s*if this card is attached to a pok[eé]mon, discard this card at the end of your opponent's turn\./;

const HOST = 'the pokémon this card is attached to';

// The DP Unown wordings, in the order they are applied to the effect text.
const REWRITES = [
  [/^as long as [^,]+? is attached to a pok[eé]mon, /, ''],
  [/you pay \{c\} less to retreat that pok[eé]mon/, `the retreat cost of ${HOST} is {c} less`],
  [/that pok[eé]mon/g, HOST],
  [/^prevent any damage/, 'prevent all damage'],
];

/**
 * Reads a lowercased Ability text that attaches its own card as a Pokémon Tool.
 * @param {string} lower Lowercased Ability text
 * @returns {{ toolText: string, discardAfterOpponentTurn: boolean } | null}
 */
export function parseSelfAttachTool(lower) {
  const text = String(lower || '').replace(/[‘’]/g, "'");
  const attach = text.match(ATTACH_CLAUSE);
  if (!attach) return null;
  let effect = text.slice(attach.index + attach[0].length);
  const discardAfterOpponentTurn = OPPONENT_TURN_DISCARD.test(effect);
  effect = effect.replace(OPPONENT_TURN_DISCARD, '').trim();
  for (const [pattern, replacement] of REWRITES) effect = effect.replace(pattern, replacement);
  return { toolText: effect, discardAfterOpponentTurn };
}
