import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart
} from '../controllers/cartController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Apply auth and buyer restrictions to all cart routes
router.use(authenticate, authorize(['BUYER']));

router.get('/', getCart);
router.post('/', addToCart);
router.put('/:id', updateCartItem);
router.delete('/:id', removeFromCart);

export default router;
