import { Router } from 'express';
import {
  getPickupPoints,
  getPickupCities,
  getAllPickupPoints,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint
} from '../controllers/pickupController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public
router.get('/', getPickupPoints);
router.get('/cities', getPickupCities);

// Admin management
router.get('/all', authenticate, authorize(['ADMIN']), getAllPickupPoints);
router.post('/', authenticate, authorize(['ADMIN']), createPickupPoint);
router.put('/:id', authenticate, authorize(['ADMIN']), updatePickupPoint);
router.delete('/:id', authenticate, authorize(['ADMIN']), deletePickupPoint);

export default router;
