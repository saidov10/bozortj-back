import { Router } from 'express';
import {
  createStream,
  addStreamItem,
  removeStreamItem,
  startStream,
  featureItem,
  endStream,
  getStreams,
  getStreamById,
  getMyStreams
} from '../controllers/liveController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Seller's own streams (before '/:id')
router.get('/mine', authenticate, authorize(['SELLER']), getMyStreams);

// Public
router.get('/', getStreams);
router.get('/:id', getStreamById);

// Seller manages a stream
router.post('/', authenticate, authorize(['SELLER']), createStream);
router.post('/:id/items', authenticate, authorize(['SELLER']), addStreamItem);
router.delete('/:id/items/:itemId', authenticate, authorize(['SELLER']), removeStreamItem);
router.patch('/:id/start', authenticate, authorize(['SELLER']), startStream);
router.patch('/:id/feature', authenticate, authorize(['SELLER']), featureItem);
router.patch('/:id/end', authenticate, authorize(['SELLER']), endStream);

export default router;
