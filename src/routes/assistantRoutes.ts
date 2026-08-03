import { Router } from 'express';
import multer from 'multer';
import {
  assistantChat,
  assistantPhoto,
  assistantGenerateDescription,
  assistantTranslate,
  assistantSuggestReply,
  assistantSizeAdvice,
  assistantVoice,
  assistantPriceAdvice,
  assistantShoppingPlan
} from '../controllers/assistantController';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth';

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
router.post('/size-advice', assistantSizeAdvice);
router.post('/voice', uploadMemory.single('audio'), assistantVoice);
// Full-purchase planner — optional auth so a logged-in buyer can save the plan.
router.post('/shopping-plan', optionalAuthenticate, assistantShoppingPlan);

// Seller: AI description generator
router.post(
  '/generate-description',
  authenticate,
  authorize(['SELLER']),
  assistantGenerateDescription
);

// Seller: AI translate (tj <-> ru), suggested reply drafting, price advice
router.post('/translate', authenticate, authorize(['SELLER']), assistantTranslate);
router.post('/suggest-reply', authenticate, authorize(['SELLER']), assistantSuggestReply);
router.post('/price-advice', authenticate, authorize(['SELLER']), assistantPriceAdvice);

export default router;
