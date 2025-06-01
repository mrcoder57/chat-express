import { Request, Response } from 'express';
import { Chat, Message } from '../models';
import mongoose from 'mongoose';

export class ChatController {
    /**
     * Get all chats for a user
     * @route GET /api/chats
     * @access Private
     */
    static async getUserChats(req: any, res: Response) {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = req.userId;
            console.log("userid recived in chats",userId);

            // Find all chats where the user is a participant
            const chats = await Chat.find({ participants: userId })
                .populate([
                    {
                        path: 'participants',
                        select: 'firstName lastName userName email userImage userType', // Updated fields
                    },
                    {
                        path: 'lastMessage',
                        select: 'content contentType createdAt',
                    },
                    {
                        path: 'groupAdmins',
                        select: 'firstName lastName userName email userImage userType', // Updated fields
                    }
                ])
                .sort({ updatedAt: -1 }); // Most recent chats first

            // Format the response
            const formattedChats = chats.map(chat => ({
                _id: chat._id,
                name: chat.name,
                isGroupChat: chat.isGroupChat,
                participants: chat.participants,
                groupAdmins: chat.isGroupChat ? chat.groupAdmins : undefined,
                lastMessage: chat.lastMessage,
                groupIconUrl: chat.groupIconUrl,
                userSpecificSettings: chat.userSpecificSettings.find(
                    setting => setting.userId.toString() === userId.toString()
                ),
                unreadCount: chat.userSpecificSettings.find(
                    setting => setting.userId.toString() === userId.toString()
                )?.unreadCount || 0,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt
            }));

            res.json({
                success: true,
                data: formattedChats
            });
        } catch (error) {
            console.error('Error fetching user chats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch chats',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Create a new chat
     * @route POST /api/chats
     * @access Private
     */
    static async createChat(req: any, res: Response) {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const { participants, isGroupChat, name, groupIconUrl } = req.body;
            const userId = req.userId;

            // Validate participants
            if (!participants || !Array.isArray(participants)) {
                return res.status(400).json({
                    success: false,
                    message: 'Participants must be provided as an array'
                });
            }

            // Add the current user to participants if not included
            const allParticipants = [...new Set([...participants, userId.toString()])];

            // Validate group chat requirements
            if (isGroupChat) {
                if (!name) {
                    return res.status(400).json({
                        success: false,
                        message: 'Group chat name is required'
                    });
                }
                if (allParticipants.length < 3) {
                    return res.status(400).json({
                        success: false,
                        message: 'Group chat requires at least 3 participants'
                    });
                }
            } else {
                if (allParticipants.length !== 2) {
                    return res.status(400).json({
                        success: false,
                        message: 'One-on-one chat must have exactly 2 participants'
                    });
                }
            }

            // Check if a one-on-one chat already exists between these users
            if (!isGroupChat) {
                const existingChat = await Chat.findOne({
                    isGroupChat: false,
                    participants: { $all: allParticipants, $size: 2 }
                });

                if (existingChat) {
                    return res.status(200).json({
                        success: true,
                        data: existingChat,
                        message: 'Chat already exists'
                    });
                }
            }

            // Create user specific settings for all participants
            const userSpecificSettings = allParticipants.map(participantId => ({
                userId: participantId,
                isMuted: false,
                unreadCount: 0
            }));

            // Create new chat
            const newChat = await Chat.create({
                name: isGroupChat ? name : undefined,
                isGroupChat,
                participants: allParticipants,
                groupAdmins: isGroupChat ? [userId] : [],
                groupIconUrl: isGroupChat ? groupIconUrl : undefined,
                userSpecificSettings
            });

            // Populate the chat with participant details
            const populatedChat = await Chat.findById(newChat._id)
                .populate([
                    {
                        path: 'participants',
                        select: 'userName email userImage'
                    },
                    {
                        path: 'groupAdmins',
                        select: 'userName email'
                    }
                ]);

            res.status(201).json({
                success: true,
                data: populatedChat
            });
        } catch (error) {
            console.error('Error creating chat:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create chat',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get messages for a specific chat
     * @route GET /api/chats/:chatId/messages
     * @access Private
     */
    static async getChatMessages(req: any, res: Response) {
        try {
            if (!req.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const { chatId } = req.params;
            const userId = req.userId;

            // Verify user is part of the chat
            const chat = await Chat.findOne({
                _id: chatId,
                participants: userId
            });

            if (!chat) {
                return res.status(404).json({
                    success: false,
                    message: 'Chat not found or you are not a participant'
                });
            }

            // Get messages for the chat
            const messages = await Message.find({ chatId })
                .sort({ createdAt: -1 })
                .limit(50) // Limit to last 50 messages
                .populate('senderId', 'firstName lastName userName userImage');

            return res.status(200).json({
                success: true,
                data: messages
            });
        } catch (error) {
            console.error('Error fetching chat messages:', error);
            return res.status(500).json({
                success: false,
                message: 'Error fetching chat messages'
            });
        }
    }
}