// Gate: TCGdex prints curly apostrophes ("opponent’s") where the pkmncards corpora print
// straight ones. Every attack and ability in the corpora must parse the same either way
// (parse-hole sweep D3: Magcargo ex Ground Burn, M Camerupt-EX Magma Eruption and Palossand-GX
// Sandy Fear-GX read their mill scaling only with straight quotes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitCard } from './split-card-text.mjs';
import { parseAttackDamage } from '../../shared/engine/rules/damage-parser.mjs';
import { parseAttackSteps } from '../../shared/engine/rules/attack-steps.mjs';
import { parseAbility } from '../../shared/engine/rules/abilities.mjs';

const CORPORA = ['out/pkmn-pokemon-cards.json', 'out/pkmn-gx-cards.json'];
const curly = (text) => text.replace(/'/g, '’');
const straight = (value) => JSON.stringify(value ?? null).replace(/’/g, "'");
const safe = (read) => {
  try {
    return straight(read());
  } catch (error) {
    return `THROW ${error.message}`;
  }
};

test('attack and ability parses do not depend on the apostrophe glyph', () => {
  const drift = [];
  const seen = new Set();
  for (const file of CORPORA) {
    for (const card of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      for (const item of splitCard(card).items) {
        if (!item.text || !item.text.includes("'")) continue;
        const key = `${item.kind}|${item.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const reads =
          item.kind === 'attack'
            ? [
                ['steps', (text) => parseAttackSteps(text, { selfName: card.name })],
                ['damage', (text) => parseAttackDamage({ damage: item.damageText, text }, { name: card.name }, {}, {}).notes],
              ]
            : [['ability', (text) => parseAbility(text)]];
        for (const [what, read] of reads) {
          if (safe(() => read(item.text)) !== safe(() => read(curly(item.text)))) {
            drift.push(`${card.name} — ${item.name} (${card.set} ${card.number}): ${what}`);
          }
        }
      }
    }
  }
  assert.deepEqual(drift, []);
});
