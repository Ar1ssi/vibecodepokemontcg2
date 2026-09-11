import { socket, systemState } from '../../state.js';
import { determineDeckData } from '../general/determine-deckdata.js';
import { getZone } from '../zones/get-zone.js';
import { Card } from './card.js';
import { Cover } from './cover.js';
import { isE2eMode, stampE2eCard } from '../general/e2e-mode.mjs';
import { emitCardStats } from '../netcode/card-stats.js';
import { ensureCardData } from '/shared/engine/rules/rules-state.mjs';


export const buildDeck = (user) => {
  const deckData = determineDeckData(user);
  const deck = getZone(user, 'deck');
  let syncInstance = 0;
  for (const [quantity, name, type, imageURL, number, set, tcgId] of deckData) {
    for (let i = 0; i < quantity; i++) {
      const card = new Card(user, name, type, imageURL, number, set, tcgId);
      card.cardId = `c_${syncInstance}`;
      card.syncInstance = syncInstance++;
      if (card.image) {
        card.image.cardId = card.cardId;
        card.image.syncInstance = card.syncInstance;
      }
      // Only stamp the synthetic e2eFixtureDeck() rows (set === 'e2e') — a real
      // decklist loaded via loadDeckList/loadDeckData while `?e2e=1` is active must
      // still get its true stage/evolvesFrom from ensureCardData's TCGdex fetch.
      if (isE2eMode() && set === 'e2e') stampE2eCard(card);
      deck.array.push(card);
      deck.element.appendChild(card.image);
    }
  }
  const targetCardBackSrc =
    user === 'self'
      ? systemState.cardBackSrc
      : systemState.isTwoPlayer
        ? systemState.p2OppCardBackSrc
        : systemState.p1OppCardBackSrc;
  const cover = new Cover(user, 'deckCover', targetCardBackSrc);
  deck.elementCover.appendChild(cover.image);

  deck.array.forEach((card) => {
    const img = new Image();
    img.src = card.image.src;
    document.body.appendChild(img);
    document.body.removeChild(img);
  });

  // Every card built here, captured before anything is dealt. `deck.array` is mutated as
  // setup deals prizes and the opening hand, so reading it later would only ever see the
  // undealt remainder — and the cards that matter most (the ones actually in play) would
  // be the ones left out.
  const builtCards = [...deck.array];

  // Pre-warm card metadata in the background so deck searches don't incur network latency.
  // Capped concurrency, not a bare Promise.all: a 60-card deck otherwise fires dozens of
  // simultaneous TCGdex requests, and a burst that size gets bot-detection-blocked by
  // TCGdex/Cloudflare (surfaces as every request failing CORS, not as a rate-limit error).
  const ENRICHMENT_CONCURRENCY = 6;
  async function enrichWithLimit(cards) {
    let next = 0;
    const worker = async () => {
      while (next < cards.length) {
        const card = cards[next++];
        await ensureCardData(card);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(ENRICHMENT_CONCURRENCY, cards.length) }, worker)
    );
  }
  const enriched = enrichWithLimit(builtCards);

  // Design 004 slice 6: the playtest bot must not start acting on cards whose hp/attacks/
  // stage/subtypes haven't resolved yet — unenriched cards make options() under-report
  // (no attack, no evolve) and the bot passes instead. Parked here for __ptcg.cardDataReady()
  // to await; read by nothing else, so live play is unchanged. Already-settled swallow of
  // rejections matches the two consumers below: partial data still beats none.
  systemState.cardDataReady = enriched.then(
    () => true,
    () => false
  );

  // Design 002 I26: the server's cards are built from deck rows, which carry no hp or
  // attacks — without this it can never adjudicate a knockout. Enrichment is what resolves
  // that data, so the send waits on it; only the local player's own deck is sent, since the
  // opponent's client sends its own.
  // Sends whatever resolved, even if enrichment failed: a card can carry usable data
  // without a successful lookup (the e2e fixture stamps its own), and a network failure
  // for one card must not suppress the stats for every other card in the deck.
  enriched
    .catch(() => {})
    .then(() => {
      if (!systemState.serverAuthoritative || user !== 'self') return;
      return emitCardStats({
        socket,
        roomId: systemState.roomId,
        cards: builtCards,
      });
    })
    .catch(() => {});
};
