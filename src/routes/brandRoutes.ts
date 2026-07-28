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

// Seller-only writes
router.post('/', authenticate, authorize(['SELLER']), createBrand);
router.put('/:id', authenticate, authorize(['SELLER']), updateBrand);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteBrand);

export default router;
