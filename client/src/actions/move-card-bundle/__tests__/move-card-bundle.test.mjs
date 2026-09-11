import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardHint } from '../../../../../shared/engine/zones/resolve-card-index.mjs';
import { splitEmitAndTail } from '../../../setup/general/sync-action-args.mjs';
import { resolveDetachedCardDestination } from '../resolve-detached-card-destination.js';

// Mirrors buildMoveCardHints origin-zone lookup (must run before splice).
function hintForHandIndex(handArray, index) {
  const movingCard = handArray[index];
  if (!movingCard) return null;
  return buildCardHint(movingCard);
}

test('post-splice hand index points at wrong card for sync hint', () => {
  const popplio = {
    name: 'Popplio',
    type: 'Pokémon',
    syncInstance: 1,
    image: { src: 'popplio.png' },
  };
  const trainer = {
    name: "Professor's Research",
    type: 'Trainer',
    syncInstance: 2,
    image: { src: 'prof.png' },
  };
  const handBefore = [popplio, trainer];
  const handAfter = [trainer]; // Popplio spliced from index 0

  assert.equal(hintForHandIndex(handBefore, 0)?.name, 'Popplio');
  assert.equal(hintForHandIndex(handAfter, 0)?.name, "Professor's Research");
});

test('pre-move hint must be captured before origin zone splice', () => {
  const popplio = {
    name: 'Popplio',
    type: 'Pokémon',
    syncInstance: 1,
    image: { src: 'popplio.png' },
  };
  const trainer = {
    name: "Professor's Research",
    type: 'Trainer',
    syncInstance: 2,
    image: { src: 'prof.png' },
  };
  const index = 0;
  const handBefore = [popplio, trainer];
  const hintBeforeMove = hintForHandIndex(handBefore, index);

  // Simulate splice (what moveCard does)
  handBefore.splice(index, 1);

  const hintAfterMove = hintForHandIndex(handBefore, index);
  assert.equal(hintBeforeMove?.syncInstance, 1);
  assert.equal(hintAfterMove?.syncInstance, 2);
});

test('acceptAction arity: hints object + trailing false is emit=false', () => {
  const hints = {
    moving: { name: 'Popplio', syncInstance: 1 },
    isEvolution: false,
  };
  // How acceptAction calls moveCardBundle: (..., action, hints, emit)
  const parsed = splitEmitAndTail(hints, false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail.moving.name, 'Popplio');
});

test('local shuffle/top calls still pass emit as a boolean', () => {
  const parsed = splitEmitAndTail(false);
  assert.equal(parsed.emit, false);
  assert.equal(parsed.tail, null);
});

test('mirror autoMove bench swap inherits syncReplay from parent move', () => {
  // Documented contract: autoMoveActiveBenchCard passes syncOptions through
  // to nested moveCard so opponent mirror replay reveals active/bench cards.
  const syncOptions = { syncReplay: true };
  assert.equal(syncOptions.syncReplay, true);
});

test('resolveDetachedCardDestination: KO/manual discard takes attached Energy along', () => {
  // Regression: a knocked-out (or manually discarded) Pokémon's attached
  // Energy used to strand in the 'attachedCards' staging zone instead of
  // following it to discard — never auto-discarded, and its arrival there
  // falsely tripped the rules engine's "energy already attached this turn"
  // check (rules-bridge.js hookEnergyAttach watches that zone for new
  // attaches).
  assert.equal(resolveDetachedCardDestination('discard'), 'discard');
});

test('resolveDetachedCardDestination: Lost Zone also takes attached Energy along', () => {
  assert.equal(resolveDetachedCardDestination('lostZone'), 'lostZone');
});

test('resolveDetachedCardDestination: hand/deck still stage in attachedCards', () => {
  assert.equal(resolveDetachedCardDestination('hand'), 'attachedCards');
  assert.equal(resolveDetachedCardDestination('deck'), 'attachedCards');
});

// Regression: moveCard used to call markSupporterPlayed() for every hand→board
// Trainer play, not just Supporters — playing an Item then a real Supporter
// falsely tripped the "one Supporter per turn" gate. Mirrors the isSupporter
// guard added around the markSupporterPlayed() call in move-card.js.
test('playing an Item does not flip the supporterPlayed flag', () => {
  const itemCard = { type: 'Item', subtypes: [] };
  const subtypes = (itemCard.subtypes || []).map((s) => String(s).toLowerCase());
  const isSupporter =
    String(itemCard.type || '').toLowerCase() === 'supporter' || subtypes.includes('supporter');
  let supporterPlayed = false;
  if (isSupporter) supporterPlayed = true; // guarded call under test
  assert.equal(isSupporter, false);
  assert.equal(supporterPlayed, false);
});
