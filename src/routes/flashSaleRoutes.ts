import { Router } from 'express';
import {
  createFlashSale,
  getActiveFlashSales,
  getFlashSaleById,
  getMyFlashSales,
  deleteFlashSale
} from '../controllers/flashSaleController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public
router.get('/active', getActiveFlashSales);

// Seller
router.get('/mine', authenticate, authorize(['SELLER']), getMyFlashSales);
router.post('/', authenticate, authorize(['SELLER']), createFlashSale);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteFlashSale);

// Public (keep after /active and /mine so those aren't captured by :id)
router.get('/:id', getFlashSaleById);

export default router;
