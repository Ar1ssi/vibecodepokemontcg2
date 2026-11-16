// The server's logger: entries route to `room:<id>` when they carry a room, else to `server`.
import { createLogger } from '../../shared/log/logger.mjs';

export function createServerLog({ store, now = Date.now }) {
  const log = createLogger({
    now,
    sink: ({ seq, t, lvl, line, room }) => {
      const streamId = typeof room === 'string' && room !== '' ? `room:${room}` : 'server';
      store.append(streamId, { seq, t, ts: t, lvl, line });
    },
  });
  return { log, forRoom: (roomId) => log.child({ room: roomId }) };
}
