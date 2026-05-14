import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import User from '../features/users/User.model.js';
import { env } from './env.js';
import { allowedOrigins } from './cors.js';
import { createBullMQConnection, logRedisConnectionError } from './redis.js';
import logger from './logger.js';

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    // Keep sockets alive through DO firewalls and load balancers
    pingTimeout: 60_000,
    pingInterval: 25_000,
    // Prefer WebSocket; fall back to polling for restrictive proxies
    transports: ['websocket', 'polling'],
  });

  // Redis pub/sub adapter — required when PM2 runs multiple instances.
  // Without this, a notification emitted on Worker 2 never reaches a user
  // whose socket is connected to Worker 1.
  const pubClient = createBullMQConnection('Redis:socket-pub');
  // duplicate() copies options but NOT event listeners — attach handler explicitly
  const subClient = pubClient.duplicate();
  subClient.on('error', (err) => logRedisConnectionError('Redis:socket-sub', err));
  io.adapter(createAdapter(pubClient, subClient));

  // JWT auth via httpOnly cookie (same cookie the REST API uses)
  io.use(async (socket, next) => {
    try {
      const cookieStr = socket.handshake.headers.cookie ?? '';
      const match = cookieStr.match(/(?:^|;\s*)token=([^;]+)/);
      const raw = match?.[1];

      if (!raw) return next(new Error('Authentication required'));

      const decoded = jwt.verify(raw, env.JWT_SECRET);

      // JWT only carries { id } — fetch role+school from DB (one query per connection)
      const user = await User.findById(decoded.id).select('_id schoolId role').lean();
      if (!user) return next(new Error('User not found'));

      socket.userId   = String(user._id);
      socket.schoolId = user.schoolId ? String(user.schoolId) : null;
      socket.role     = user.role;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    if (socket.schoolId) socket.join(`school:${socket.schoolId}`);

    logger.info(`[Socket] Connected  user=${socket.userId} school=${socket.schoolId ?? 'none'}`);

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] Disconnect user=${socket.userId} reason=${reason}`);
    });
  });

  logger.info('[Socket] Socket.io initialized with Redis adapter');
  return io;
};

export const getIO = () => io;

// ── Emit helpers used by notification.service.js ──────────────────────────────

export const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
};

export const emitToSchool = (schoolId, event, payload) => {
  if (!io) return;
  io.to(`school:${schoolId}`).emit(event, payload);
};
