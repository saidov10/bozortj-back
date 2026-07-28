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

// Seller-only writes
router.post('/', authenticate, authorize(['SELLER']), createColor);
router.put('/:id', authenticate, authorize(['SELLER']), updateColor);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteColor);

export default router;
