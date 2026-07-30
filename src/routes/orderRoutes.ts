import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrderStatus, getOrderTimeline } from '../controllers/orderController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['BUYER']), createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.get('/:id/timeline', getOrderTimeline);
router.put('/:id/status', authorize(['SELLER', 'ADMIN']), updateOrderStatus);

export default router;
