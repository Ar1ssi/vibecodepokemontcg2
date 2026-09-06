/** True when the page was opened for the two-player Playwright harness. */
export function isE2eMode(search = '', storage = null) {
  try {
    const query = search || (typeof location !== 'undefined' ? location.search : '');
    if (new URLSearchParams(query).get('e2e') === '1') return true;
  } catch {
    // ignore
  }
  try {
    const store =
      storage ||
      (typeof localStorage !== 'undefined' ? localStorage : null);
    return store?.getItem('ptcg-sim.e2e') === '1';
  } catch {
    return false;
  }
}

/** Skip live TCGdex enrichment so fixture Pokémon count as Basics. */
export function stampE2eCard(card) {
  if (!card) return card;
  card.hp = card.hp || 60;
  card.stage = card.stage || 'Basic';
  if (card.weakness === undefined) card.weakness = null;
  if (!Array.isArray(card.attacks) || card.attacks.length === 0) {
    card.attacks = [{ name: 'Tackle', damage: '10', text: '' }];
  }
  return card;
}

const FACE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

/** 20 uniquely named Basics — enough for prizes + hand without a live API. */
export function e2eFixtureDeck(prefix = 'E2E') {
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    rows.push([
      '1',
      `${prefix} ${i}`,
      'Pokémon',
      FACE,
      String(i).padStart(3, '0'),
      'e2e',
      `e2e-${prefix}-${i}`,
    ]);
  }
  return rows;
}

/** Coin-flip / mulligan delays collapse in e2e so the harness can finish. */
export function e2eDelayMs(liveMs) {
  return isE2eMode() ? 0 : liveMs;
}
