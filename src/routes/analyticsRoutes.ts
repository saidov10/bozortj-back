import { Router } from 'express';
import { getSellerAnalytics, getAdminAnalytics } from '../controllers/analyticsController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize(['SELLER']), getSellerAnalytics);
router.get('/admin', authenticate, authorize(['ADMIN']), getAdminAnalytics);

export default router;
