import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GameRoom } from './game/room.mjs';
import { createTurnOrderTransport } from './game/turn-order-transport.mjs';
import { planRoomSweep } from './game/room-sweep.mjs';
import { extractDeckData, extractDeckFormat } from './game/deck-packet.mjs';
import {
  findFirstDivergentZone,
  hashOwnerViewZones,
} from './game/sync-check.mjs';
import { PROTOCOL_VERSION } from '../shared/engine/commands.mjs';
import {
  applyRoomFormatAction,
  clearRoomFormatProposal,
  emptyRoomFormat,
} from '../shared/engine/room-format.mjs';
import { roomFormatLocked, roomFormatSeatRefusal } from './game/room-format-seat.mjs';
import { isPublicRoomId } from '../shared/lobby/public-rooms.mjs';
import { buildLobbySnapshot } from './lobby/lobby-directory.mjs';
import {
  createDebouncer,
  decideJoin,
  decideReconnect,
  planSweep,
} from './lobby/public-seat-flow.mjs';
import {
  forgetSeat,
  markSeatConnected,
  markSeatDisconnected,
} from './lobby/seat-presence.mjs';
import { issueSeatToken } from './lobby/seat-token.mjs';
import { cardArtProxyHandler, createCardArtProxy } from './card-art-proxy.mjs';
import { createTcgdexProxy, tcgdexProxyHandler } from './tcgdex-proxy.mjs';
import { cacheControlFor } from './sfx-cache.mjs';
import { readServerAuthoritative } from './netcode-mode.mjs';
import { resolveFoilTextureBase } from './tcgl-foil-config.mjs';

// On unless SERVER_AUTHORITATIVE is 0, false, off or no (the legacy relay, kept until I251 retires it).
const netcodeMode = readServerAuthoritative(process.env.SERVER_AUTHORITATIVE);
const SERVER_AUTHORITATIVE = netcodeMode.serverAuthoritative;
// eslint-disable-next-line no-console
if (netcodeMode.warning) console.warn(netcodeMode.warning);

// The `?e2e=1` test bridge (window.__ptcg) is a scripting API over the local player's own
// board. It is shipped to every browser but must only ARM where a harness is meant to run:
// without this, any visitor could enable it from the address bar. Opt in explicitly with
// PTCG_E2E=1, or implicitly outside production (Render sets NODE_ENV=production, so the
// deployed site is closed by default while local dev keeps working with no extra flags).
const E2E_ENABLED =
  process.env.PTCG_E2E === '1' ||
  process.env.PTCG_E2E === 'true' ||
  process.env.NODE_ENV !== 'production';

// Sweep grace (Finding 5): a GameRoom with no connected sockets is only swept
// once it has also been idle this long, so a brief double-disconnect during
// reconnection does not get mistaken for an abandoned room. `0` restores the
// pre-slice-2.1 immediate-sweep behavior (operational revert).
const ROOM_GRACE_MS =
  process.env.ROOM_GRACE_MS !== undefined
    ? Number(process.env.ROOM_GRACE_MS)
    : 30 * 60 * 1000;

// Design 069: once a public room's game is set up, a dropped seat is held this long for a
// reconnect; before set-up it is freed at once.
const DEFAULT_PUBLIC_SEAT_RELEASE_MS = 3 * 60 * 1000;
const PUBLIC_SEAT_RELEASE_MS = Number.isFinite(Number(process.env.PUBLIC_SEAT_RELEASE_MS ?? NaN))
  ? Number(process.env.PUBLIC_SEAT_RELEASE_MS)
  : DEFAULT_PUBLIC_SEAT_RELEASE_MS;
const PUBLIC_SEAT_SWEEP_MS = 15 * 1000;
// Sockets watching the Multiplayer tab's room list. A socket in a game room is never in it:
// several handlers take "the socket's first non-own room" as its game room.
const LOBBY_WATCHERS = 'lobby:watchers';

// Handle __dirname in ES modules and adjust for client folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.join(__dirname, '../client');
const sharedDir = path.join(__dirname, '../shared');

const envFilePath = path.join(__dirname, 'socket-admin-password.env');
dotenv.config({ path: envFilePath });

function generateRandomKey(length = 8) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

async function main() {
  const app = express();
  // HTTP Server Setup
  const server = http.createServer(app);

  // Socket.IO Server Setup
  const io = new Server(server, {
    connectionStateRecovery: {},
    cors: {
      origin: true, // demo tunnel: reflect request origin
      credentials: true,
    },
  });
  // Create a new SQLite database
  const dbDir = path.join(__dirname, 'database');
  const dbFilePath = path.join(dbDir, 'db.sqlite');
  const maxSizeGB = 15;

  // ensure the database directory exists BEFORE opening the DB
  // (ephemeral hosts like Render wipe this on every deploy/restart)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbFilePath);
  let isDatabaseCapacityReached = false;

  // Check database size (async to avoid blocking the event loop)
  const checkDatabaseSizeGB = async () => {
    try {
      const stats = await fs.promises.stat(dbFilePath);
      const fileSizeInBytes = stats.size;
      return fileSizeInBytes / (1024 * 1024 * 1024); // Convert bytes to gigabytes
    } catch {
      return 0; // File may not exist yet
    }
  };

  // Perform size check periodically
  setInterval(
    async () => {
      const currentSize = await checkDatabaseSizeGB();
      if (currentSize > maxSizeGB) {
        isDatabaseCapacityReached = true;
      }
    },
    1000 * 60 * 60
  );

  // Create a table to store key-value pairs (with TTL support)
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS KeyValuePairs (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT (datetime('now')))"
    );
  });

  // Evict saved game states older than 30 days (runs once per day)
  const EVICTION_DAYS = 30;
  setInterval(
    () => {
      db.run(
        `DELETE FROM KeyValuePairs WHERE created_at < datetime('now', '-${EVICTION_DAYS} days')`,
        (err) => {
          if (!err) {
            isDatabaseCapacityReached = false; // Re-enable saves after cleanup
          }
        }
      );
    },
    1000 * 60 * 60 * 24
  );

  // Bcrypt Configuration
  const saltRounds = 10;
  const plainPassword = process.env.ADMIN_PASSWORD || 'defaultPassword';
  const hashedPassword = bcrypt.hashSync(plainPassword, saltRounds);

  // Socket.IO Admin Instrumentation
  instrument(io, {
    auth: {
      type: 'basic',
      username: 'admin',
      password: hashedPassword,
    },
    mode: 'development',
  });

  app.set('view engine', 'ejs');
  app.set('views', clientDir);
  app.use(cors());
  // demo: never cache static assets so tunnel visitors always get fresh builds
  // (except content-hashed sampled SFX, design 064)
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', cacheControlFor(req.path));
    next();
  });

  const MAT_IMAGE_REMOTE_HOSTS = new Set(['cdn.artofpkm.com']);

  // Proxy playmat CDN art so browsers never hit cdn.artofpkm.com directly.
  // That CDN 302s to a watermark when a Referer is present.
  app.get('/api/mat-image', async (req, res) => {
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') {
      res.status(400).send('missing url');
      return;
    }
    let target;
    try {
      target = new URL(raw);
    } catch {
      res.status(400).send('invalid url');
      return;
    }
    if (!MAT_IMAGE_REMOTE_HOSTS.has(target.hostname)) {
      res.status(403).send('host not allowed');
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const upstream = await fetch(target.href, {
        headers: { 'User-Agent': 'PTCG-sim/1.0' },
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // If the CDN redirects, validate the redirect target stays in allowed hosts
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get('location');
        if (location) {
          try {
            const redirectUrl = new URL(location, target.href);
            if (!MAT_IMAGE_REMOTE_HOSTS.has(redirectUrl.hostname)) {
              res.status(403).send('redirect host not allowed');
              return;
            }
          } catch {
            // fall through
          }
        }
        res.status(403).send('redirect not allowed');
        return;
      }
      if (!upstream.ok) {
        res.status(upstream.status).send('upstream error');
        return;
      }
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      if (err.name === 'AbortError') {
        res.status(504).send('upstream timeout');
      } else {
        res.status(502).send('fetch failed');
      }
    }
  });

  // Card data goes through the server: browsers calling TCGdex directly got
  // Cloudflare-blocked (CORS errors), leaving every card without stage/attacks.
  app.get('/api/tcgdex/*', tcgdexProxyHandler(createTcgdexProxy()));
  // Card art the tabletop opening draws in WebGL (design 073): TCGdex's image CDN sends a
  // doubled CORS header that browsers refuse, so those faces come through here.
  app.get('/api/card-art', cardArtProxyHandler(createCardArtProxy()));

  // Design 069: where the client fetches TCG Live foil textures (object storage, or a local import).
  const foilTextures = resolveFoilTextureBase({
    envUrl: process.env.FOIL_TEXTURE_URL,
    localTexturesPresent: fs.existsSync(path.join(clientDir, 'src', 'assets', 'tcgl-foil', 'tex')),
  });
  if (foilTextures.error) console.error(foilTextures.error);
  app.get('/api/tcgl-foil/config', (_, res) => {
    res.json({ textureBase: foilTextures.textureBase });
  });

  app.use('/shared', express.static(sharedDir));
  app.use(express.static(clientDir));
  app.get('/', (_, res) => {
    res.render('index', { importDataJSON: null, e2eAllowed: E2E_ENABLED });
  });
  // The deck builder's own tab (design 050): the same page in builder mode.
  // The page's asset URLs are relative, so a trailing slash would break them.
  app.get('/deck-builder', (req, res) => {
    if (req.path.endsWith('/')) return res.redirect(301, '/deck-builder');
    res.render('index', { importDataJSON: null, e2eAllowed: E2E_ENABLED, builderWindow: true });
  });
  // Build & Battle (designs 051, 071): the builder tab in Build & Battle mode. The client picks the
  // flow from the path (builder-window.mjs resolveBuildBattleFlow); `-legacy` is the one-shot box
  // flow of designs 051-055, and `/build-and-battle/legacy` forwards to it.
  const renderBuildBattle = (canonicalPath) => (req, res) => {
    if (req.path.endsWith('/')) return res.redirect(301, canonicalPath);
    res.render('index', {
      importDataJSON: null,
      e2eAllowed: E2E_ENABLED,
      builderWindow: true,
      builderMode: 'build-battle',
    });
  };
  app.get('/build-and-battle', renderBuildBattle('/build-and-battle'));
  app.get('/build-and-battle-legacy', renderBuildBattle('/build-and-battle-legacy'));
  app.get('/build-and-battle/legacy', (req, res) => {
    const at = req.originalUrl.indexOf('?');
    res.redirect(302, `/build-and-battle-legacy${at === -1 ? '' : req.originalUrl.slice(at)}`);
  });
  // Design 073: the standalone unboxing test bench, one static page (its asset URLs are relative,
  // so a trailing slash would break them, as on /deck-builder).
  app.get('/unboxing', (req, res) => {
    if (req.path.endsWith('/')) {
      const at = req.originalUrl.indexOf('?');
      return res.redirect(301, `/unboxing${at === -1 ? '' : req.originalUrl.slice(at)}`);
    }
    res.sendFile(path.join(clientDir, 'unboxing.html'));
  });
  app.get('/import', (req, res) => {
    const key = req.query.key;
    if (!key) {
      return res.status(400).json({ error: 'Key parameter is missing' });
    }

    db.get(
      'SELECT value FROM KeyValuePairs WHERE key = ?',
      [key],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Internal server error' });
        }
        if (row) {
          res.render('index', { importDataJSON: row.value, e2eAllowed: E2E_ENABLED });
        } else {
          res.status(404).json({ error: 'Key not found' });
        }
      }
    );
  });

  const roomInfo = new Map();
  const gameRooms = new Map();

  // Function to periodically clean up empty rooms
  const cleanUpEmptyRooms = () => {
    roomInfo.forEach((room, roomId) => {
      if (room.players.size === 0 && room.spectators.size === 0) {
        roomInfo.delete(roomId);
      }
    });
    if (SERVER_AUTHORITATIVE) {
      // Players who drop without Leave keep their roomInfo seat, so an abandoned private
      // room's roomInfo goes with its GameRoom, but only past the grace (Finding 5).
      const due = planRoomSweep({
        gameRooms,
        now: Date.now(),
        graceMs: ROOM_GRACE_MS,
        socketCount: (roomId) => io.sockets.adapter.rooms.get(roomId)?.size ?? 0,
      });
      for (const { roomId, forgetRoomInfo } of due) {
        gameRooms.get(roomId).clearTurnOrderCall();
        clearTurnOrderTimer(roomId);
        gameRooms.delete(roomId);
        if (forgetRoomInfo) roomInfo.delete(roomId);
      }
    }
  };
  // Set up a timer to clean up empty rooms every 5 minutes (adjust as needed)
  setInterval(cleanUpEmptyRooms, 5 * 60 * 1000);

  // An explicit Leave Room by a seated player ends that game. Without this the
  // GameRoom outlived the leave whenever the opponent stayed seated, and
  // rejoining the same room re-sent the old game as a server view: old hand,
  // prizes and turn, with no Set Up pressed. Players who stay keep their seat
  // and deck; a disconnect (not a Leave) still resumes the game on reconnect.
  const resetGameAfterPlayerLeft = (roomId, leaverUsername) => {
    const gameRoom = gameRooms.get(roomId);
    if (!gameRoom) return;
    const leaverPlayerId = gameRoom.getPlayerIdByUsername(leaverUsername);
    if (!leaverPlayerId) return;
    // resetGame drops any open coin call; its answer timeout lives here.
    clearTurnOrderTimer(roomId);
    const remaining = gameRoom.resetGame({ removePlayerId: leaverPlayerId });
    broadcastFreshGame(gameRoom, roomId, remaining);
  };

  // A player's Reset button (legacy 'reset' pushAction with clean === false) ends
  // the game for both seats: the server owns turn/phase, so a one-sided reset can't
  // be represented. Deck-load resets send clean === true and must not land here.
  const isPlayerRequestedReset = (data) =>
    data.action === 'reset' &&
    Array.isArray(data.parameters) &&
    data.parameters[0] === false;

  const resetGameOnPlayerRequest = (gameRoom, roomId) => {
    clearTurnOrderTimer(roomId);
    const players = gameRoom.resetGame();
    for (const { socketId } of players) {
      if (socketId) io.to(socketId).emit('gameReset', { roomId });
    }
    broadcastFreshGame(gameRoom, roomId, players);
    broadcastRoomFormat(roomId);
  };

  const emitFreshView = (gameRoom, roomId, socketId, playerId) => {
    const view = gameRoom.getView(playerId);
    io.to(socketId).emit('view', {
      gameId: roomId,
      stateVersion: gameRoom.state.stateVersion,
      view,
      events: [],
      pendingChoice: view?.pendingChoice || null,
      lastClientSeq: 0,
    });
  };

  const broadcastFreshGame = (gameRoom, roomId, players) => {
    for (const { playerId, socketId } of players) {
      if (!socketId) continue;
      io.to(socketId).emit('instanceMap', {
        roomId,
        map: gameRoom.getInstanceMap(playerId),
      });
      emitFreshView(gameRoom, roomId, socketId, playerId);
    }
    // Design 069: spectators watch the restarted game too.
    for (const socketId of gameRoom.spectatorSockets) {
      io.to(socketId).emit('gameReset', { roomId });
      emitFreshView(gameRoom, roomId, socketId, null);
    }
  };
  // Design 013: the opening deal no longer happens the moment both seats are ready.
  // It waits behind the turn-order coin call; the coin's winner chooses first or
  // second (design 072) and that choice becomes `setup`'s firstPlayerId — so the
  // players decide the first turn instead of setupGame's own RNG (the I27
  // "cosmetic flip" this replaces).
  //
  // Design 002 slice 3.5 finding: nothing else calls the 'setup' command, so without
  // this the server never deals hands/prizes. setupGame() deals every registered
  // player at once, so this runs once, when GameRoom.isReadyToDeal() says both seats
  // have a deck and pressed Set Up — never on deck load alone, which auto-started
  // the game the moment both players joined.
  // Returns true once the hands are dealt; false (no seated socket, refused setup)
  // leaves the coin's result standing so the turn-order transport can retry.
  const dealOpeningHands = (gameRoom, roomId, starterPlayerId) => {
    // Any seated socket identifies the room to handleCommand; `setup` is a
    // server_lifecycle command, so it is not attributed to the sender.
    const actingSocketId =
      gameRoom.playerToSocket.get(starterPlayerId) ||
      [...gameRoom.playerToSocket.values()][0];
    if (!actingSocketId) return false;

    const setupResult = gameRoom.handleCommand(actingSocketId, {
      type: 'setup',
      payload: { firstPlayerId: starterPlayerId },
    });
    if (!setupResult.success) return false;
    // Design 053: the format is fixed from here; the panels drop their Switch button.
    broadcastRoomFormat(roomId);

    // Broadcast the post-setup view so the authoritative renderer draws the
    // dealt prizes and hands (prizes DOM is suppressed on the legacy path in
    // server-authoritative mode — without this view, prize zones stay empty).
    for (const broadcast of setupResult.broadcasts || []) {
      io.to(broadcast.socketId).emit('view', {
        gameId: roomId,
        stateVersion: setupResult.stateVersion,
        view: broadcast.view,
        events: setupResult.events || [],
        pendingChoice: broadcast.view?.pendingChoice || null,
        lastClientSeq: broadcast.lastClientSeq,
      });
    }

    // Design 002 I17: the server never trusts a client-supplied shuffle (D10), so
    // hand each player their own syncInstance deal order — [prizes(6), hand(7),
    // rest(deck)], matching the client's rules-mode setupPrizes()-then-
    // drawOpeningHand() split. Design 002 I27: `starter` rides along relative to
    // each recipient; under design 072 it is the seat the coin's winner chose, so
    // it agrees with the turnOrderResult the players just saw.
    const starterId = gameRoom.state.turn?.player ?? null;
    for (const pid of Object.keys(gameRoom.state.players)) {
      const p = gameRoom.state.players[pid];
      const order = [...p.zones.prizes, ...p.zones.hand, ...p.zones.deck].map(
        (card) => card.syncInstance
      );
      const starter =
        starterId == null ? null : starterId === pid ? 'self' : 'opp';
      const pSocketId = gameRoom.playerToSocket.get(pid);
      if (pSocketId) {
        io.to(pSocketId).emit('dealOrder', { roomId, order, starter });
      }
    }
    return true;
  };

  // Designs 013/072: the opening coin's messages and answer timeouts. The deal
  // waits until the coin's winner has chosen first or second.
  const turnOrderTransport = createTurnOrderTransport({
    emitTo: (socketId, event, payload) => io.to(socketId).emit(event, payload),
    deal: dealOpeningHands,
    onCallOpened: (roomId) => broadcastRoomFormat(roomId),
  });

  const clearTurnOrderTimer = (roomId) => turnOrderTransport.clearTimer(roomId);

  const replayTurnOrderToSeat = (roomId, socketId) => {
    if (!SERVER_AUTHORITATIVE) return;
    const gameRoom = gameRooms.get(roomId);
    const playerId = gameRoom?.socketToPlayer.get(socketId);
    if (playerId) turnOrderTransport.replayTo(gameRoom, roomId, playerId);
  };

  /**
   * Opens the turn-order coin call once both seats are ready. Idempotent: a
   * second trigger while a call is open or already resolved does nothing, so a
   * late deck load or a duplicate readyUp cannot re-roll the caller or re-deal.
   */
  const dealOpeningHandsIfReady = (gameRoom, roomId) => {
    // Design 051 / I202: formats are checked at the deal, not at deck load. Both Set Ups are
    // cleared; each client prints the mismatch line from its own ready check (ready.js).
    if (gameRoom.refuseDealOnFormatMismatch()) return;
    turnOrderTransport.open(gameRoom, roomId);
  };

  // Design 053: the format both seated players agreed on lives on roomInfo (both server modes)
  // and is mirrored onto the GameRoom, whose deal check reads it.
  const roomFormatPayload = (roomId, room) => {
    const { format, proposal } = room.format || emptyRoomFormat();
    return { roomId, format, proposal, seated: [...room.players], dealt: roomHasDealt(roomId) };
  };
  const broadcastRoomFormat = (roomId) => {
    // Every seat, format and deal change passes through here.
    notifyLobby(roomId);
    const room = roomInfo.get(roomId);
    if (room) io.to(roomId).emit('roomFormat', roomFormatPayload(roomId, room));
  };
  const setRoomFormat = (roomId, room, next) => {
    room.format = next;
    if (SERVER_AUTHORITATIVE) {
      const gameRoom = gameRooms.get(roomId);
      if (gameRoom) gameRoom.roomFormat = next.format;
    }
  };
  const roomHasDealt = (roomId) => SERVER_AUTHORITATIVE && roomFormatLocked(gameRooms.get(roomId));

  // Design 069: the Multiplayer tab's list of public rooms.
  const lobbySnapshot = () => buildLobbySnapshot({ roomInfo, isInGame: roomHasDealt });
  const emitLobbySnapshot = createDebouncer(250, () =>
    io.to(LOBBY_WATCHERS).emit('lobbyRooms', lobbySnapshot())
  );
  const notifyLobby = (roomId) => {
    if (isPublicRoomId(roomId)) emitLobbySnapshot();
  };
  // Without server authority the server cannot see set-up, so a dropped seat always gets the grace.
  const publicSeatHeld = (roomId) => !SERVER_AUTHORITATIVE || roomHasDealt(roomId);

  const deleteRoomIfEmpty = (roomId, room) => {
    if (room.players.size > 0 || room.spectators.size > 0) return false;
    roomInfo.delete(roomId);
    if (SERVER_AUTHORITATIVE) {
      gameRooms.get(roomId)?.clearTurnOrderCall();
      clearTurnOrderTimer(roomId);
      gameRooms.delete(roomId);
    }
    return true;
  };

  // A seated player is gone for good: an explicit Leave Room, or a released public seat.
  // `socketId` is the seat's last socket, whose cached deck exchange must not reach a new joiner.
  const releasePlayerSeat = (roomId, room, username, socketId) => {
    room.players.delete(username);
    room.setupActionCache?.delete(socketId);
    forgetSeat(room, username);
    setRoomFormat(roomId, room, clearRoomFormatProposal(room.format));
    if (deleteRoomIfEmpty(roomId, room)) return;
    if (SERVER_AUTHORITATIVE) resetGameAfterPlayerLeft(roomId, username);
    broadcastRoomFormat(roomId);
  };

  // The remaining player sees the same "left the room" as after a manual Leave Room.
  const releaseDroppedSeat = (roomId, room, username) => {
    const lastSocketId = room.presence?.get(username)?.socketId ?? null;
    io.to(roomId).emit('leaveRoom', { roomId, username, isSpectator: false });
    releasePlayerSeat(roomId, room, username, lastSocketId);
    notifyLobby(roomId);
  };

  // A seat back on a new socket: the old socket's cached deck exchange must not outlive it.
  const seatPublicSocket = (room, username, socketId) => {
    const previousSocketId = room.presence?.get(username)?.socketId;
    if (previousSocketId && previousSocketId !== socketId) {
      room.setupActionCache?.delete(previousSocketId);
    }
    markSeatConnected(room, username, socketId);
  };

  const sweepPublicSeats = () => {
    const due = planSweep({
      roomInfo,
      now: Date.now(),
      releaseMs: PUBLIC_SEAT_RELEASE_MS,
      isSetUp: publicSeatHeld,
    });
    for (const { roomId, username } of due) {
      const room = roomInfo.get(roomId);
      if (room?.players.has(username)) releaseDroppedSeat(roomId, room, username);
    }
  };
  setInterval(sweepPublicSeats, PUBLIC_SEAT_SWEEP_MS);

  //Socket.IO Connection Handling
  io.on('connection', async (socket) => {
    // Function to handle disconnections (unintended)
    const disconnectHandler = (roomId, username, asSpectator = false) => {
      if (!socket.data.leaveRoom) {
        socket.to(roomId).emit('userDisconnected', username);
      }
      if (SERVER_AUTHORITATIVE && gameRooms.has(roomId)) {
        const gameRoom = gameRooms.get(roomId);
        // Designs 013/072: a seat the opening coin is waiting on (to call, or to
        // choose first or second) is answered for, so the other seat never waits
        // on a player who is not coming back.
        // An explicit Leave is not answered for: it resets (or deletes) the game
        // below, and answering first would deal a game that is about to end. The
        // reset finds the seat by username; if it cannot, answer as for a drop.
        const resetFollows =
          socket.data.leaveRoom && Boolean(gameRoom.getPlayerIdByUsername(username));
        const lostPlayerId = gameRoom.socketToPlayer.get(socket.id);
        gameRoom.removeSocket(socket.id);
        if (!resetFollows) {
          turnOrderTransport.handleSeatLost(gameRoom, roomId, lostPlayerId);
        }
      }
      // Remove the disconnected user from the roomInfo map
      if (roomInfo.has(roomId)) {
        const room = roomInfo.get(roomId);

        if (asSpectator) {
          // A spectator may share a seated player's name: never touch the seats here.
          room.spectators.delete(username);
          if (socket.data.leaveRoom) deleteRoomIfEmpty(roomId, room);
        } else if (socket.data.leaveRoom) {
          if (room.players.has(username)) {
            // Delete, never null: the admin UI's socket.data proxy throws on a null value.
            delete socket.data.seat;
            releasePlayerSeat(roomId, room, username, socket.id);
          } else {
            deleteRoomIfEmpty(roomId, room);
          }
        } else {
          // Unintended disconnections retain seated players so temporary drops do not allow
          // seat hijacking or premature room deletion (Finding 7).
          // Design 069: a public seat is held only once the game is set up.
          if (
            isPublicRoomId(roomId) &&
            markSeatDisconnected(room, username, socket.id, Date.now()) &&
            !publicSeatHeld(roomId)
          ) {
            releaseDroppedSeat(roomId, room, username);
          }
        }
      }
      notifyLobby(roomId);
    };
    // One disconnect listener per socket, for the room it last joined. Spectators get one too
    // (design 069): without it a closed spectator tab stayed in the room's count forever.
    const watchDisconnect = (roomId, username, asSpectator) => {
      if (socket.data.disconnectListener) {
        socket.removeListener('disconnect', socket.data.disconnectListener);
      }
      socket.data.disconnectListener = () => disconnectHandler(roomId, username, asSpectator);
      socket.on('disconnect', socket.data.disconnectListener);
    };
    // Function to handle event emission
    // Design 069: the lobby channel is never a relay target, and a public room only takes relayed
    // events (and cached deck exchanges) from its own members: its id is listed for anyone to see.
    const mayRelayTo = (roomId) =>
      roomId !== LOBBY_WATCHERS && (!isPublicRoomId(roomId) || socket.rooms.has(roomId));
    const emitToRoom = (eventName, data) => {
      socket.broadcast.to(data.roomId).emit(eventName, data);
      if (eventName === 'leaveRoom') {
        socket.leave(data.roomId);
        // Design 069: a spectator that left must stop receiving the room's views.
        if (SERVER_AUTHORITATIVE) gameRooms.get(data.roomId)?.removeSpectator(socket.id);
        if (socket.data.disconnectListener) {
          socket.data.leaveRoom = true;
          socket.data.disconnectListener();
          socket.removeListener('disconnect', socket.data.disconnectListener);
          socket.data.leaveRoom = false;
        }
      }
    };
    // Design 069: a disconnected spectator socket is gone for good (a reconnect registers its
    // new socket), so it leaves the room's view broadcasts and stops keeping the room alive.
    const dropSpectatorOnDisconnect = (roomId) => {
      if (!SERVER_AUTHORITATIVE) return;
      socket.once('disconnect', () => gameRooms.get(roomId)?.removeSpectator(socket.id));
    };
    // rules-engine events: relay to the opponent in the same room
    socket.on('rulesEvent', (payload) => {
      const rooms = [...socket.rooms].filter((r) => r !== socket.id);
      for (const room of rooms) {
        socket.to(room).emit('rulesEvent', payload);
      }
    });

    socket.on('storeGameState', (exportData) => {
      if (isDatabaseCapacityReached) {
        socket.emit(
          'exportGameStateFailed',
          'No more storage for game states! You should probably tell Michael/Xiao Xiao.'
        );
      } else {
        // Attempt up to 5 times to find a unique key
        const tryInsert = (attemptsLeft) => {
          if (attemptsLeft <= 0) {
            socket.emit(
              'exportGameStateFailed',
              'Error exporting game! Please try again or save as a file.'
            );
            return;
          }
          const key = generateRandomKey();
          db.get(
            'SELECT key FROM KeyValuePairs WHERE key = ?',
            [key],
            (err, row) => {
              if (err) {
                socket.emit(
                  'exportGameStateFailed',
                  'Error exporting game! Please try again or save as a file.'
                );
                return;
              }
              if (row) {
                // Key collision — retry with a new key
                tryInsert(attemptsLeft - 1);
                return;
              }
              db.run(
                'INSERT INTO KeyValuePairs (key, value) VALUES (?, ?)',
                [key, exportData],
                (insertErr) => {
                  if (insertErr) {
                    socket.emit(
                      'exportGameStateFailed',
                      'Error exporting game! Please try again or save as a file.'
                    );
                  } else {
                    socket.emit('exportGameStateSuccessful', key);
                  }
                }
              );
            }
          );
        };
        tryInsert(5);
      }
    });
    socket.on('joinGame', (roomId, username, isSpectator, seatToken) => {
      if (typeof roomId === 'string') roomId = roomId.trim();
      if (typeof username === 'string') username = username.trim();
      if (!roomInfo.has(roomId)) {
        roomInfo.set(roomId, {
          players: new Set(),
          spectators: new Set(),
          // Caches the most recent exchangeData/loadDeckData pushAction from
          // each socket so a peer who joins the Socket.IO room *after* those
          // one-time setup broadcasts were sent still receives them (Finding:
          // socket.broadcast.to(roomId) only reaches sockets already joined
          // at emit time, so a late joiner otherwise misses them forever).
          setupActionCache: new Map(),
          format: emptyRoomFormat(),
        });
      }
      const room = roomInfo.get(roomId);

      const gameRoom = SERVER_AUTHORITATIVE ? gameRooms.get(roomId) : null;

      // Identity protection & seat management (Finding 7)
      let isExistingPlayer = false;
      let roomIsFull = false;

      if (gameRoom) {
        if (gameRoom.getPlayerIdByUsername(username)) {
          isExistingPlayer = true;
        } else if (!gameRoom.getNextAvailablePlayerId()) {
          roomIsFull = true;
        }
      } else {
        if (room.players.has(username)) {
          isExistingPlayer = true;
        } else if (room.players.size >= 2) {
          roomIsFull = true;
        }
      }

      // Design 069: the lobby lists seated names, so a public seat is reclaimed by token only.
      const publicRoom = isPublicRoomId(roomId);
      let issueToken = false;
      if (publicRoom) {
        const decision = decideJoin({
          room,
          username,
          token: seatToken,
          isSpectator: Boolean(isSpectator),
          seatsFull: roomIsFull,
        });
        if (decision.action === 'reject') {
          socket.emit('roomReject', { reason: decision.reason });
          return;
        }
        issueToken = decision.issueToken;
      }

      if (isSpectator || isExistingPlayer || !roomIsFull) {
        socket.leave(LOBBY_WATCHERS);
        socket.join(roomId);
        if (SERVER_AUTHORITATIVE) {
          let activeGameRoom = gameRoom;
          if (!activeGameRoom) {
            activeGameRoom = new GameRoom({ roomId });
            activeGameRoom.roomFormat = room.format?.format ?? null;
            gameRooms.set(roomId, activeGameRoom);
          }
          if (isSpectator) {
            activeGameRoom.addSpectator(socket.id);
          } else {
            const targetPid =
              activeGameRoom.getPlayerIdByUsername(username) ||
              activeGameRoom.getNextAvailablePlayerId() ||
              'p1';
            const added = activeGameRoom.addPlayer(
              socket.id,
              targetPid,
              username
            );
            if (!added) {
              socket.emit('roomReject', { reason: 'seat_failed' });
              return;
            }
          }
        }
        // Check if the user is a spectator or there are fewer than 2 players
        if (isSpectator) {
          room.spectators.add(username);
          watchDisconnect(roomId, username, true);
          // Design 069: an authoritative room's spectator renders server views, so it
          // needs the mode up front and never the players' legacy action replay.
          socket.emit('spectatorJoin', {
            serverAuthoritative: SERVER_AUTHORITATIVE,
            protocolVersion: PROTOCOL_VERSION,
          });
          if (!SERVER_AUTHORITATIVE) {
            socket.to(roomId).emit('requestSpectatorData', { roomId });
          }
          dropSpectatorOnDisconnect(roomId);
        } else {
          room.players.add(username);
          let issuedToken = null;
          if (publicRoom) {
            seatPublicSocket(room, username, socket.id);
            if (issueToken) issuedToken = issueSeatToken(room, username);
          }
          socket.emit('joinGame', {
            serverAuthoritative: SERVER_AUTHORITATIVE,
            protocolVersion: PROTOCOL_VERSION,
            // A seated player reloading into a running game: the client pulls
            // the current view once its room setup is done.
            rejoinedGame: Boolean(gameRoom) && isExistingPlayer,
            ...(issuedToken ? { seatToken: issuedToken } : {}),
          });
          // Replay any setup pushAction packets (exchangeData/loadDeckData)
          // that other sockets in this room already sent before this socket
          // joined. Without this, a player who connects late never receives
          // their opponent's one-time handshake/deck broadcasts, since
          // socket.broadcast.to(roomId) does not reach sockets that weren't
          // in the room yet at emit time.
          if (room.setupActionCache) {
            for (const [senderSocketId, cached] of room.setupActionCache) {
              if (senderSocketId === socket.id) continue;
              if (cached.exchangeData)
                socket.emit('pushAction', cached.exchangeData);
              if (cached.loadDeckData)
                socket.emit('pushAction', cached.loadDeckData);
            }
          }
          watchDisconnect(roomId, username, false);
          socket.data.seat = { roomId, username };
          // Designs 013/072: a seat that (re)joins mid-handshake gets its pending
          // prompt again, and a result whose deal found no socket is dealt now.
          replayTurnOrderToSeat(roomId, socket.id);
        }
        broadcastRoomFormat(roomId);
      } else {
        socket.emit('roomReject', { reason: 'full' });
      }
    });

    socket.on('lobbySubscribe', () => {
      const inGameRoom = [...socket.rooms].some(
        (r) => r !== socket.id && r !== LOBBY_WATCHERS
      );
      if (inGameRoom) return;
      socket.join(LOBBY_WATCHERS);
      socket.emit('lobbyRooms', lobbySnapshot());
    });
    socket.on('lobbyUnsubscribe', () => {
      socket.leave(LOBBY_WATCHERS);
    });

    socket.on('userReconnected', (data) => {
      // Design 069: checked before the restart branch, because under server authority a released
      // public seat whose room emptied looks the same as a server restart. Without authority a
      // missing room keeps the old path: the relay recreates it and play goes on.
      const publicRoom = isPublicRoomId(data?.roomId);
      const checkPublicSeat =
        publicRoom && data.notSpectator && (SERVER_AUTHORITATIVE || roomInfo.has(data.roomId));
      if (checkPublicSeat) {
        const decision = decideReconnect({
          room: roomInfo.get(data.roomId),
          username: data.username,
          token: data.seatToken,
        });
        if (decision.action === 'reject') {
          // A recovered connection (connectionStateRecovery) comes back still in the room.
          socket.leave(data.roomId);
          if (socket.data.disconnectListener) {
            socket.removeListener('disconnect', socket.data.disconnectListener);
            delete socket.data.disconnectListener;
          }
          delete socket.data.seat;
          socket.emit('roomReject', { reason: decision.reason });
          return;
        }
      }
      if (!roomInfo.has(data.roomId)) {
        if (SERVER_AUTHORITATIVE) {
          socket.emit('gameEnded', {
            winner: null,
            reason: 'server_restart',
            message: 'Game session terminated due to server restart.',
          });
          return;
        }
        roomInfo.set(data.roomId, {
          players: new Set(),
          spectators: new Set(),
          format: emptyRoomFormat(),
        });
      }
      const room = roomInfo.get(data.roomId);
      socket.leave(LOBBY_WATCHERS);
      socket.join(data.roomId);
      if (SERVER_AUTHORITATIVE) {
        let gameRoom = gameRooms.get(data.roomId);
        if (!gameRoom) {
          gameRoom = new GameRoom({ roomId: data.roomId });
          gameRoom.roomFormat = room.format?.format ?? null;
          gameRooms.set(data.roomId, gameRoom);
        }
        if (!data.notSpectator) {
          gameRoom.addSpectator(socket.id);
        } else {
          const existingPid =
            gameRoom.getPlayerIdByUsername(data.username) ||
            gameRoom.getNextAvailablePlayerId();
          if (!existingPid) {
            socket.emit('roomReject', { reason: 'full' });
            return;
          }
          const added = gameRoom.addPlayer(
            socket.id,
            existingPid,
            data.username
          );
          if (!added) {
            socket.emit('roomReject', { reason: 'seat_failed' });
            return;
          }
        }
      }
      if (!data.notSpectator) {
        room.spectators.add(data.username);
        watchDisconnect(data.roomId, data.username, true);
        if (!SERVER_AUTHORITATIVE) {
          socket
            .to(data.roomId)
            .emit('requestSpectatorData', { roomId: data.roomId });
        }
        dropSpectatorOnDisconnect(data.roomId);
      } else {
        room.players.add(data.username);
        if (publicRoom) seatPublicSocket(room, data.username, socket.id);
        watchDisconnect(data.roomId, data.username, false);
        socket.data.seat = { roomId: data.roomId, username: data.username };
        // Designs 013/072: a seat that (re)joins mid-handshake gets its pending
        // prompt again, and a result whose deal found no socket is dealt now.
        replayTurnOrderToSeat(data.roomId, socket.id);
        // Never relay the payload whole: it carries this player's seat token (design 069).
        io.to(data.roomId).emit('userReconnected', {
          roomId: data.roomId,
          username: data.username,
          notSpectator: data.notSpectator,
        });
      }
      broadcastRoomFormat(data.roomId);
    });

    // Design 053: propose / accept / withdraw the room's format. Only a seated player of this
    // socket's own room acts; a refusal goes back to the sender alone.
    socket.on('roomFormatAction', (data) => {
      const seat = socket.data.seat;
      const room = seat ? roomInfo.get(seat.roomId) : null;
      const refusal = roomFormatSeatRefusal({
        seat,
        requestRoomId: data?.roomId,
        room,
        gameRoom: SERVER_AUTHORITATIVE ? gameRooms.get(seat?.roomId) : null,
        socketId: socket.id,
      });
      if (refusal) {
        socket.emit('roomFormatRejected', { roomId: data?.roomId, reason: refusal });
        return;
      }
      const result = applyRoomFormatAction(room.format, {
        type: data.type,
        format: data.format,
        username: seat.username,
        seated: [...room.players],
        dealt: roomHasDealt(seat.roomId),
      });
      if (!result.ok) {
        socket.emit('roomFormatRejected', { roomId: seat.roomId, reason: result.reason });
        return;
      }
      setRoomFormat(seat.roomId, room, result.state);
      broadcastRoomFormat(seat.roomId);
    });

    // List of socket events
    const events = [
      'leaveRoom',
      'requestAction',
      'pushAction',
      'requestPeerLog',
      'peerLog',
      'requestSyncLogBundle',
      'syncLogBundle',
      'requestDecisionLogBundle',
      'decisionLogBundle',
      'appendMessage',
      'spectatorActionData',
      'requestSpectatorData',
      'initiateImport',
      'endImport',
      'lookAtCards',
      'stopLookingAtCards',
      'revealCards',
      'hideCards',
      'revealShortcut',
      'hideShortcut',
      'lookShortcut',
      'stopLookingShortcut',
      'resetCounter',
    ];

    // Register event listeners using the common function
    for (const event of events) {
      socket.on(event, (data) => {
        if (!mayRelayTo(data?.roomId)) return;
        if (event === 'requestPeerLog' && data?.roomId) {
          const roomSockets = io.sockets.adapter.rooms.get(data.roomId);
          const hasPeer = [...(roomSockets || [])].some((id) => id !== socket.id);
          if (!hasPeer) {
            socket.emit('peerLog', {
              roomId: data.roomId,
              toSocketId: data.requesterSocketId,
              actions: [],
              capped: false,
            });
            return;
          }
        }
        emitToRoom(event, data);

        if (
          event === 'pushAction' &&
          data &&
          (data.action === 'exchangeData' || data.action === 'loadDeckData')
        ) {
          const room = roomInfo.get(data.roomId);
          if (room && room.setupActionCache) {
            const existing = room.setupActionCache.get(socket.id) || {};
            existing[data.action] = data;
            room.setupActionCache.set(socket.id, existing);
          }
        }

        if (SERVER_AUTHORITATIVE && data) {
          const roomId =
            data.roomId || [...socket.rooms].find((r) => r !== socket.id);
          const gameRoom = gameRooms.get(roomId);
          if (gameRoom && event === 'pushAction') {
            gameRoom.touchActivity();
            const playerId = gameRoom.socketToPlayer.get(socket.id);
            if (playerId && data.action === 'readyUp') {
              gameRoom.markReady(playerId);
              dealOpeningHandsIfReady(gameRoom, roomId);
            }
            if (playerId && isPlayerRequestedReset(data)) {
              resetGameOnPlayerRequest(gameRoom, roomId);
            }
            if (
              playerId &&
              (data.action === 'exchangeData' || data.action === 'loadDeckData')
            ) {
              const deckData = extractDeckData(data.action, data.parameters);
              if (Array.isArray(deckData)) {
                // Routed through handleCommand (design 002 slice 3.4e / I16), not a direct
                // state mutation: this is the only way deck loading lands in commandLog, which
                // undo's replay depends on to reconstruct the pre-game state.
                const format = extractDeckFormat(data.action, data.parameters);
                const result = gameRoom.handleCommand(socket.id, {
                  type: 'loadDeck',
                  payload: { deckData, format },
                });

                if (result.success) {
                  // Server is the sole minter of instanceId (design 002 §3.1 / D10).
                  // Hand this player their own syncInstance -> instanceId lookup so the
                  // client can translate outgoing command hints; never broadcast this,
                  // it would leak the opponent's ids.
                  const map = gameRoom.getInstanceMap(playerId);
                  const targetSocketId = gameRoom.playerToSocket.get(playerId);
                  if (targetSocketId) {
                    io.to(targetSocketId).emit('instanceMap', { roomId, map });
                  }

                  // A deck can finish loading after both players pressed Set Up.
                  dealOpeningHandsIfReady(gameRoom, roomId);
                }
              }
            }
          }
        }
      });
    }

    if (SERVER_AUTHORITATIVE) {
      // Design 013: the designated caller's heads/tails pick. The client supplies
      // only the call — the coin itself is flipped by the room's seeded rng (D10).
      socket.on('turnOrderCall', (data) => {
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) return;
        gameRoom.touchActivity();
        turnOrderTransport.receiveCall(gameRoom, roomId, socket.id, data);
      });

      // Design 072: the coin winner's answer to "Do you want to go first?".
      socket.on('turnOrderChoice', (data) => {
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) return;
        gameRoom.touchActivity();
        turnOrderTransport.receiveChoice(gameRoom, roomId, socket.id, data);
      });
    }

    if (SERVER_AUTHORITATIVE) {
      const broadcastGameResult = (gameRoom, result) => {
        for (const broadcast of result.broadcasts || []) {
          io.to(broadcast.socketId).emit('view', {
            gameId: gameRoom.roomId,
            stateVersion: result.stateVersion,
            view: broadcast.view,
            events: result.events,
            pendingChoice: broadcast.view?.pendingChoice || null,
            lastClientSeq: broadcast.lastClientSeq,
          });
        }

        const gameEndedEvent =
          (result.events || []).find((e) => e.type === 'gameEnded') ||
          gameRoom.state.turn?.phase === 'ended';

        if (gameEndedEvent) {
          for (const broadcast of result.broadcasts || []) {
            const payload = gameRoom.getGameEndedPayload(broadcast.playerId);
            if (payload) {
              io.to(broadcast.socketId).emit('gameEnded', payload);
            }
          }
        }
      };

      socket.on('cmd', (cmd) => {
        const roomId =
          cmd?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) {
          socket.emit('cmdRejected', {
            clientSeq: cmd?.clientSeq,
            reason: 'room_not_found',
          });
          socket.emit('gameEnded', {
            winner: null,
            reason: 'server_restart',
            message: 'Game session terminated due to server restart.',
          });
          return;
        }

        if (cmd?.protocolVersion && cmd.protocolVersion !== PROTOCOL_VERSION) {
          socket.emit('cmdRejected', {
            clientSeq: cmd?.clientSeq,
            reason: 'version_mismatch',
            details: `Server protocol is ${PROTOCOL_VERSION}, client sent ${cmd.protocolVersion}`,
          });
          return;
        }

        const result = gameRoom.handleClientCommand(socket.id, cmd);
        if (!result.success) {
          socket.emit('cmdRejected', {
            clientSeq: cmd?.clientSeq,
            reason: result.error,
            details: result.reason,
          });
        } else if (result.dedupe) {
          socket.emit('view', {
            gameId: gameRoom.roomId,
            stateVersion: result.stateVersion,
            view: result.view,
            events: [],
            pendingChoice: result.view?.pendingChoice || null,
            lastClientSeq: result.lastClientSeq ?? result.clientSeq,
          });
          const gameEndedPayload = gameRoom.getGameEndedPayload(
            gameRoom.socketToPlayer.get(socket.id) || null
          );
          if (gameEndedPayload) {
            socket.emit('gameEnded', gameEndedPayload);
          }
        } else {
          broadcastGameResult(gameRoom, result);
        }
      });

      socket.on('resolveChoice', (data) => {
        const roomId =
          data?.roomId ||
          data?.gameId ||
          [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) {
          socket.emit('cmdRejected', {
            clientSeq: data?.clientSeq,
            reason: 'room_not_found',
          });
          socket.emit('gameEnded', {
            winner: null,
            reason: 'server_restart',
            message: 'Game session terminated due to server restart.',
          });
          return;
        }

        const result = gameRoom.handleClientCommand(socket.id, {
          type: 'resolveChoice',
          payload: data,
          clientSeq: data?.clientSeq,
        });
        if (!result.success) {
          socket.emit('cmdRejected', {
            clientSeq: data?.clientSeq,
            reason: result.error,
            details: result.reason,
          });
        } else if (result.dedupe) {
          socket.emit('view', {
            gameId: gameRoom.roomId,
            stateVersion: result.stateVersion,
            view: result.view,
            events: [],
            pendingChoice: result.view?.pendingChoice || null,
            lastClientSeq: result.lastClientSeq ?? result.clientSeq,
          });
          const gameEndedPayload = gameRoom.getGameEndedPayload(
            gameRoom.socketToPlayer.get(socket.id) || null
          );
          if (gameEndedPayload) {
            socket.emit('gameEnded', gameEndedPayload);
          }
        } else {
          broadcastGameResult(gameRoom, result);
        }
      });

      // Design 012: "look at the top/bottom N cards of a deck", answered to the asker only.
      socket.on('peekDeck', (data, ack) => {
        if (typeof ack !== 'function') return;
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) {
          ack({ ok: false, reason: 'room_not_found' });
          return;
        }
        ack(
          gameRoom.peekDeck(socket.id, {
            side: data?.side,
            count: data?.count,
            fromTop: data?.fromTop,
          })
        );
      });

      socket.on('requestView', (data) => {
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (gameRoom) {
          // Design 069: an unregistered socket would get the spectator view (both hands).
          if (!gameRoom.canView(socket.id)) return;
          const view = gameRoom.getViewForSocket(socket.id);
          const playerId = gameRoom.socketToPlayer.get(socket.id) || null;
          const lastClientSeq = playerId ? gameRoom.getClientSeq(playerId) : 0;
          socket.emit('view', {
            gameId: gameRoom.roomId,
            stateVersion: gameRoom.state.stateVersion,
            view,
            events: [],
            pendingChoice: view?.pendingChoice || null,
            lastClientSeq,
          });
          const gameEndedPayload = gameRoom.getGameEndedPayload(playerId);
          if (gameEndedPayload) {
            socket.emit('gameEnded', gameEndedPayload);
          }
        } else if (roomId) {
          socket.emit('gameEnded', {
            winner: null,
            reason: 'server_restart',
            message: 'Game session terminated due to server restart.',
          });
        }
      });

      // Design 002 slice 3.11: the client's periodic self-reported per-zone
      // board hashes. Compared against this room's own authoritative state;
      // the first zone that disagrees is named back so the client's existing
      // slice-1.1 peer-log catch-up has something concrete to recover.
      // Spectators have no personal authoritative state to compare against.
      socket.on('syncCheck', (data) => {
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) return;
        const playerId = gameRoom.socketToPlayer.get(socket.id);
        if (!playerId) return;
        gameRoom.touchActivity();
        // I42: a command applied between the client hashing its zones and
        // this handler running would make an up-to-date client look
        // divergent for a state it has since moved past. Skip the compare
        // this beat rather than report it — the next heartbeat re-checks
        // against whatever state has settled by then.
        if (
          typeof data?.stateVersion === 'number' &&
          data.stateVersion !== gameRoom.state.stateVersion
        ) {
          return;
        }
        // Compare against what this player's view shows, not raw state: the
        // client can only hash its own view, which redacts the deck (I24) and
        // unrevealed prizes. Raw-state hashing made prizes diverge every beat.
        const serverZones = hashOwnerViewZones(gameRoom.getView(playerId));
        const zoneId = findFirstDivergentZone(serverZones, data?.zones);
        if (zoneId) {
          socket.emit('desync', { roomId, zoneId });
        }
      });
    }
  });

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running at http://localhost:${port}`);
    // eslint-disable-next-line no-console
    console.log(
      `Netcode mode: ${SERVER_AUTHORITATIVE ? 'server-authoritative' : 'legacy'}` +
        ` | e2e bridge: ${E2E_ENABLED ? 'ARMED (?e2e=1 works)' : 'disabled'}`
    );
  });
}
main();
