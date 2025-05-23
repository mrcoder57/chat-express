import express, { Express, Request, Response } from 'express';
import { config } from 'dotenv';
import { connectToMongoDB } from './config';
import redis from './config/redis';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { initializeSocket } from './config/socket';
import { ChatHandler } from './socket/chat.handler';

// Load environment variables
config();

const app: Express = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3000;

// Middleware for parsing JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const mongoStatus = mongoose.connection.readyState === 1;
  const redisStatus = redis.status === 'ready';
  
  res.json({
    status: 'ok',
    timestamp: new Date(),
    services: {
      mongodb: mongoStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected'
    }
  });
});

// Initialize the application
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Initialize Socket.IO with Redis adapter
    const io = initializeSocket(httpServer);
    
    // Initialize chat handler
    const chatHandler = new ChatHandler(io);
    
    // Handle socket connections
    io.on('connection', (socket) => {
      chatHandler.handleConnection(socket);
    });

    // Start HTTP server
    httpServer.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer(); 