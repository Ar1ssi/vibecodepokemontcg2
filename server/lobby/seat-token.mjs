/**
 * @file Seat tokens for public rooms (design 069). Pure apart from the default token mint.
 * The lobby lists seated usernames, so a username alone must not win a seat back: the player who
 * first sat down gets a random token, and only a claim carrying it counts as theirs.
 */

import { randomUUID } from 'node:crypto';

const MAX_TOKEN_LENGTH = 100;

const tokensOf = (room) => {
  if (!room.seatTokens) room.seatTokens = new Map();
  return room.seatTokens;
};

/**
 * @param {{ seatTokens?: Map<string, string> }} room
 * @param {string} username
 * @param {() => string} [mint]
 * @returns {string} the new token (replaces any earlier one for this username)
 */
export function issueSeatToken(room, username, mint = randomUUID) {
  const token = mint();
  tokensOf(room).set(username, token);
  return token;
}

/** @param {unknown} token */
const isWellFormedToken = (token) =>
  typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;

/**
 * @param {{ players: Set<string>, seatTokens?: Map<string, string> }} room
 * @param {string} username
 * @param {unknown} token
 * @returns {'new'|'owner'|'taken'}
 */
export function checkSeatClaim(room, username, token) {
  if (!room?.players?.has(username)) return 'new';
  const expected = room.seatTokens?.get(username);
  if (expected && isWellFormedToken(token) && token === expected) return 'owner';
  return 'taken';
}
