import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSpecialEnergyDiscardRedirect } from '../special-energy-discard-redirect.mjs';

// Card text: out/pkmn-special-energy-cards.json, "Recycle Energy" (Unified Minds 257) and
// "Boomerang Energy" (Twilight Masquerade 166).
const RECYCLE_TEXT =
  'This card provides {C} Energy. If this card is discarded from play, put it into your hand instead of the discard pile.';
const BOOMERANG_TEXT =
  'As long as this card is attached to a Pokémon, it provides {C} Energy. If this card is discarded by an effect of an attack used by the Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking.';

const hostImage = { name: 'host image' };
const host = { name: 'Pikachu', type: 'Pokémon', image: hostImage };
const attachedEnergy = (name, text) => ({
  name,
  text,
  type: 'Energy',
  subtype: 'Special Energy',
  image: { relative: hostImage },
});

test('Recycle Energy discarded from Active redirects to hand as one destination', () => {
  const recycle = attachedEnergy('Recycle Energy', RECYCLE_TEXT);
  const redirect = planSpecialEnergyDiscardRedirect({
    movingCard: recycle,
    oZoneId: 'active',
    dZoneId: 'discard',
    zoneArray: [host, recycle],
    attackExecuting: false,
  });
  assert.equal(redirect.destZoneId, 'hand');
  assert.equal(redirect.host, null);
  assert.match(redirect.message, /returns to your hand/);
});

test('Boomerang Energy discarded by its own attack stays on its host', () => {
  const boomerang = attachedEnergy('Boomerang Energy', BOOMERANG_TEXT);
  const redirect = planSpecialEnergyDiscardRedirect({
    movingCard: boomerang,
    oZoneId: 'bench',
    dZoneId: 'discard',
    zoneArray: [host, boomerang],
    attackExecuting: true,
  });
  assert.equal(redirect.destZoneId, 'bench');
  assert.equal(redirect.host, host);
});

test('Boomerang Energy discarded outside an attack goes to the discard pile', () => {
  const boomerang = attachedEnergy('Boomerang Energy', BOOMERANG_TEXT);
  assert.equal(
    planSpecialEnergyDiscardRedirect({
      movingCard: boomerang,
      oZoneId: 'active',
      dZoneId: 'discard',
      zoneArray: [host, boomerang],
      attackExecuting: false,
    }),
    null
  );
});

test('no redirect unless the move is an attached Energy leaving Active/Bench for the discard', () => {
  const recycle = attachedEnergy('Recycle Energy', RECYCLE_TEXT);
  const base = {
    movingCard: recycle,
    oZoneId: 'active',
    dZoneId: 'discard',
    zoneArray: [host, recycle],
    attackExecuting: false,
  };
  assert.equal(planSpecialEnergyDiscardRedirect({ ...base, dZoneId: 'lostZone' }), null);
  assert.equal(planSpecialEnergyDiscardRedirect({ ...base, oZoneId: 'hand' }), null);
  assert.equal(
    planSpecialEnergyDiscardRedirect({
      ...base,
      movingCard: { ...recycle, image: {} },
    }),
    null
  );
  assert.equal(
    planSpecialEnergyDiscardRedirect({
      ...base,
      movingCard: { name: 'Pikachu', type: 'Pokémon', image: { relative: hostImage } },
    }),
    null
  );
});
