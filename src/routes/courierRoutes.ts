import { Router } from 'express';
import {
  registerCourier,
  listCouriers,
  getMyDeliveries,
  updateDeliveryStatus,
  updateCourierLocation
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
// Live tracking: courier pushes their GPS position while delivering.
router.put('/deliveries/:id/location', authenticate, authorize(['COURIER']), updateCourierLocation);

export default router;
