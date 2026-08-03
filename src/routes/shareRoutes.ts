import { Router } from 'express';
import { getShareCard, shareToTelegram } from '../controllers/shareController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public: shareable card payload (caption, hashtags, deep links, image).
router.get('/products/:id/card', getShareCard);

// Seller: one-tap post to the public Telegram channel.
router.post('/products/:id/telegram', authenticate, authorize(['SELLER']), shareToTelegram);

export default router;
