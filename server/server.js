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

// Handle __dirname in ES modules and adjust for client folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.join(__dirname, '../client');

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
      'CREATE TABLE IF NOT EXISTS KeyValuePairs (key TEXT PRIMARY KEY, value TEXT, created_at TEXT DEFAULT (datetime(\'now\')))'
    );
  });

  // Evict saved game states older than 30 days (runs once per day)
  const EVICTION_DAYS = 30;
  setInterval(() => {
    db.run(
      `DELETE FROM KeyValuePairs WHERE created_at < datetime('now', '-${EVICTION_DAYS} days')`,
      (err) => {
        if (!err) {
          isDatabaseCapacityReached = false; // Re-enable saves after cleanup
        }
      }
    );
  }, 1000 * 60 * 60 * 24);

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
  // Function to periodically clean up empty rooms
  const cleanUpEmptyRooms = () => {
    roomInfo.forEach((room, roomId) => {
      if (room.players.size === 0 && room.spectators.size === 0) {
        roomInfo.delete(roomId);
      }
    });
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
      // Remove the disconnected user from the roomInfo map
      if (roomInfo.has(roomId)) {
        const room = roomInfo.get(roomId);

        if (room.players.has(username)) {
          room.players.delete(username);
        } else if (room.spectators.has(username)) {
          room.spectators.delete(username);
        }

        // If both players and spectators are empty, remove the roomInfo entry
        if (room.players.size === 0 && room.spectators.size === 0) {
          roomInfo.delete(roomId);
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
      if (!roomInfo.has(roomId)) {
        roomInfo.set(roomId, { players: new Set(), spectators: new Set() });
      }
      const room = roomInfo.get(roomId);

      if (room.players.size < 2 || isSpectator) {
        socket.join(roomId);
        // Check if the user is a spectator or there are fewer than 2 players
        if (isSpectator) {
          room.spectators.add(username);
          socket.emit('spectatorJoin');
          socket.to(roomId).emit('requestSpectatorData', { roomId });
        } else {
          room.players.add(username);
          socket.emit('joinGame');
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
        roomInfo.set(data.roomId, {
          players: new Set(),
          spectators: new Set(),
        });
      }
      const room = roomInfo.get(data.roomId);
      socket.join(data.roomId);
      if (!data.notSpectator) {
        room.spectators.add(data.username);
        socket.to(data.roomId).emit('requestSpectatorData', { roomId: data.roomId });
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
    ];

    // Register event listeners using the common function
    for (const event of events) {
      socket.on(event, (data) => {
        emitToRoom(event, data);
      });
    }
  });

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is running at http://localhost:${port}`);
  });
}
main();
