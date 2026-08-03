import { Router } from 'express';
import {
  createRequest,
  getOpenRequests,
  getMyRequests,
  getRequestById,
  createProposal,
  getMyProposals,
  acceptProposal,
  closeRequest
} from '../controllers/buyerRequestController';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth';

const router = Router();

// Buyer's / seller's own lists (before '/:id')
router.get('/mine', authenticate, authorize(['BUYER']), getMyRequests);
router.get('/proposals/mine', authenticate, authorize(['SELLER']), getMyProposals);

// Public browse
router.get('/', getOpenRequests);
router.get('/:id', optionalAuthenticate, getRequestById);

// Buyer creates a request & manages it
router.post('/', authenticate, authorize(['BUYER']), createRequest);
router.post('/:id/accept/:proposalId', authenticate, authorize(['BUYER']), acceptProposal);
router.patch('/:id/close', authenticate, authorize(['BUYER']), closeRequest);

// Seller proposes
router.post('/:id/proposals', authenticate, authorize(['SELLER']), createProposal);

export default router;
