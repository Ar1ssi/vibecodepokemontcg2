import { summarizePayload } from '../../../shared/log/payload-policy.mjs';

export function tapClientSocket(socket, { log }) {
  const safe = (fn) => (...args) => {
    try {
      fn(...args);
    } catch {
      // capture must never throw into the page
    }
  };
  const record = (direction) =>
    safe((event, ...args) => {
      const summary = summarizePayload(event, args, { trace: log.enabled('trace') });
      if (!summary) return;
      const { maxBytes, ...detail } = summary;
      log.debug('socket', `${direction}.${event}`, detail, {
        room: typeof args[0]?.roomId === 'string' ? args[0].roomId : undefined,
        cs: Number.isInteger(args[0]?.clientSeq) ? args[0].clientSeq : undefined,
        sv: detail.sv,
        maxBytes,
      });
    });
  const onIn = record('in');
  const onOut = record('out');
  const onConnect = safe(() =>
    log.info('socket', 'connect', {
      id: socket.id,
      recovered: Boolean(socket.recovered),
      transport: socket.io?.engine?.transport?.name ?? null,
    }),
  );
  const onDisconnect = safe((reason) => log.warn('socket', 'disconnect', { reason }));
  const onConnectError = safe((err) => log.warn('socket', 'connect_error', { message: err?.message }));
  const manager = socket.io;
  const onAttempt = safe((n) => log.info('socket', 'reconnect_attempt', { n }));
  const onReconnect = safe((n) => log.info('socket', 'reconnect', { n }));
  const onFailed = safe(() => log.error('socket', 'reconnect_failed'));
  // The engine is replaced on every reconnect, so the listener is (re)attached on each open.
  const onUpgrade = safe((transport) => log.info('socket', 'upgrade', { transport: transport?.name ?? null }));
  const tappedEngines = new WeakSet();
  const onOpen = safe(() => {
    const engine = manager?.engine;
    if (!engine?.on || tappedEngines.has(engine)) return;
    tappedEngines.add(engine);
    engine.on('upgrade', onUpgrade);
  });

  socket.onAny?.(onIn);
  socket.onAnyOutgoing?.(onOut);
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('connect_error', onConnectError);
  manager?.on?.('reconnect_attempt', onAttempt);
  manager?.on?.('reconnect', onReconnect);
  manager?.on?.('reconnect_failed', onFailed);
  manager?.on?.('open', onOpen);
  onOpen();
  if (socket.connected) onConnect();

  return () => {
    socket.offAny?.(onIn);
    socket.offAnyOutgoing?.(onOut);
    socket.off?.('connect', onConnect);
    socket.off?.('disconnect', onDisconnect);
    socket.off?.('connect_error', onConnectError);
    manager?.off?.('reconnect_attempt', onAttempt);
    manager?.off?.('reconnect', onReconnect);
    manager?.off?.('reconnect_failed', onFailed);
    manager?.off?.('open', onOpen);
    manager?.engine?.off?.('upgrade', onUpgrade);
  };
}
