import { Request, Response } from 'express';
import { Chat } from '../models';
import mongoose from 'mongoose';

export class ChatController {
    /**
     * Get all chats for a user
     * @route GET /api/chats
     * @access Private
     */
    static async getUserChats(req: any, res: Response) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = req.user._id;

            // Find all chats where the user is a participant
            const chats = await Chat.find({ participants: userId })
                .populate([
                    {
                        path: 'participants',
                        select: 'username email profilePicture', // Add or remove fields as needed
                    },
                    {
                        path: 'lastMessage',
                        select: 'content contentType createdAt',
                    },
                    {
                        path: 'groupAdmins',
                        select: 'username email',
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
} 