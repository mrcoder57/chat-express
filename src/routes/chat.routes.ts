import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Get all chats for the authenticated user
router.get('/', authenticateUser, ChatController.getUserChats);

// Get messages for a specific chat
router.get('/:chatId/messages', authenticateUser, ChatController.getChatMessages);

// Create a new chat
router.post('/', authenticateUser, ChatController.createChat);

export default router; 