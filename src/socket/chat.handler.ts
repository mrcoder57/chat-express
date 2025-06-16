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
        
        // Handle message read status
        socket.on('message:read', (payload: { messageId: string; chatId: string }) => this.handleMessageRead(socket, payload));
        
        // Handle bulk message read (when user opens chat)
        socket.on('messages:read', (payload: { chatId: string; messageIds: string[] }) => this.handleBulkMessageRead(socket, payload));
        
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
        console.log(`User ${userId} joined chat room: ${chatId}`);
        
        // Mark user as online in this chat
        await RedisUtils.set(`user:${userId}:chat:${chatId}:online`, true);
        
        // Mark unread messages as delivered (user is now online to receive them)
        await Message.updateMany(
            { 
                chatId,
                'status.userId': { $ne: userId }, // Messages not from this user
                'status.isDelivered': false
            },
            { 
                $set: { 
                    'status.$.isDelivered': true,
                    'status.$.deliveredAt': new Date()
                }
            }
        );
        
        // Notify others in the chat
        socket.to(`chat:${chatId}`).emit('user:joined', { userId, chatId });
    }

    private async handleNewMessage(socket: Socket, payload: MessagePayload) {
        const userId = socket.data.userId;
        
        try {
            // Get chat participants to initialize message status
            const Chat = (await import('../models')).Chat;
            const chat = await Chat.findById(payload.chatId).select('participants');
            if (!chat) {
                socket.emit('message:error', { error: 'Chat not found' });
                return;
            }

            // Initialize status for all participants
            const messageStatus = chat.participants.map(participantId => ({
                userId: participantId,
                isSent: participantId.toString() === userId, // Only sender has isSent = true
                isDelivered: false,
                isRead: false
            }));

            // Create and save the message
            const message = await Message.create({
                chatId: payload.chatId,
                senderId: userId,
                content: payload.content,
                contentType: payload.contentType,
                mediaMetadata: payload.mediaMetadata,
                status: messageStatus
            });
            
            console.log(`Message sent: ${message._id} by user ${userId}`);
            
            // Update chat's lastMessage and updatedAt
            await Chat.findByIdAndUpdate(payload.chatId, {
                lastMessage: message._id,
                updatedAt: new Date()
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

    private async handleMessageRead(socket: Socket, payload: { messageId: string; chatId: string }) {
        const userId = socket.data.userId;
        
        try {
            // Find the message and check if user already marked it as read
            const message = await Message.findById(payload.messageId);
            if (!message) {
                socket.emit('message:error', { error: 'Message not found' });
                return;
            }

            // Check if user already marked this message as read
            const existingStatus = message.status.find(s => s.userId.toString() === userId);
            if (existingStatus && existingStatus.isRead) {
                return; // Already marked as read
            }

            // Mark the message as read
            await Message.findByIdAndUpdate(
                payload.messageId,
                { $push: { status: { userId, isRead: true, readAt: new Date() } } }
            );
            
            console.log(`Message read: ${payload.messageId} by user ${userId}`);
            
            // Emit read receipt to all users in the chat
            this.io.to(`chat:${payload.chatId}`).emit('message:read', {
                messageId: payload.messageId,
                chatId: payload.chatId,
                userId,
                readAt: new Date()
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
            socket.emit('message:error', {
                error: 'Failed to mark message as read'
            });
        }
    }

    private async handleBulkMessageRead(socket: Socket, payload: { chatId: string; messageIds: string[] }) {
        const userId = socket.data.userId;
        
        try {
            // Find the messages and check if user already marked them as read
            const messages = await Message.find({ _id: { $in: payload.messageIds } });
            if (messages.length !== payload.messageIds.length) {
                socket.emit('message:error', { error: 'Some messages not found' });
                return;
            }

            // Check if user already marked these messages as read
            const existingStatuses = messages.map(message => message.status.find(s => s.userId.toString() === userId));
            const markedAsRead = existingStatuses.every(status => status && status.isRead);
            if (markedAsRead) {
                return; // Already marked as read
            }

            // Mark the messages as read
            await Message.updateMany(
                { _id: { $in: payload.messageIds } },
                { $push: { status: { userId, isRead: true, readAt: new Date() } } }
            );
            
            console.log(`Messages read: ${payload.messageIds.join(', ')} by user ${userId}`);
            
            // Emit read receipts to all users in the chat
            this.io.to(`chat:${payload.chatId}`).emit('messages:read', {
                messageIds: payload.messageIds,
                chatId: payload.chatId,
                userId,
                readAt: new Date()
            });
        } catch (error) {
            console.error('Error marking messages as read:', error);
            socket.emit('message:error', {
                error: 'Failed to mark messages as read'
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