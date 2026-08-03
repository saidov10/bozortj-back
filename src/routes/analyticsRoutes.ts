import { Router } from 'express';
import { getSellerAnalytics, getAdminAnalytics, getSalesHeatmap, getSellerDashboard } from '../controllers/analyticsController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize(['SELLER']), getSellerAnalytics);
router.get('/dashboard', authenticate, authorize(['SELLER']), getSellerDashboard);
router.get('/heatmap', authenticate, authorize(['SELLER']), getSalesHeatmap);
router.get('/admin', authenticate, authorize(['ADMIN']), getAdminAnalytics);

export default router;
