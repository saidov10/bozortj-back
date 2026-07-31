import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Short product videos + a TikTok-style vertical feed. Sellers attach a short
// clip to a product; buyers swipe the feed and add to cart from it.

const ownsProduct = async (productId: string, userId: string): Promise<boolean> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { shop: { select: { userId: true } } }
  });
  return Boolean(product && product.shop.userId === userId);
};

// GET /api/products/:id/videos  (public)
export const getProductVideos = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const videos = await prisma.productVideo.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ videos });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving videos', error: error.message });
  }
};

// POST /api/products/:id/videos  (SELLER) — multipart "video"
export const addProductVideo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;

    if (!(await ownsProduct(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: 'A video file is required (field "video")' });

    const video = await prisma.productVideo.create({
      data: { productId: id, url: `/uploads/videos/${file.filename}` }
    });
    return res.status(201).json({ message: 'Video added', video });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding video', error: error.message });
  }
};

// DELETE /api/products/:id/videos/:videoId  (SELLER)
export const deleteProductVideo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id, videoId } = req.params;

    if (!(await ownsProduct(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    await prisma.productVideo.deleteMany({ where: { id: videoId, productId: id } });
    return res.status(200).json({ message: 'Video deleted' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting video', error: error.message });
  }
};

// GET /api/videos/feed  (public) — the vertical shoppable feed, newest first.
export const getVideoFeed = async (req: AuthRequest, res: Response) => {
  try {
    const take = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const videos = await prisma.productVideo.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        product: {
          include: {
            images: { take: 1 },
            brand: true,
            shop: { select: { id: true, shopName: true } },
            reviews: { select: { rating: true } }
          }
        }
      }
    });

    const feed = videos
      .filter((v) => v.product)
      .map((v) => {
        const reviews = v.product.reviews || [];
        const reviewCount = reviews.length;
        const averageRating = reviewCount > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
        const { reviews: _r, ...product } = v.product as any;
        return {
          id: v.id,
          url: v.url,
          createdAt: v.createdAt,
          product: { ...product, averageRating, reviewCount }
        };
      });

    return res.status(200).json({ feed });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving video feed', error: error.message });
  }
};
