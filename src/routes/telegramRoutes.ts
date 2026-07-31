import { Router } from 'express';
import { getTelegramLink, getTelegramStatus, unlinkTelegram } from '../controllers/telegramController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/link', authenticate, getTelegramLink);
router.get('/status', authenticate, getTelegramStatus);
router.delete('/link', authenticate, unlinkTelegram);

export default router;
