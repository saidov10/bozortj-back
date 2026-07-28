import { Router } from 'express';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from '../controllers/wishlistController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Apply auth and buyer restrictions to all wishlist routes
router.use(authenticate, authorize(['BUYER']));

router.get('/', getWishlist);
router.post('/', addToWishlist);
router.delete('/:id', removeFromWishlist);

export default router;
