import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../../../../../shared/engine/state.mjs';
import { createCard } from '../../../../../shared/engine/cards.mjs';
import { viewFor } from '../../../../../shared/engine/view.mjs';
import { cardArtSrc } from '../card-art-src.mjs';

const ART = 'https://images.pokemontcg.io/base1/58.png';

// The Starting Active carousel (PR #150) hands the picker the hand straight out of the
// authoritative view. Those cards crossed `createCard`, which strips `image` (Invariant 8 /
// H2) and keeps the URL as a bare `src`, so resolving art from `image` alone gave every
// slide src="" — a carousel of blank cards.
test('a netcode card from the authoritative view renders its art', () => {
  const state = createGameState({
    gameId: 'starting-active-art',
    players: { p1: { username: 'A' }, p2: { username: 'B' } },
  });
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 10,
      name: 'Pikachu',
      supertype: 'Pokémon',
      src: ART,
    })
  );

  const handCard = viewFor(state, 'p1').you.zones.hand[0];
  assert.equal(handCard.image, undefined, 'engine cards carry no DOM image');
  assert.equal(cardArtSrc(handCard), ART);
});

test('legacy DOM cards still resolve through their image element', () => {
  assert.equal(cardArtSrc({ image: { src: '/popplio.png' } }), '/popplio.png');
  // A swapped src (attach-card stashes the full art elsewhere) is what the caller sees.
  assert.equal(cardArtSrc({ image: '/raw-string.png' }), '/raw-string.png');
});

test('a candidate with only images.small resolves, and no art resolves to empty', () => {
  assert.equal(cardArtSrc({ images: { small: '/small.png' } }), '/small.png');
  // '' rather than undefined: these values go straight into img.src.
  assert.equal(cardArtSrc({ name: 'Pikachu' }), '');
  assert.equal(cardArtSrc(null), '');
  assert.equal(cardArtSrc(undefined), '');
});
