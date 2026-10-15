/**
 * @file The always-open rooms listed in the Multiplayer tab (design 069). Pure.
 * They are not stored anywhere: the server derives each room's listing from its live room state,
 * and a room nobody has joined yet is simply empty.
 */

export const PUBLIC_ROOM_PREFIX = 'public:';

const PUBLIC_ROOM_COUNT = 8;

/** @type {ReadonlyArray<Readonly<{ id: string, name: string }>>} */
export const PUBLIC_ROOMS = Object.freeze(
  Array.from({ length: PUBLIC_ROOM_COUNT }, (_, index) =>
    Object.freeze({ id: `${PUBLIC_ROOM_PREFIX}${index + 1}`, name: `Room ${index + 1}` })
  )
);

const NAME_BY_ID = new Map(PUBLIC_ROOMS.map((room) => [room.id, room.name]));

/** @param {unknown} roomId */
export function isPublicRoomId(roomId) {
  return typeof roomId === 'string' && NAME_BY_ID.has(roomId);
}

/**
 * @param {unknown} roomId
 * @returns {string|null} the room's display name, or null for any other room
 */
export function publicRoomName(roomId) {
  return isPublicRoomId(roomId) ? NAME_BY_ID.get(roomId) : null;
}
