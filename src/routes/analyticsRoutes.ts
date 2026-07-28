import { Router } from 'express';
import { getSellerAnalytics } from '../controllers/analyticsController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize(['SELLER']), getSellerAnalytics);

export default router;
