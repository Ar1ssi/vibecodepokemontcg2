/** Front faces: TCG Live HUD badges (pnpm fx:import-status). */
export const STATUS_TOKEN_FRONT = {
  'status-poison': '/src/assets/status-markers/poison-badge.webp',
  'status-burn': '/src/assets/status-markers/burn-badge.webp',
};

/** Bulbapedia Coin_Back_TM.png — shared back for all status tokens. */
export const STATUS_TOKEN_BACK = '/src/assets/coins/coin-back-tm.png';

export const STATUS_TOKEN_TYPES = ['status-poison', 'status-burn'];

export function isStatusTokenType(className) {
  return STATUS_TOKEN_TYPES.includes(className);
}
