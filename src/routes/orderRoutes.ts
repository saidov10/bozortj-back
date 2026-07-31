import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getOrderTimeline,
  getDeliveryQuote
} from '../controllers/orderController';
import { assignCourier } from '../controllers/courierController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['BUYER']), createOrder);
router.get('/delivery-quote', authorize(['BUYER']), getDeliveryQuote);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.get('/:id/timeline', getOrderTimeline);
router.put('/:id/status', authorize(['SELLER', 'ADMIN']), updateOrderStatus);
router.post('/:id/assign-courier', authorize(['SELLER', 'ADMIN']), assignCourier);

export default router;
