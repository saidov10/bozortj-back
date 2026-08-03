import { Router } from 'express';
import {
  createStory,
  getStoriesFeed,
  getShopStories,
  getMyStories,
  viewStory,
  deleteStory
} from '../controllers/storyController';
import { authenticate, authorize } from '../middleware/auth';
import { uploadStory } from '../middleware/upload';

const router = Router();

// Seller's own stories (before '/:id')
router.get('/mine', authenticate, authorize(['SELLER']), getMyStories);

// Public
router.get('/', getStoriesFeed);
router.get('/shop/:shopId', getShopStories);
router.post('/:id/view', viewStory);

// Seller manages stories
router.post('/', authenticate, authorize(['SELLER']), uploadStory, createStory);
router.delete('/:id', authenticate, authorize(['SELLER']), deleteStory);

export default router;
