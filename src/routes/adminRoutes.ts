import { Router } from 'express';
import {
  createReport,
  getReports,
  updateReportStatus,
  toggleUserBlock,
  getUsers
} from '../controllers/adminController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Buyer submits a report
router.post('/reports', authorize(['BUYER']), createReport);

// Admin-only moderation endpoints
router.get('/reports', authorize(['ADMIN']), getReports);
router.put('/reports/:id', authorize(['ADMIN']), updateReportStatus);
router.put('/users/:userId/block', authorize(['ADMIN']), toggleUserBlock);
router.get('/users', authorize(['ADMIN']), getUsers);

export default router;
