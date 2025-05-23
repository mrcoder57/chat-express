import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Get all chats for the authenticated user
router.get('/', authenticateUser, ChatController.getUserChats);

export default router; 