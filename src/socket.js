const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer) => {
  const allowedOrigins = (process.env.CLIENT_URL || '').split(',').filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    },
    transports: ['websocket']
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.user = decoded;
      socket.join(`user:${decoded.id}`);
      if (decoded.role) {
        socket.join(`role:${decoded.role}`);
      }
      return next();
    } catch (err) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', () => {});
  return io;
};

const getIO = () => io;

const emitToUser = (userId, event, payload = {}) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

const emitToRole = (role, event, payload = {}) => {
  if (!io || !role) return;
  io.to(`role:${role}`).emit(event, payload);
};

module.exports = { initSocket, getIO, emitToUser, emitToRole };
