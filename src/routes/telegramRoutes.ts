import { Router } from 'express';
import { getTelegramLink, getTelegramStatus, unlinkTelegram, miniAppAuth } from '../controllers/telegramController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/link', authenticate, getTelegramLink);
router.get('/status', authenticate, getTelegramStatus);
router.delete('/link', authenticate, unlinkTelegram);

// Telegram Mini App authentication (public — validates signed initData)
router.post('/miniapp-auth', miniAppAuth);

export default router;
