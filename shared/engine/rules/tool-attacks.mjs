/**
 * @file Attacks a Pokémon Tool grants to its holder (design 035, slice 7).
 *
 * TM/Cube Items print their attack in the card text ("{F} → Violent Rage : 10× …")
 * rather than in `attacks[]`, so the server reads either source and returns attacks
 * shaped like printed ones, tagged `granted`. Pure: no state, no randomness.
 */

const TYPE_SYMBOLS = {
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
  c: 'Colorless',
};

const ARROW = /[→⇢]/;
// The cost symbols immediately before an arrow ("… discard Fighting Cube 01. {F} →").
const COST_RUN = /((?:\{[A-Za-z]\}\s*)+)$/;
const DAMAGE_SPLIT = /^\s*(.*?)\s*:\s*([0-9]+\s*[+×xX-]?)(?:\s+|$)(.*)$/s;
// Sentence starts that begin an attack's effect text (used when the attack prints no
// damage, so there is no ": <damage>" delimiter to split on).
const EFFECT_STARTERS =
  /(?:^|\s)(The Defending|If |Flip |Choose |Before doing damage|This attack|Your opponent|Draw |Put |Search |Each |During |You may|For each|Remove |Attach |Shuffle |Move |Look at|Take |Prevent |Does |Return |Switch |Reveal |Until |Whenever |Once |As long as|When |Then, |You can|Do |Both |At the end|Discard |Knock Out|Heal |Place )/;

function parseCost(prefix) {
  const cost = [];
  for (const m of String(prefix || '').matchAll(/\{([A-Za-z])\}/g)) {
    const name = TYPE_SYMBOLS[m[1].toLowerCase()];
    if (name) cost.push(name);
  }
  return cost;
}

function splitBody(body) {
  const damage = body.match(DAMAGE_SPLIT);
  if (damage) {
    return { name: damage[1].trim(), damage: damage[2].trim(), text: damage[3].trim() };
  }
  const starter = body.match(EFFECT_STARTERS);
  if (starter && starter.index > 0) {
    return {
      name: body.slice(0, starter.index).trim(),
      damage: 0,
      text: body.slice(starter.index).trim(),
    };
  }
  return { name: body.trim(), damage: 0, text: '' };
}

/**
 * The attacks `card` grants when attached to a Pokémon: its `attacks[]` when the
 * card data carries them, otherwise the printed "→" lines in its text.
 *
 * @param {object} card
 * @returns {object[]} attacks tagged `granted` ([] when the card grants none)
 */
export function parseGrantedAttacks(card) {
  if (!card) return [];
  const printed = Array.isArray(card.attacks) ? card.attacks.filter((a) => a?.name) : [];
  if (printed.length > 0) return printed.map((a) => ({ ...a, granted: true }));

  const text =
    [card.text, card.effect, card.cardText].find((v) => typeof v === 'string' && v) || '';
  const segments = text.split(ARROW);
  if (segments.length < 2) return [];

  const out = [];
  for (let i = 1; i < segments.length; i++) {
    const costPrefix = (segments[i - 1].match(COST_RUN) || [''])[0];
    const body = segments[i].trim();
    if (!body) continue;
    const parsed = splitBody(body);
    if (!parsed.name) continue;
    out.push({ ...parsed, cost: parseCost(costPrefix), granted: true });
  }
  return out;
}
