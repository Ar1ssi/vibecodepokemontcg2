/**
 * @file Design 074 D7: a solo room is one socket playing both seats. The board keeps its
 * 'self' (bottom) / 'opp' (top) points of view; `nearSeat` names the seat drawn at the
 * bottom, so every outgoing command names the seat of the side it acts for.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

const SEATS = ['p1', 'p2'];

const isSeat = (seat) => SEATS.includes(seat);

/**
 * The seat across the table from `nearSeat`.
 *
 * @param {'p1'|'p2'} nearSeat
 * @returns {'p1'|'p2'}
 */
export function farSeat(nearSeat) {
  return nearSeat === 'p2' ? 'p1' : 'p2';
}

/**
 * The seat a point of view stands for: 'self' is the near seat, 'opp' the far one.
 *
 * @param {'self'|'opp'} side
 * @param {'p1'|'p2'} nearSeat
 * @returns {'p1'|'p2'}
 */
export function seatForSide(side, nearSeat) {
  const near = isSeat(nearSeat) ? nearSeat : 'p1';
  return side === 'opp' ? farSeat(near) : near;
}

/**
 * The point of view a seat is drawn on.
 *
 * @param {'p1'|'p2'} seat
 * @param {'p1'|'p2'} nearSeat
 * @returns {'self'|'opp'}
 */
export function sideForSeat(seat, nearSeat) {
  return seat === seatForSide('self', nearSeat) ? 'self' : 'opp';
}

/**
 * The `seat` an outgoing command or per-seat packet carries: the acting side's seat in a
 * solo room, nothing elsewhere (a normal room acts for the socket's own seat).
 *
 * @param {{ solo?: boolean, nearSeat?: 'p1'|'p2', user?: 'self'|'opp' }} [state]
 * @returns {'p1'|'p2'|undefined}
 */
export function soloCommandSeat({ solo, nearSeat, user } = {}) {
  if (!solo) return undefined;
  return seatForSide(user === 'opp' ? 'opp' : 'self', nearSeat);
}

const ROOM_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ROOM_ID_LENGTH = 8;

/**
 * A fresh solo room id: `solo-` and 8 base36 characters.
 *
 * @param {(count: number) => ArrayLike<number>} [randomBytes] returns `count` random bytes
 * @returns {string}
 */
export function makeSoloRoomId(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(ROOM_ID_LENGTH);
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i += 1) {
    id += ROOM_ID_ALPHABET[(bytes[i] ?? 0) % ROOM_ID_ALPHABET.length];
  }
  return `solo-${id}`;
}

function defaultRandomBytes(count) {
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

/**
 * The solo player's own name — the p1 seat's, which the server knows the room by. A solo
 * room keeps `p2SelfUsername` / `p2OppUsername` on the near / far seats, so after a board
 * flip the owner's name is the far one.
 *
 * @param {{ nearSeat?: 'p1'|'p2', p2SelfUsername?: string, p2OppUsername?: string }} state
 * @returns {string}
 */
export function soloOwnerName({ nearSeat, p2SelfUsername = '', p2OppUsername = '' } = {}) {
  return seatForSide('self', nearSeat) === 'p1' ? p2SelfUsername : p2OppUsername;
}

/**
 * The far seat's display name, as the server seats it (`addSoloPlayer`).
 *
 * @param {string} ownerName
 * @returns {string}
 */
export function soloFarName(ownerName) {
  return `${ownerName} (far)`;
}
