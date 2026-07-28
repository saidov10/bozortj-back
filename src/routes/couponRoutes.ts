import { Router } from 'express';
import { getCoupons, createCoupon, deleteCoupon } from '../controllers/couponController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getCoupons);
router.post('/', authorize(['SELLER', 'ADMIN']), createCoupon);
router.delete('/:id', authorize(['SELLER', 'ADMIN']), deleteCoupon);

export default router;
