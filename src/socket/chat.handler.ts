import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
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

interface PubSubMessage {
    type: 'message' | 'typing' | 'status' | 'user_event';
    room: string;
    event: string;
    payload: any;
    serverId: string;
    timestamp: number;
}

export class ChatHandler {
    private io: Server;
    private redisPublisher: Redis;
    private redisSubscriber: Redis;
    private readonly TYPING_EXPIRY = 5; // seconds
    private readonly serverId: string;
    
    // Channels for different types of events
    private readonly CHANNELS = {
        MESSAGES: 'chat:messages',
        TYPING: 'chat:typing',
        STATUS: 'chat:status',
        USER_EVENTS: 'chat:user_events'
    };

    constructor(io: Server, redisConfig?: any) {
        this.io = io;
        this.serverId = process.env.SERVER_ID || `server-${Date.now()}-${Math.random()}`;
        
        // Create separate Redis connections for pub/sub
        this.redisPublisher = new Redis(redisConfig || {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        });
        
        this.redisSubscriber = new Redis(redisConfig || {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        });

        this.setupRedisSubscriptions();
        this.setupErrorHandling();
    }

    private setupRedisSubscriptions() {
        // Subscribe to all channels
        this.redisSubscriber.subscribe(
            this.CHANNELS.MESSAGES,
            this.CHANNELS.TYPING,
            this.CHANNELS.STATUS,
            this.CHANNELS.USER_EVENTS
        );

        // Handle incoming pub/sub messages
        this.redisSubscriber.on('message', (channel: string, message: string) => {
            try {
                const data: PubSubMessage = JSON.parse(message);
                
                // Don't process messages from our own server to avoid loops
                if (data.serverId === this.serverId) {
                    return;
                }

                console.log(`Received pub/sub message on ${channel}:`, data.event);
                
                // Emit to local Socket.io clients
                this.io.to(data.room).emit(data.event, data.payload);
                
            } catch (error) {
                console.error('Error processing pub/sub message:', error);
            }
        });
    }

    private setupErrorHandling() {
        this.redisPublisher.on('error', (err) => {
            console.error('Redis Publisher Error:', err);
        });

        this.redisSubscriber.on('error', (err) => {
            console.error('Redis Subscriber Error:', err);
        });

        this.redisSubscriber.on('connect', () => {
            console.log('Redis Subscriber Connected');
        });

        this.redisPublisher.on('connect', () => {
            console.log('Redis Publisher Connected');
        });
    }

    private async publishToCluster(channel: string, room: string, event: string, payload: any) {
        const message: PubSubMessage = {
            type: channel.split(':')[1] as any,
            room,
            event,
            payload,
            serverId: this.serverId,
            timestamp: Date.now()
        };

        try {
            await this.redisPublisher.publish(channel, JSON.stringify(message));
        } catch (error) {
            console.error('Error publishing to Redis:', error);
        }
    }

    handleConnection(socket: Socket) {
        const userId = socket.data.userId;
        console.log(`User connected: ${userId} on server: ${this.serverId}`);

        // Join user's personal room
        socket.join(`user:${userId}`);

        // Store user's server mapping in Redis for direct messaging
        RedisUtils.set(`user:${userId}:server`, this.serverId, 3600); // 1 hour TTL

        // Handle joining chat rooms
        socket.on('join:chat', (chatId: string) => this.handleJoinChat(socket, chatId));

        // Handle new messages
        socket.on('message:send', (payload: MessagePayload) => this.handleNewMessage(socket, payload));

        // Handle message read status
        socket.on('message:read', (payload: { messageId: string; chatId: string }) => this.handleMessageRead(socket, payload));

        // Handle bulk message read
        socket.on('messages:read', (payload: { chatId: string; messageIds: string[] }) => this.handleBulkMessageRead(socket, payload));

        // Handle typing status
        socket.on('typing:start', (chatId: string) => this.handleTypingStart(socket, chatId));
        socket.on('typing:stop', (chatId: string) => this.handleTypingStop(socket, chatId));

        // Handle disconnection
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    private async handleJoinChat(socket: Socket, chatId: string) {
        const userId = socket.data.userId;

        // Join the chat room locally
        socket.join(`chat:${chatId}`);
        console.log(`User ${userId} joined chat room: ${chatId} on server: ${this.serverId}`);

        // Mark user as online in this chat
        await RedisUtils.set(`user:${userId}:chat:${chatId}:online`, true);

        // Mark unread messages as delivered
        await Message.updateMany(
            { 
                chatId,
                'status.userId': { $ne: userId },
                'status.isDelivered': false
            },
            { 
                $set: { 
                    'status.$.isDelivered': true,
                    'status.$.deliveredAt': new Date()
                }
            }
        );

        // Emit locally first
        socket.to(`chat:${chatId}`).emit('user:joined', { userId, chatId });
        
        // Then broadcast to other servers
        await this.publishToCluster(
            this.CHANNELS.USER_EVENTS,
            `chat:${chatId}`,
            'user:joined',
            { userId, chatId }
        );
    }

    private async handleNewMessage(socket: Socket, payload: MessagePayload) {
        const userId = socket.data.userId;

        try {
            // Get chat participants
            const Chat = (await import('../models')).Chat;
            const chat = await Chat.findById(payload.chatId).select('participants');
            if (!chat) {
                socket.emit('message:error', { error: 'Chat not found' });
                return;
            }

            // Initialize status for all participants
            const messageStatus = chat.participants.map(participantId => ({
                userId: participantId,
                isSent: participantId.toString() === userId,
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

            console.log(`Message sent: ${message._id} by user ${userId} on server: ${this.serverId}`);

            // Update chat's lastMessage
            await Chat.findByIdAndUpdate(payload.chatId, {
                lastMessage: message._id,
                updatedAt: new Date()
            });

            const messageData = {
                message: {
                    ...message.toJSON(),
                    sender: userId
                }
            };

            // Emit to local clients first
            this.io.to(`chat:${payload.chatId}`).emit('message:new', messageData);

            // Then broadcast to other servers
            await this.publishToCluster(
                this.CHANNELS.MESSAGES,
                `chat:${payload.chatId}`,
                'message:new',
                messageData
            );

            // Store in Redis for recent messages cache
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
            const message = await Message.findById(payload.messageId);
            if (!message) {
                socket.emit('message:error', { error: 'Message not found' });
                return;
            }

            // Check if already marked as read
            const existingStatus = message.status.find(s => s.userId.toString() === userId);
            if (existingStatus && existingStatus.isRead) {
                return;
            }

            // Mark as read
            await Message.findOneAndUpdate(
                { _id: payload.messageId, 'status.userId': userId },
                { 
                    $set: { 
                        'status.$.isRead': true,
                        'status.$.readAt': new Date()
                    }
                }
            );

            const readData = {
                messageId: payload.messageId,
                chatId: payload.chatId,
                userId,
                readAt: new Date()
            };

            // Emit locally
            this.io.to(`chat:${payload.chatId}`).emit('message:read', readData);

            // Broadcast to other servers
            await this.publishToCluster(
                this.CHANNELS.STATUS,
                `chat:${payload.chatId}`,
                'message:read',
                readData
            );

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
            // Batch update messages as read
            await Message.updateMany(
                { 
                    _id: { $in: payload.messageIds },
                    'status.userId': userId,
                    'status.isRead': false
                },
                { 
                    $set: { 
                        'status.$.isRead': true,
                        'status.$.readAt': new Date()
                    }
                }
            );

            const readData = {
                messageIds: payload.messageIds,
                chatId: payload.chatId,
                userId,
                readAt: new Date()
            };

            // Emit locally
            this.io.to(`chat:${payload.chatId}`).emit('messages:read', readData);

            // Broadcast to other servers
            await this.publishToCluster(
                this.CHANNELS.STATUS,
                `chat:${payload.chatId}`,
                'messages:read',
                readData
            );

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

        const typingData = {
            userId,
            chatId,
            isTyping: true
        };

        // Emit locally
        socket.to(`chat:${chatId}`).emit('typing:update', typingData);

        // Broadcast to other servers
        await this.publishToCluster(
            this.CHANNELS.TYPING,
            `chat:${chatId}`,
            'typing:update',
            typingData
        );
    }

    private async handleTypingStop(socket: Socket, chatId: string) {
        const userId = socket.data.userId;

        // Remove typing status
        await RedisUtils.delete(`user:${userId}:chat:${chatId}:typing`);

        const typingData = {
            userId,
            chatId,
            isTyping: false
        };

        // Emit locally
        socket.to(`chat:${chatId}`).emit('typing:update', typingData);

        // Broadcast to other servers
        await this.publishToCluster(
            this.CHANNELS.TYPING,
            `chat:${chatId}`,
            'typing:update',
            typingData
        );
    }

    private async handleDisconnect(socket: Socket) {
        const userId = socket.data.userId;
        console.log(`User disconnected: ${userId} from server: ${this.serverId}`);

        // Clean up user's server mapping
        await RedisUtils.delete(`user:${userId}:server`);

        // Clean up online status in all chats
        const userRooms = Array.from(socket.rooms)
            .filter(room => room.startsWith('chat:'))
            .map(room => room.split(':')[1]);

        for (const chatId of userRooms) {
            await RedisUtils.delete(`user:${userId}:chat:${chatId}:online`);
            await RedisUtils.delete(`user:${userId}:chat:${chatId}:typing`);
            
            const leftData = { userId, chatId };
            
            // Emit locally
            socket.to(`chat:${chatId}`).emit('user:left', leftData);
            
            // Broadcast to other servers
            await this.publishToCluster(
                this.CHANNELS.USER_EVENTS,
                `chat:${chatId}`,
                'user:left',
                leftData
            );
        }
    }

    // Utility method to send direct message to a specific user (cross-server)
    async sendToUser(userId: string, event: string, payload: any) {
        // Check if user is on this server
        const localSocket = this.io.sockets.sockets.get(userId);
        if (localSocket) {
            localSocket.emit(event, payload);
            return true;
        }

        // If not local, broadcast to all servers
        await this.publishToCluster(
            this.CHANNELS.USER_EVENTS,
            `user:${userId}`,
            event,
            payload
        );
        return false;
    }

    // Cleanup method for graceful shutdown
    async cleanup() {
        console.log(`Cleaning up ChatHandler for server: ${this.serverId}`);
        
        await this.redisSubscriber.unsubscribe();
        await this.redisSubscriber.quit();
        await this.redisPublisher.quit();
    }
}