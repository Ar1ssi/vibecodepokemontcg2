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
import {
  ShadowSession,
  initializePlayerDeck,
  extractDeckData,
} from './game/shadow.mjs';
import { PROTOCOL_VERSION } from '../shared/engine/commands.mjs';

const SERVER_AUTHORITATIVE =
  process.env.SERVER_AUTHORITATIVE === '1' ||
  process.env.SERVER_AUTHORITATIVE === 'true';

const SHADOW_MODE =
  process.env.SHADOW_MODE?.trim() === '1' ||
  process.env.SHADOW_MODE?.trim() === 'true' ||
  SERVER_AUTHORITATIVE;

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
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
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

  app.use('/shared', express.static(sharedDir));
  app.use(express.static(clientDir));
  app.get('/', (_, res) => {
    res.render('index', { importDataJSON: null });
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
          res.render('index', { importDataJSON: row.value });
        } else {
          res.status(404).json({ error: 'Key not found' });
        }
      }
    );
  });

  const roomInfo = new Map();
  const gameRooms = new Map();
  const shadowSessions = new Map();
  const completedShadowReports = [];

  app.get('/debug/shadow-report', (req, res) => {
    const roomId = req.query.roomId;
    if (roomId) {
      if (shadowSessions.has(roomId)) {
        return res.json(shadowSessions.get(roomId).getReport());
      }
      const finished = completedShadowReports.find((r) => r.roomId === roomId);
      if (finished) return res.json(finished);
      return res.status(404).json({ error: 'Room not found' });
    }
    const allReports = [];
    for (const shadow of shadowSessions.values()) {
      allReports.push(shadow.getReport());
    }
    res.json({
      activeShadowSessions: shadowSessions.size,
      reports: [...allReports, ...completedShadowReports],
    });
  });

  // Function to periodically clean up empty rooms
  const cleanUpEmptyRooms = () => {
    roomInfo.forEach((room, roomId) => {
      if (room.players.size === 0 && room.spectators.size === 0) {
        roomInfo.delete(roomId);
      }
    });
    if (SERVER_AUTHORITATIVE) {
      gameRooms.forEach((room, roomId) => {
        if (
          room.playerToSocket.size === 0 &&
          room.spectatorSockets.size === 0
        ) {
          gameRooms.delete(roomId);
          roomInfo.delete(roomId);
        }
      });
    }
    if (SHADOW_MODE) {
      shadowSessions.forEach((shadow, roomId) => {
        if (
          shadow.gameRoom.playerToSocket.size === 0 &&
          shadow.gameRoom.spectatorSockets.size === 0
        ) {
          completedShadowReports.push(shadow.getReport());
          if (completedShadowReports.length > 50) {
            completedShadowReports.shift();
          }
          shadowSessions.delete(roomId);
          roomInfo.delete(roomId);
        }
      });
    }
  };
  // Set up a timer to clean up empty rooms every 5 minutes (adjust as needed)
  setInterval(cleanUpEmptyRooms, 5 * 60 * 1000);
  //Socket.IO Connection Handling
  io.on('connection', async (socket) => {
    // Function to handle disconnections (unintended)
    const disconnectHandler = (roomId, username) => {
      if (!socket.data.leaveRoom) {
        socket.to(roomId).emit('userDisconnected', username);
      }
      if (SERVER_AUTHORITATIVE && gameRooms.has(roomId)) {
        gameRooms.get(roomId).removeSocket(socket.id);
      }
      if (SHADOW_MODE && shadowSessions.has(roomId)) {
        shadowSessions.get(roomId).removeSocket(socket.id);
      }
      // Remove the disconnected user from the roomInfo map
      if (roomInfo.has(roomId)) {
        const room = roomInfo.get(roomId);

        if (socket.data.leaveRoom) {
          if (room.players.has(username)) {
            room.players.delete(username);
          } else if (room.spectators.has(username)) {
            room.spectators.delete(username);
          }

          // If both players and spectators are empty, remove the roomInfo entry
          if (room.players.size === 0 && room.spectators.size === 0) {
            roomInfo.delete(roomId);
            if (SERVER_AUTHORITATIVE) gameRooms.delete(roomId);
            if (SHADOW_MODE) shadowSessions.delete(roomId);
          }
        } else {
          // For unintended disconnections, remove from spectators, but retain seated players
          // so temporary drops do not allow seat hijacking or premature room deletion (Finding 7)
          if (room.spectators.has(username)) {
            room.spectators.delete(username);
          }
        }
      }
    };
    // Function to handle event emission
    const emitToRoom = (eventName, data) => {
      socket.broadcast.to(data.roomId).emit(eventName, data);
      if (eventName === 'leaveRoom') {
        socket.leave(data.roomId);
        if (socket.data.disconnectListener) {
          socket.data.leaveRoom = true;
          socket.data.disconnectListener();
          socket.removeListener('disconnect', socket.data.disconnectListener);
          socket.data.leaveRoom = false;
        }
      }
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
    socket.on('joinGame', (roomId, username, isSpectator) => {
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
        });
      }
      const room = roomInfo.get(roomId);

      const gameRoom = SERVER_AUTHORITATIVE ? gameRooms.get(roomId) : null;
      const shadow = SHADOW_MODE ? shadowSessions.get(roomId) : null;

      // Identity protection & seat management (Finding 7)
      let isExistingPlayer = false;
      let roomIsFull = false;

      if (gameRoom) {
        if (gameRoom.getPlayerIdByUsername(username)) {
          isExistingPlayer = true;
        } else if (!gameRoom.getNextAvailablePlayerId()) {
          roomIsFull = true;
        }
      } else if (shadow) {
        if (shadow.getPlayerIdByUsername(username)) {
          isExistingPlayer = true;
        } else if (!shadow.getNextAvailablePlayerId()) {
          roomIsFull = true;
        }
      } else {
        if (room.players.has(username)) {
          isExistingPlayer = true;
        } else if (room.players.size >= 2) {
          roomIsFull = true;
        }
      }

      if (isSpectator || isExistingPlayer || !roomIsFull) {
        socket.join(roomId);
        if (SERVER_AUTHORITATIVE) {
          let activeGameRoom = gameRoom;
          if (!activeGameRoom) {
            activeGameRoom = new GameRoom({ roomId });
            gameRooms.set(roomId, activeGameRoom);
          }
          if (isSpectator) {
            activeGameRoom.addSpectator(socket.id);
          } else {
            const targetPid =
              activeGameRoom.getPlayerIdByUsername(username) ||
              activeGameRoom.getNextAvailablePlayerId() ||
              'p1';
            const added = activeGameRoom.addPlayer(socket.id, targetPid, username);
            if (!added) {
              socket.emit('roomReject');
              return;
            }
          }
        }
        if (SHADOW_MODE) {
          let activeShadow = shadow;
          if (!activeShadow) {
            activeShadow = new ShadowSession({ roomId });
            shadowSessions.set(roomId, activeShadow);
          }
          if (isSpectator) {
            activeShadow.gameRoom.addSpectator(socket.id);
          } else {
            const targetPid =
              activeShadow.getPlayerIdByUsername(username) ||
              activeShadow.getNextAvailablePlayerId() ||
              'p1';
            activeShadow.addPlayer(socket.id, targetPid, username);
          }
        }
        // Check if the user is a spectator or there are fewer than 2 players
        if (isSpectator) {
          room.spectators.add(username);
          socket.emit('spectatorJoin');
          socket.to(roomId).emit('requestSpectatorData', { roomId });
        } else {
          room.players.add(username);
          socket.emit('joinGame', {
            serverAuthoritative: SERVER_AUTHORITATIVE,
            shadowMode: SHADOW_MODE,
            protocolVersion: PROTOCOL_VERSION,
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
              if (cached.exchangeData) socket.emit('pushAction', cached.exchangeData);
              if (cached.loadDeckData) socket.emit('pushAction', cached.loadDeckData);
            }
          }
          // Remove any existing disconnect listener to prevent leak on rejoin
          if (socket.data.disconnectListener) {
            socket.removeListener('disconnect', socket.data.disconnectListener);
          }
          socket.data.disconnectListener = () =>
            disconnectHandler(roomId, username);
          socket.on('disconnect', socket.data.disconnectListener);
        }
      } else {
        socket.emit('roomReject');
      }
    });

    socket.on('userReconnected', (data) => {
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
        });
      }
      const room = roomInfo.get(data.roomId);
      socket.join(data.roomId);
      if (SERVER_AUTHORITATIVE) {
        let gameRoom = gameRooms.get(data.roomId);
        if (!gameRoom) {
          gameRoom = new GameRoom({ roomId: data.roomId });
          gameRooms.set(data.roomId, gameRoom);
        }
        if (!data.notSpectator) {
          gameRoom.addSpectator(socket.id);
        } else {
          const existingPid =
            gameRoom.getPlayerIdByUsername(data.username) ||
            gameRoom.getNextAvailablePlayerId();
          if (!existingPid) {
            socket.emit('roomReject');
            return;
          }
          const added = gameRoom.addPlayer(socket.id, existingPid, data.username);
          if (!added) {
            socket.emit('roomReject');
            return;
          }
        }
      }
      if (SHADOW_MODE) {
        let shadow = shadowSessions.get(data.roomId);
        if (!shadow) {
          shadow = new ShadowSession({ roomId: data.roomId });
          shadowSessions.set(data.roomId, shadow);
        }
        if (!data.notSpectator) {
          shadow.gameRoom.addSpectator(socket.id);
        } else {
          const existingPid =
            shadow.getPlayerIdByUsername(data.username) ||
            shadow.getNextAvailablePlayerId();
          if (!existingPid) {
            socket.emit('roomReject');
            return;
          }
          shadow.addPlayer(socket.id, existingPid, data.username);
        }
      }
      if (!data.notSpectator) {
        room.spectators.add(data.username);
        socket
          .to(data.roomId)
          .emit('requestSpectatorData', { roomId: data.roomId });
      } else {
        room.players.add(data.username);
        // Remove any existing disconnect listener to prevent leak on reconnect
        if (socket.data.disconnectListener) {
          socket.removeListener('disconnect', socket.data.disconnectListener);
        }
        socket.data.disconnectListener = () =>
          disconnectHandler(data.roomId, data.username);
        socket.on('disconnect', socket.data.disconnectListener);
        io.to(data.roomId).emit('userReconnected', data);
      }
    });

    // List of socket events
    const events = [
      'leaveRoom',
      'requestAction',
      'pushAction',
      'resyncActions',
      'catchUpActions',
      'requestBoardSnapshot',
      'applyBoardSnapshot',
      'requestPeerLog',
      'peerLog',
      'syncCheck',
      'requestSyncLogBundle',
      'syncLogBundle',
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

        if (SHADOW_MODE && data) {
          const roomId =
            data.roomId || [...socket.rooms].find((r) => r !== socket.id);
          const shadow = shadowSessions.get(roomId);
          if (shadow) {
            if (event === 'pushAction') {
              shadow.ingestAction(socket.id, data);
            } else if (event === 'syncCheck') {
              shadow.checkSync(socket.id, data);
            }
          }
        }

        if (SERVER_AUTHORITATIVE && data) {
          const roomId =
            data.roomId || [...socket.rooms].find((r) => r !== socket.id);
          const gameRoom = gameRooms.get(roomId);
          if (gameRoom && event === 'pushAction') {
            const playerId = gameRoom.socketToPlayer.get(socket.id);
            if (
              playerId &&
              (data.action === 'exchangeData' || data.action === 'loadDeckData')
            ) {
              const deckData = extractDeckData(data.action, data.parameters);
              if (Array.isArray(deckData)) {
                initializePlayerDeck(gameRoom.state, playerId, deckData);
              }
            }
          }
        }
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

        const result = gameRoom.handleCommand(socket.id, cmd);
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

        const result = gameRoom.resolveChoice(socket.id, data, data?.clientSeq);
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

      socket.on('requestView', (data) => {
        const roomId =
          data?.roomId || [...socket.rooms].find((r) => r !== socket.id);
        const gameRoom = gameRooms.get(roomId);
        if (gameRoom) {
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
    }
  });

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running at http://localhost:${port}`);
    // eslint-disable-next-line no-console
    console.log(
      `Netcode mode: ${SERVER_AUTHORITATIVE ? 'server-authoritative' : 'legacy'}`
    );
  });
}
main();
