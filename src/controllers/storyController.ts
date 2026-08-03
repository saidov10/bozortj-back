import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Shop stories (Story-и мағоза): 24-hour photo/video posts, Instagram-style. A
// seller drops quick behind-the-counter clips or new-arrival snaps; buyers watch
// them in a stories tray and tap through to the linked product.

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const shapeStory = (s: any) => ({
  id: s.id,
  shopId: s.shopId,
  mediaUrl: s.mediaUrl,
  mediaType: s.mediaType,
  caption: s.caption ?? null,
  productId: s.productId ?? null,
  viewCount: s.viewCount,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt
});

// POST /api/stories  (SELLER) — multipart field "story" (image or video)
// Body: { caption?, productId? }
export const createStory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Only sellers with a shop can post stories' });

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: 'A story image or video is required (field "story")' });

    const mediaType = /video\//.test(file.mimetype) || /\.(mp4|mov|webm)$/i.test(file.originalname) ? 'VIDEO' : 'IMAGE';

    // Optional product link must belong to this shop.
    let productId: string | null = null;
    if (req.body.productId) {
      const product = await prisma.product.findUnique({ where: { id: req.body.productId } });
      if (!product || product.shopId !== shop.id) {
        return res.status(400).json({ message: 'Linked product must be one of your own' });
      }
      productId = product.id;
    }

    const story = await prisma.shopStory.create({
      data: {
        shopId: shop.id,
        mediaUrl: `/uploads/stories/${file.filename}`,
        mediaType,
        caption: req.body.caption ? String(req.body.caption).slice(0, 300) : null,
        productId,
        expiresAt: new Date(Date.now() + STORY_TTL_MS)
      }
    });
    return res.status(201).json({ message: 'Story нашр шуд (24 соат)', story: shapeStory(story) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating story', error: error.message });
  }
};

// GET /api/stories  (public) — active stories grouped by shop (a stories tray).
export const getStoriesFeed = async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const stories = await prisma.shopStory.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: { shop: { select: { id: true, shopName: true, bannerUrl: true, brandColor: true } } }
    });

    // Group into one tray entry per shop (most-recent shop first).
    const byShop = new Map<string, any>();
    for (const s of stories) {
      const key = s.shopId;
      if (!byShop.has(key)) {
        byShop.set(key, {
          shopId: s.shopId,
          shopName: s.shop?.shopName ?? null,
          bannerUrl: s.shop?.bannerUrl ?? null,
          brandColor: s.shop?.brandColor ?? null,
          latestAt: s.createdAt,
          stories: []
        });
      }
      const entry = byShop.get(key);
      entry.stories.push(shapeStory(s));
      if (s.createdAt > entry.latestAt) entry.latestAt = s.createdAt;
    }

    const trays = Array.from(byShop.values()).sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
    );
    return res.status(200).json({ trays });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving stories', error: error.message });
  }
};

// GET /api/stories/shop/:shopId  (public) — one shop's active stories
export const getShopStories = async (req: AuthRequest, res: Response) => {
  try {
    const stories = await prisma.shopStory.findMany({
      where: { shopId: req.params.shopId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' }
    });
    return res.status(200).json({ stories: stories.map(shapeStory) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving stories', error: error.message });
  }
};

// GET /api/stories/mine  (SELLER) — my stories (incl. expired, for management)
export const getMyStories = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });
    const stories = await prisma.shopStory.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' }
    });
    const now = Date.now();
    return res.status(200).json({
      stories: stories.map((s) => ({ ...shapeStory(s), isActive: new Date(s.expiresAt).getTime() > now }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving stories', error: error.message });
  }
};

// POST /api/stories/:id/view  (public) — count a view
export const viewStory = async (req: AuthRequest, res: Response) => {
  try {
    await prisma.shopStory.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } }
    }).catch(() => undefined);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error counting view', error: error.message });
  }
};

// DELETE /api/stories/:id  (SELLER)
export const deleteStory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });
    const story = await prisma.shopStory.findUnique({ where: { id: req.params.id } });
    if (!story || story.shopId !== shop.id) return res.status(404).json({ message: 'Story not found' });
    await prisma.shopStory.delete({ where: { id: story.id } });
    return res.status(200).json({ message: 'Story нест карда шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting story', error: error.message });
  }
};
