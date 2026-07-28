import { Router } from 'express';
import {
  registerBuyer,
  registerSeller,
  login,
  getProfile,
  updateProfile
} from '../controllers/authController';
import {
  registerBuyerValidator,
  registerSellerValidator,
  loginValidator
} from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { uploadAvatar } from '../middleware/upload';

const router = Router();

// Routes
router.post('/register/buyer', uploadAvatar, registerBuyerValidator, registerBuyer);
router.post('/register/seller', uploadAvatar, registerSellerValidator, registerSeller);
router.post('/login', loginValidator, login);
router.get('/me', authenticate, getProfile);
router.put('/me', authenticate, uploadAvatar, updateProfile);

export default router;
