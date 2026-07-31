import { Router } from 'express';
import {
  registerCourier,
  listCouriers,
  getMyDeliveries,
  updateDeliveryStatus
} from '../controllers/courierController';
import { authenticate, authorize } from '../middleware/auth';

// Mounted at both /api/couriers (registration + pick-list) and /api/courier
// (a courier's own deliveries). Kept in one router for simplicity.
const router = Router();

// Public registration for delivery people
router.post('/register', registerCourier);

// Sellers/admins fetch the courier pick-list to assign orders
router.get('/', authenticate, authorize(['SELLER', 'ADMIN']), listCouriers);

// A courier's own delivery queue + status updates
router.get('/deliveries', authenticate, authorize(['COURIER']), getMyDeliveries);
router.put('/deliveries/:id/status', authenticate, authorize(['COURIER']), updateDeliveryStatus);

export default router;
