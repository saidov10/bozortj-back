import { Router } from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  getProductById,
  getProductRecommendations,
  addReview,
  replyToReview
} from '../controllers/productController';
import { authenticate, authorize } from '../middleware/auth';
import { uploadProductImages, uploadReviewImages } from '../middleware/upload';
import { productValidator, reviewValidator } from '../middleware/validation';

const router = Router();

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);
router.get('/:id/recommendations', getProductRecommendations);

// Seller only routes
router.post(
  '/',
  authenticate,
  authorize(['SELLER']),
  uploadProductImages,
  productValidator,
  createProduct
);

router.put(
  '/:id',
  authenticate,
  authorize(['SELLER']),
  uploadProductImages,
  updateProduct
);

router.delete('/:id', authenticate, authorize(['SELLER']), deleteProduct);

// Reply to review (Seller only)
router.post('/reviews/:id/reply', authenticate, authorize(['SELLER']), replyToReview);

// Buyer only routes (Allows uploading multiple review photos)
router.post(
  '/:id/reviews',
  authenticate,
  authorize(['BUYER']),
  uploadReviewImages,
  reviewValidator,
  addReview
);

export default router;
