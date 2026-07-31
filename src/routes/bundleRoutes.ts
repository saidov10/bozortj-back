import { Router } from 'express';
import {
  createBundle,
  getShopBundles,
  getProductBundles,
  deleteBundle
} from '../controllers/bundleController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public reads
router.get('/shop/:shopId', getShopBundles);
router.get('/product/:productId', getProductBundles);

// Seller manages their bundles
router.post('/', authenticate, authorize(['SELLER']), createBundle);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteBundle);

export default router;
