import { Router } from 'express';
import {
  createOffer,
  getMyOffers,
  getReceivedOffers,
  acceptOffer,
  rejectOffer,
  counterOffer,
  acceptCounter
} from '../controllers/offerController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Buyer
router.post('/', authenticate, authorize(['BUYER']), createOffer);
router.get('/mine', authenticate, authorize(['BUYER']), getMyOffers);
router.post('/:id/accept-counter', authenticate, authorize(['BUYER']), acceptCounter);

// Seller
router.get('/received', authenticate, authorize(['SELLER']), getReceivedOffers);
router.post('/:id/accept', authenticate, authorize(['SELLER']), acceptOffer);
router.post('/:id/reject', authenticate, authorize(['SELLER']), rejectOffer);
router.post('/:id/counter', authenticate, authorize(['SELLER']), counterOffer);

export default router;
