import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory
} from '../controllers/categoryController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public / open routes
router.get('/', getCategories);
router.get('/:categoryId/subcategories', getSubcategories);

// Seller-only routes (add, edit, delete)
router.post('/', authenticate, authorize(['SELLER']), createCategory);
router.put('/:id', authenticate, authorize(['SELLER']), updateCategory);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteCategory);

router.post('/:categoryId/subcategories', authenticate, authorize(['SELLER']), createSubcategory);
router.put('/subcategories/:id', authenticate, authorize(['SELLER']), updateSubcategory);
router.delete('/subcategories/:id', authenticate, authorize(['SELLER']), deleteSubcategory);

export default router;
