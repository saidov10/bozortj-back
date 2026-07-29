import { Router } from 'express';
import {
  getColors,
  createColor,
  updateColor,
  deleteColor
} from '../controllers/colorController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public read
router.get('/', getColors);

// Seller/Admin writes
router.post('/', authenticate, authorize(['SELLER', 'ADMIN']), createColor);
router.put('/:id', authenticate, authorize(['SELLER', 'ADMIN']), updateColor);
router.delete('/:id', authenticate, authorize(['SELLER', 'ADMIN']), deleteColor);

export default router;
