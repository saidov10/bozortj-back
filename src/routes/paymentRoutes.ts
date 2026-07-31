import { Router } from 'express';
import {
  getPaymentProviders,
  initiatePayment,
  confirmPayment,
  getPaymentByOrder
} from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/providers', getPaymentProviders);
router.post('/initiate', authenticate, initiatePayment);
router.get('/order/:orderId', authenticate, getPaymentByOrder);

// Confirm is open (simulated-provider callback / future webhook target).
router.post('/:id/confirm', confirmPayment);

export default router;
