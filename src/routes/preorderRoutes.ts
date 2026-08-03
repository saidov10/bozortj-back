import { Router } from 'express';
import {
  setPreorderSettings,
  reservePreorder,
  getMyPreorders,
  getShopPreorders,
  cancelPreorder,
  releasePreorder
} from '../controllers/preorderController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Buyer's / seller's own lists (before '/:id')
router.get('/mine', authenticate, authorize(['BUYER']), getMyPreorders);
router.get('/shop', authenticate, authorize(['SELLER']), getShopPreorders);

// Product-scoped seller management
router.put('/products/:productId/settings', authenticate, authorize(['SELLER']), setPreorderSettings);
router.post('/products/:productId/release', authenticate, authorize(['SELLER']), releasePreorder);

// Buyer reserves / cancels
router.post('/', authenticate, authorize(['BUYER']), reservePreorder);
router.delete('/:id', authenticate, authorize(['BUYER']), cancelPreorder);

export default router;
