import { Router } from 'express';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand
} from '../controllers/brandController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public read
router.get('/', getBrands);

// Seller/Admin writes
router.post('/', authenticate, authorize(['SELLER', 'ADMIN']), createBrand);
router.put('/:id', authenticate, authorize(['SELLER', 'ADMIN']), updateBrand);
router.delete('/:id', authenticate, authorize(['SELLER', 'ADMIN']), deleteBrand);

export default router;
