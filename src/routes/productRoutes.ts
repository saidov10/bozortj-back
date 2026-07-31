import { Router } from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProducts,
  getProductById,
  getProductRecommendations,
  getReviewSummary,
  addReview,
  replyToReview,
  getSearchSuggestions,
  getRecentlyViewed,
  compareProducts,
  getPromotedProducts,
  promoteProduct
} from '../controllers/productController';
import {
  getProductQuestions,
  askQuestion,
  answerQuestion,
  getPendingQuestions
} from '../controllers/qaController';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth';
import { uploadProductImages, uploadReviewImages } from '../middleware/upload';
import { productValidator, reviewValidator } from '../middleware/validation';

const router = Router();

// Product Q&A (register before '/:id' catch-alls)
router.get('/questions/pending', authenticate, authorize(['SELLER']), getPendingQuestions);
router.post('/questions/:qid/answer', authenticate, authorize(['SELLER']), answerQuestion);

// Search & discovery (register before '/:id' catch-alls)
router.get('/search/suggestions', getSearchSuggestions);
router.get('/discovery/promoted', getPromotedProducts);
router.get('/discovery/compare', compareProducts);
router.get('/discovery/recently-viewed', authenticate, authorize(['BUYER']), getRecentlyViewed);

// Public routes
router.get('/', getProducts);
router.get('/:id', optionalAuthenticate, getProductById);
router.get('/:id/recommendations', getProductRecommendations);
router.get('/:id/review-summary', getReviewSummary);
router.get('/:id/questions', getProductQuestions);
router.post('/:id/questions', authenticate, authorize(['BUYER']), askQuestion);

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

// Promote a product (Seller only) — featured placement
router.post('/:id/promote', authenticate, authorize(['SELLER']), promoteProduct);

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
