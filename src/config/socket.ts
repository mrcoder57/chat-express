import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'http';
import { verifyAccessToken } from '../utils/jwt.utils';
import redis from './redis';

export const initializeSocket = (httpServer: Server) => {
    const io = new SocketServer(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST']
        },
        connectionStateRecovery: {
            // the backup duration of the sessions and the packets
            maxDisconnectionDuration: 2 * 60 * 1000,
            // whether to skip middlewares upon successful recovery
            skipMiddlewares: true,
        }
    });

    // Create Redis pub/sub clients
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();

    // Set up Redis adapter
    io.adapter(createAdapter(pubClient, subClient));

    // Middleware to authenticate socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return next(new Error('Authentication token is required'));
            }

            const decoded = await verifyAccessToken(token);
            socket.data.userId = decoded.userId;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    return io;
}; 