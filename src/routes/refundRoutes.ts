import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadRefundImages } from '../middleware/upload';
import {
  createRefundRequest,
  processRefundRequest,
  resolveRefundDispute
} from '../controllers/refundController';

const router = Router();

router.use(authenticate);

// Submit return request with images
router.post('/:id/refund', uploadRefundImages, createRefundRequest);

// Process return request (Seller action)
router.put('/:id/refund', processRefundRequest);

// Dispute resolution (Admin action)
router.put('/:id/refund/dispute', resolveRefundDispute);

export default router;
