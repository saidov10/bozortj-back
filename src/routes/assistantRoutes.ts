import { Router } from 'express';
import { assistantChat } from '../controllers/assistantController';

const router = Router();

// Public: AI shopping assistant chat
router.post('/chat', assistantChat);

export default router;
