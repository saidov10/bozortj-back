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
  promoteProduct,
  getTrendingProducts,
  getPriceHistory,
  toggleReviewHelpful
} from '../controllers/productController';
import {
  getProductQuestions,
  askQuestion,
  answerQuestion,
  getPendingQuestions
} from '../controllers/qaController';
import { subscribeStock, unsubscribeStock } from '../controllers/engagementController';
import { productInstantAnswer, suggestQuestionAnswer } from '../controllers/productAIController';
import { getProductWholesaleTiers, setWholesaleTiers } from '../controllers/wholesaleController';
import { getProductVideos, addProductVideo, deleteProductVideo } from '../controllers/videoController';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth';
import { uploadProductVideo } from '../middleware/upload';
import { uploadProductImages, uploadReviewImages } from '../middleware/upload';
import { productValidator, reviewValidator } from '../middleware/validation';

const router = Router();

// Product Q&A (register before '/:id' catch-alls)
router.get('/questions/pending', authenticate, authorize(['SELLER']), getPendingQuestions);
router.post('/questions/:qid/answer', authenticate, authorize(['SELLER']), answerQuestion);
// AI seller chatbot: draft an answer for a pending question (SELLER).
router.post('/questions/:qid/ai-draft', authenticate, authorize(['SELLER']), suggestQuestionAnswer);

// Search & discovery (register before '/:id' catch-alls)
router.get('/search/suggestions', getSearchSuggestions);
router.get('/discovery/promoted', getPromotedProducts);
router.get('/discovery/trending', getTrendingProducts);
router.get('/discovery/compare', compareProducts);
router.get('/discovery/recently-viewed', authenticate, authorize(['BUYER']), getRecentlyViewed);

// Public routes
router.get('/', getProducts);
router.get('/:id', optionalAuthenticate, getProductById);
router.get('/:id/recommendations', getProductRecommendations);
router.get('/:id/price-history', getPriceHistory);
router.get('/:id/wholesale', getProductWholesaleTiers);
router.get('/:id/videos', getProductVideos);

// Back-in-stock subscription (Buyer)
router.post('/:id/notify-stock', authenticate, authorize(['BUYER']), subscribeStock);
router.delete('/:id/notify-stock', authenticate, authorize(['BUYER']), unsubscribeStock);

// Wholesale tiers & videos (Seller manages their own product)
router.put('/:id/wholesale', authenticate, authorize(['SELLER']), setWholesaleTiers);
router.post('/:id/videos', authenticate, authorize(['SELLER']), uploadProductVideo, addProductVideo);
router.delete('/:id/videos/:videoId', authenticate, authorize(['SELLER']), deleteProductVideo);
router.get('/:id/review-summary', getReviewSummary);
router.get('/:id/questions', getProductQuestions);
router.post('/:id/questions', authenticate, authorize(['BUYER']), askQuestion);
// AI instant answer from the product's own data (public product-page chatbot).
router.post('/:id/ai-question', productInstantAnswer);

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

// Vote a review helpful (Buyer)
router.post('/reviews/:reviewId/helpful', authenticate, authorize(['BUYER']), toggleReviewHelpful);

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
