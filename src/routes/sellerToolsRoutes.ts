import { Router } from 'express';
import {
  exportOrdersCsv,
  importProductsCsv,
  getShopQrCode,
  getPriceInsights
} from '../controllers/sellerToolsController';
import { authenticate, authorize } from '../middleware/auth';
import { uploadCsv } from '../middleware/upload';

const router = Router();

router.use(authenticate, authorize(['SELLER']));

router.get('/export/orders', exportOrdersCsv);
router.post('/import/products', uploadCsv, importProductsCsv);
router.get('/qr', getShopQrCode);
router.get('/price-insights', getPriceInsights);

export default router;
