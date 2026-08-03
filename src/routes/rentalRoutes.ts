import { Router } from 'express';
import {
  setRentalSettings,
  getAvailability,
  createBooking,
  getMyBookings,
  getShopBookings,
  updateBookingStatus,
  cancelBooking
} from '../controllers/rentalController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Buyer's / seller's own lists (before '/:id' style routes)
router.get('/mine', authenticate, authorize(['BUYER']), getMyBookings);
router.get('/shop', authenticate, authorize(['SELLER']), getShopBookings);

// Product-scoped: rental config (seller) & availability calendar (public)
router.put('/products/:productId/settings', authenticate, authorize(['SELLER']), setRentalSettings);
router.get('/products/:productId/availability', getAvailability);

// Bookings
router.post('/', authenticate, authorize(['BUYER']), createBooking);
router.patch('/:id/status', authenticate, authorize(['SELLER']), updateBookingStatus);
router.patch('/:id/cancel', authenticate, authorize(['BUYER']), cancelBooking);

export default router;
