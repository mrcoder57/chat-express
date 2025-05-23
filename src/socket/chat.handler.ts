import { Server, Socket } from 'socket.io';
import { Message } from '../models';
import { RedisUtils } from '../utils/redis.utils';

interface MessagePayload {
    chatId: string;
    content: string;
    contentType: string;
    mediaMetadata?: {
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        duration?: number;
        thumbnailUrl?: string;
    };
}

export class ChatHandler {
    private io: Server;
    private readonly TYPING_EXPIRY = 5; // seconds

    constructor(io: Server) {
        this.io = io;
    }

    handleConnection(socket: Socket) {
        const userId = socket.data.userId;
        console.log(`User connected: ${userId}`);

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Handle joining chat rooms
        socket.on('join:chat', (chatId: string) => this.handleJoinChat(socket, chatId));
        
        // Handle new messages
        socket.on('message:send', (payload: MessagePayload) => this.handleNewMessage(socket, payload));
        
        // Handle typing status
        socket.on('typing:start', (chatId: string) => this.handleTypingStart(socket, chatId));
        socket.on('typing:stop', (chatId: string) => this.handleTypingStop(socket, chatId));

        // Handle disconnection
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    private async handleJoinChat(socket: Socket, chatId: string) {
        const userId = socket.data.userId;
        
        // Join the chat room
        socket.join(`chat:${chatId}`);
        
        // Mark user as online in this chat
        await RedisUtils.set(`user:${userId}:chat:${chatId}:online`, true);
        
        // Notify others in the chat
        socket.to(`chat:${chatId}`).emit('user:joined', { userId, chatId });
    }

    private async handleNewMessage(socket: Socket, payload: MessagePayload) {
        const userId = socket.data.userId;
        
        try {
            // Create and save the message
            const message = await Message.create({
                chatId: payload.chatId,
                senderId: userId,
                content: payload.content,
                contentType: payload.contentType,
                mediaMetadata: payload.mediaMetadata,
                status: [{ userId, isSent: true }]
            });

            // Emit to all users in the chat
            this.io.to(`chat:${payload.chatId}`).emit('message:new', {
                message: {
                    ...message.toJSON(),
                    sender: userId
                }
            });

            // Store in Redis for recent messages
            await RedisUtils.addToSortedSet(
                `chat:${payload.chatId}:messages`,
                Date.now(),
                JSON.stringify(message)
            );
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('message:error', {
                error: 'Failed to send message'
            });
        }
    }

    private async handleTypingStart(socket: Socket, chatId: string) {
        const userId = socket.data.userId;
        
        // Set typing status in Redis with expiry
        await RedisUtils.set(
            `user:${userId}:chat:${chatId}:typing`,
            true,
            this.TYPING_EXPIRY
        );

        // Notify others in the chat
        socket.to(`chat:${chatId}`).emit('typing:update', {
            userId,
            chatId,
            isTyping: true
        });
    }

    private async handleTypingStop(socket: Socket, chatId: string) {
        const userId = socket.data.userId;
        
        // Remove typing status from Redis
        await RedisUtils.delete(`user:${userId}:chat:${chatId}:typing`);

        // Notify others in the chat
        socket.to(`chat:${chatId}`).emit('typing:update', {
            userId,
            chatId,
            isTyping: false
        });
    }

    private async handleDisconnect(socket: Socket) {
        const userId = socket.data.userId;
        console.log(`User disconnected: ${userId}`);

        // Clean up user's online status in all chats
        const userRooms = Array.from(socket.rooms)
            .filter(room => room.startsWith('chat:'))
            .map(room => room.split(':')[1]);

        for (const chatId of userRooms) {
            await RedisUtils.delete(`user:${userId}:chat:${chatId}:online`);
            socket.to(`chat:${chatId}`).emit('user:left', { userId, chatId });
        }
    }
} 