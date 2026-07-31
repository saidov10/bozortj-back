import { Router } from 'express';
import { getVideoFeed } from '../controllers/videoController';

const router = Router();

// Public TikTok-style shoppable feed. (Per-product video CRUD lives under
// /api/products/:id/videos in productRoutes.)
router.get('/feed', getVideoFeed);

export default router;
