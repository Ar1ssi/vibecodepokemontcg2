/**
 * Split a pkmncards printed-text blob into ordered attack / ability entries.
 * Shared by the full Pokémon audit and the Ancient-Trait audit so the header
 * rules cannot drift between them.
 *
 * Header lines are recognized by the printed "→ / ⇢" separators; every line
 * after a header (until the next header) is that entry's effect text.
 */

export const TYPE_SYMBOLS = {
  G: 'Grass',
  R: 'Fire',
  W: 'Water',
  L: 'Lightning',
  P: 'Psychic',
  F: 'Fighting',
  D: 'Dark',
  M: 'Metal',
  Y: 'Fairy',
  N: 'Dragon',
  C: 'Colorless',
};

export const ABILITY_HEADER =
  /^(ability|pok[ée]-power|pok[ée]-body|pok[ée]mon power|ancient trait|held item)\s*(?:⇢\s*(.*?))?\s*$/i;
export const ATTACK_HEADER = /^(.*?)→\s*(.+?)(?:\s*:\s*([0-9]+\s*[+×xX-]?))?\s*$/;
export const CARD_NOTE = /^\(this card cannot be used at official tournaments\.?\)$/i;
// Static card-text clause that is neither an attack nor an ability (Buried
// Fossil's "play a card that evolves from Mysterious Fossil on top of it").
export const STATIC_CARD_TEXT = /^you may play a pokémon card that evolves from .* on top of /i;

export function parseCost(prefix) {
  const cost = [];
  for (const m of prefix.matchAll(/\{([A-Za-z])\}/g)) {
    cost.push(TYPE_SYMBOLS[m[1].toUpperCase()] || m[1].toUpperCase());
  }
  return cost;
}

export function isAttackHeaderPrefix(prefix) {
  return /^[\s,\-–—]*$/.test(prefix.replace(/\{[^}]*\}/g, ''));
}

export function parseDamageNumber(raw) {
  if (!raw) return 0;
  const m = String(raw).match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function splitCard(card) {
  const items = [];
  const unparsed = [];
  let current = null;
  let pendingAbilityType = null;

  const flush = () => {
    if (current) {
      current.text = current.effectLines.join('\n').trim();
      delete current.effectLines;
      items.push(current);
      current = null;
    }
  };

  for (const raw of String(card.text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (CARD_NOTE.test(line) || STATIC_CARD_TEXT.test(line)) continue;

    if (/^vstar power$/i.test(line)) {
      pendingAbilityType = 'VSTAR Power';
      continue;
    }

    const abilityHeader = line.match(ABILITY_HEADER);
    if (abilityHeader) {
      flush();
      current = {
        kind: 'ability',
        abilityType: pendingAbilityType || abilityHeader[1],
        name: (abilityHeader[2] || '').trim(),
        effectLines: [],
      };
      pendingAbilityType = null;
      continue;
    }

    const attackHeader = line.match(ATTACK_HEADER);
    if (attackHeader && isAttackHeaderPrefix(attackHeader[1])) {
      flush();
      const damageRaw = (attackHeader[3] || '').trim() || null;
      current = {
        kind: 'attack',
        name: attackHeader[2].trim(),
        cost: parseCost(attackHeader[1]),
        damage: parseDamageNumber(damageRaw),
        damageText: damageRaw,
        effectLines: [],
      };
      continue;
    }

    if (current) {
      current.effectLines.push(line);
    } else {
      unparsed.push(line);
    }
  }
  flush();
  return { items, unparsed };
}
