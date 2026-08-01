import { Router } from 'express';
import { getShops, getShopById, updateShopSettings, updateShopBanner } from '../controllers/shopController';
import { getShopBadges } from '../controllers/trustController';
import {
  followShop,
  unfollowShop,
  getFollowedShops,
  getShopStatus
} from '../controllers/engagementController';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth';
import { uploadBanner } from '../middleware/upload';

const router = Router();

// Shops the current buyer follows (register before '/:id')
router.get('/following', authenticate, authorize(['BUYER']), getFollowedShops);

router.get('/', getShops);
router.get('/:id/badges', getShopBadges);
router.get('/:shopId/status', optionalAuthenticate, getShopStatus);
router.get('/:id', getShopById);

// Seller only settings
router.put('/settings/auto-reply', authenticate, updateShopSettings);
router.put('/settings/banner', authenticate, uploadBanner, updateShopBanner);

// Follow / unfollow a shop (Buyer)
router.post('/:shopId/follow', authenticate, authorize(['BUYER']), followShop);
router.delete('/:shopId/follow', authenticate, authorize(['BUYER']), unfollowShop);

export default router;
