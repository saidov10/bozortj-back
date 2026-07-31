import { Router } from 'express';
import multer from 'multer';
import {
  assistantChat,
  assistantPhoto,
  assistantGenerateDescription,
  assistantTranslate,
  assistantSuggestReply
} from '../controllers/assistantController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// In-memory upload for visual search — we don't persist the photo to disk,
// just base64-encode it for the vision request.
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB
});

// Public: AI shopping assistant
router.post('/chat', assistantChat);
router.post('/photo', uploadMemory.single('photo'), assistantPhoto);

// Seller: AI description generator
router.post(
  '/generate-description',
  authenticate,
  authorize(['SELLER']),
  assistantGenerateDescription
);

// Seller: AI translate (tj <-> ru) and suggested reply drafting
router.post('/translate', authenticate, authorize(['SELLER']), assistantTranslate);
router.post('/suggest-reply', authenticate, authorize(['SELLER']), assistantSuggestReply);

export default router;
