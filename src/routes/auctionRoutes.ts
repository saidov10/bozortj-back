import { Router } from 'express';
import {
  createAuction,
  getActiveAuctions,
  getAuctionById,
  placeBid,
  getMyAuctions
} from '../controllers/auctionController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Seller's own auctions (before '/:id')
router.get('/mine', authenticate, authorize(['SELLER']), getMyAuctions);

// Public
router.get('/', getActiveAuctions);
router.get('/:id', getAuctionById);

// Seller creates, buyer bids
router.post('/', authenticate, authorize(['SELLER']), createAuction);
router.post('/:id/bid', authenticate, authorize(['BUYER']), placeBid);

export default router;
