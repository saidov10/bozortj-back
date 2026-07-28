import { Router } from 'express';
import { getConversations, getMessageHistory } from '../controllers/chatController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Restricted to BUYER and SELLER (Admins don't participate in seller-buyer chats)
router.use(authenticate, authorize(['BUYER', 'SELLER']));

router.get('/conversations', getConversations);
router.get('/history/:partnerId', getMessageHistory);

export default router;
