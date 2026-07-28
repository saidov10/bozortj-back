import { Router } from 'express';
import { getShops, getShopById, updateShopSettings } from '../controllers/shopController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', getShops);
router.get('/:id', getShopById);

// Seller only settings
router.put('/settings/auto-reply', authenticate, updateShopSettings);

export default router;
