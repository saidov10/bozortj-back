import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getOrderTimeline,
  getDeliveryQuote,
  cancelOrderByBuyer,
  reorder,
  getMyWarranties
} from '../controllers/orderController';
import { assignCourier, getCourierLocation } from '../controllers/courierController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['BUYER']), createOrder);
router.get('/delivery-quote', authorize(['BUYER']), getDeliveryQuote);
router.get('/warranties', authorize(['BUYER']), getMyWarranties);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.get('/:id/timeline', getOrderTimeline);
// Live courier tracking (buyer/seller/courier who are party to the order).
router.get('/:id/courier-location', getCourierLocation);
router.put('/:id/status', authorize(['SELLER', 'ADMIN']), updateOrderStatus);
router.post('/:id/assign-courier', authorize(['SELLER', 'ADMIN']), assignCourier);
router.post('/:id/cancel', authorize(['BUYER']), cancelOrderByBuyer);
router.post('/:id/reorder', authorize(['BUYER']), reorder);

export default router;
