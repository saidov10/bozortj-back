import { Router } from 'express';
import {
  exportOrdersCsv,
  importProductsCsv,
  getShopQrCode
} from '../controllers/sellerToolsController';
import { authenticate, authorize } from '../middleware/auth';
import { uploadCsv } from '../middleware/upload';

const router = Router();

router.use(authenticate, authorize(['SELLER']));

router.get('/export/orders', exportOrdersCsv);
router.post('/import/products', uploadCsv, importProductsCsv);
router.get('/qr', getShopQrCode);

export default router;
