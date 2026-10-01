import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = fs.readFileSync(path.resolve(here, '..', 'trainer-execution.js'), 'utf8');
const auditSrc = fs.readFileSync(
  path.resolve(here, '..', '..', '..', '..', '..', 'scripts', 'audit-all-trainers.mjs'),
  'utf8'
);

// Step types added for the pkmncards coverage work. Each must be (a) emitted by
// the parser into the client's executor switch and (b) registered in the audit
// script's EXECUTED_STEP_TYPES set, or the card silently no-ops.
const NEW_STEP_TYPES = [
  'reviveFromDiscard',
  'moveDamageCounters',
  'lookAtOpponentHand',
  'attachFromHand',
  'attachAttackTool',
  'revealPrizes',
  'prizeToHand',
  'clearStatus',
  'discardStadium',
  'putDiscardOnTop',
  'energyToHand',
  'opponentDiscardToHand',
  'opponentDiscardToDeckBottom',
  'shufflePokemonIntoDeck',
  'discardOwnBenchPokemon',
  'shuffleDiscardIntoDeck',
  'opponentHandShuffleDeck',
  'opponentActiveEnergyToDeck',
  'opponentHandToBenchBasic',
  'eachPlayerDiscardFromHand',
  'eachPlayerDraw',
  'eachPlayerReturnBench',
  'eachPlayerShuffleHandDraw',
  'eachPlayerHandToFive',
  'eachPlayerRecoverPokemon',
  'discardAnyThenDraw',
  'discardPokemonThenDraw',
  'opponentHandShuffleItemsDraw',
  'discardAllTrainerInPlay',
  'returnStadiumToHand',
  'shuffleDeckOnly',
  'clearAttackEffects',
  'revealUntilCard',
  'lookAtFaceDownPrize',
  'putHandBasicAsActive',
  'healPerHeads',
  'healEachActive',
  'opponentChoosesFromTop',
  'millPerHeads',
  'flipUntilTailsDraw',
  'toolsToHand',
  'switchHandWithTop',
  'putHandBottomThenDraw',
  'shuffleHandCardsThenDraw',
  'drawBottom',
  'moveEnergyOpponent',
  'sendEnergyToDeckBottom',
  'revealTopEnergy',
  'discardAllEnergyFromActive',
  'searchToTop',
  'healAllOwnAndDiscardEnergy',
  'healOneDiscardEnergy',
  'rearrangeTop',
  'shuffleDiscardThenMill',
  'discardRandomOpponentHandIfSupporter',
  'lostZoneCost',
  'toolOrStadiumToLostZone',
  'sendEnergyToLostZone',
  'opponentDiscardToLostZonePerPokemon',
  // I232: WotC Super Potion / Super Energy Removal own-Energy cost (TCGdex base1-90, base1-79).
  'discardOwnAttachedEnergy',
];

for (const type of NEW_STEP_TYPES) {
  test(`${type}: client executor has a case`, () => {
    assert.match(clientSrc, new RegExp(`case '${type}':`));
  });

  test(`${type}: audit EXECUTED_STEP_TYPES knows it`, () => {
    assert.match(auditSrc, new RegExp(`'${type}'`));
  });
}

test('client executor switch contains no duplicate step-type case', () => {
  const seen = new Set();
  const dupes = [];
  for (const [, type] of clientSrc.matchAll(/case '([A-Za-z0-9_]+)':/g)) {
    if (seen.has(type)) dupes.push(type);
    seen.add(type);
  }
  assert.deepEqual(dupes, []);
});

// I232: WotC Super Potion (TCGdex base1-90) parses to healAmount target 'costHost'; the legacy
// executor must heal the Pokémon whose Energy paid the cost, not offer a free pick.
test("healAmount: client executor reads target 'costHost'", () => {
  assert.match(clientSrc, /step\.target === 'costHost'/);
  assert.match(clientSrc, /costHost = entry\.parent/);
});
