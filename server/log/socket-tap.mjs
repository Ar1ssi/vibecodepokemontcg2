// Socket.IO taps: every in/out event (through `summarizePayload`), connect/disconnect/error, and
// room membership via the adapter. Handler bodies swallow errors so a tap never breaks a socket.
import { summarizePayload } from '../../shared/log/payload-policy.mjs';

const LOBBY_WATCHERS = 'lobby:watchers';

export function defaultRoomOf(socket, payload) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.roomId === 'string') return payload.roomId;
    if (typeof payload.gameId === 'string') return payload.gameId;
  }
  for (const room of socket.rooms ?? []) {
    if (room !== socket.id && room !== LOBBY_WATCHERS) return room;
  }
  return null;
}

function swallow(fn) {
  return (...args) => {
    try {
      fn(...args);
    } catch {
      // taps never throw into socket handling
    }
  };
}

export function tapSocket(socket, { log, roomOf = defaultRoomOf, seatOf = () => null }) {
  const id = socket.id;
  let lastRoom = null;

  function record(direction, event, args) {
    const summary = summarizePayload(event, args);
    if (summary === null) return;
    const { maxBytes, ...detail } = summary;
    const room = roomOf(socket, args[0]);
    log.debug(
      'socket',
      `${direction}.${event}`,
      { id, ...detail },
      {
        room,
        seat: seatOf(id, room),
        cs: Number.isInteger(args[0]?.clientSeq) ? args[0].clientSeq : undefined,
        sv: detail.sv,
        maxBytes,
      }
    );
  }

  try {
    log.info('socket', 'connect', {
      id,
      transport: socket.conn?.transport?.name ?? null,
      recovered: Boolean(socket.recovered),
      ua: socket.handshake?.headers?.['user-agent'] ?? null,
    });
  } catch {
    // see swallow()
  }
  socket.onAny(swallow((event, ...args) => record('in', event, args)));
  socket.onAnyOutgoing(swallow((event, ...args) => record('out', event, args)));
  socket.on('disconnecting', swallow(() => {
    lastRoom = defaultRoomOf(socket, null);
  }));
  socket.on('disconnect', swallow((reason) => log.info('socket', 'disconnect', { id, reason }, { room: lastRoom })));
  socket.on('error', swallow((err) => log.warn('socket', 'error', { id, error: err })));
}

export function tapServer(io, { log, store, clientOf = () => null }) {
  io.engine.on(
    'connection_error',
    swallow((err) => log.warn('socket', 'connection_error', { code: err?.code, message: err?.message }))
  );
  const adapter = io.of('/').adapter;
  const ignored = (room, id) => room === id || room === LOBBY_WATCHERS;

  adapter.on(
    'join-room',
    swallow((room, id) => {
      if (ignored(room, id)) return;
      log.info('room', 'join', { id }, { room });
      const clientId = clientOf(id);
      if (typeof clientId === 'string') store.link(clientId, room, { socketId: id });
    })
  );
  adapter.on(
    'leave-room',
    swallow((room, id) => {
      if (ignored(room, id)) return;
      log.info('room', 'leave', { id }, { room });
      const clientId = clientOf(id);
      if (typeof clientId === 'string') store.unlink(clientId, room);
    })
  );
  adapter.on(
    'delete-room',
    swallow((room) => {
      if (room === LOBBY_WATCHERS || !store.stream(`room:${room}`)) return;
      log.info('room', 'deleted', {}, { room });
      store.close(`room:${room}`);
    })
  );
}
