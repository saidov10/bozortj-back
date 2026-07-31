import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { isUserOnline } from '../services/chatSocket';

// GET /api/shops/:shopId/status  (public) — live online state + follower count,
// so a buyer sees a green dot and knows the seller will reply fast.
export const getShopStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { shopId } = req.params;
    const shop = await prisma.shopProfile.findUnique({
      where: { id: shopId },
      select: { userId: true, _count: { select: { followers: true } } }
    });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    let following = false;
    if (req.user) {
      const f = await prisma.shopFollow.findUnique({
        where: { userId_shopId: { userId: req.user.id, shopId } }
      });
      following = Boolean(f);
    }

    return res.status(200).json({
      online: isUserOnline(shop.userId),
      followerCount: shop._count.followers,
      following
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving shop status', error: error.message });
  }
};

// Buyer engagement: following shops (for new-product / flash-sale alerts) and
// "notify me when back in stock" subscriptions. The alerts themselves are fired
// from productController (restock, new product) and flashSaleController.

// ---- Follow a shop ----

// POST /api/shops/:shopId/follow  (BUYER)
export const followShop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { shopId } = req.params;

    const shop = await prisma.shopProfile.findUnique({ where: { id: shopId } });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    await prisma.shopFollow.upsert({
      where: { userId_shopId: { userId: req.user.id, shopId } },
      update: {},
      create: { userId: req.user.id, shopId }
    });

    const followerCount = await prisma.shopFollow.count({ where: { shopId } });
    return res.status(200).json({ message: 'Following shop', following: true, followerCount });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error following shop', error: error.message });
  }
};

// DELETE /api/shops/:shopId/follow  (BUYER)
export const unfollowShop = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { shopId } = req.params;

    await prisma.shopFollow.deleteMany({ where: { userId: req.user.id, shopId } });
    const followerCount = await prisma.shopFollow.count({ where: { shopId } });
    return res.status(200).json({ message: 'Unfollowed shop', following: false, followerCount });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error unfollowing shop', error: error.message });
  }
};

// GET /api/shops/following  (BUYER) — shops the buyer follows
export const getFollowedShops = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const follows = await prisma.shopFollow.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        shop: {
          select: {
            id: true,
            shopName: true,
            description: true,
            category: { select: { id: true, name: true } },
            _count: { select: { products: true, followers: true } }
          }
        }
      }
    });

    return res.status(200).json({ shops: follows.map((f) => f.shop) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving followed shops', error: error.message });
  }
};

// ---- Back-in-stock subscriptions ----

// POST /api/products/:id/notify-stock  (BUYER) — subscribe to a restock alert
export const subscribeStock = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true, stockQuantity: true } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stockQuantity > 0) {
      return res.status(400).json({ message: 'Product is currently in stock' });
    }

    await prisma.stockNotification.upsert({
      where: { userId_productId: { userId: req.user.id, productId: id } },
      update: { notified: false }, // re-arm if they subscribe again
      create: { userId: req.user.id, productId: id }
    });

    return res.status(200).json({ message: 'You will be notified when this product is back in stock', subscribed: true });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error subscribing to stock alert', error: error.message });
  }
};

// DELETE /api/products/:id/notify-stock  (BUYER)
export const unsubscribeStock = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;

    await prisma.stockNotification.deleteMany({ where: { userId: req.user.id, productId: id } });
    return res.status(200).json({ message: 'Unsubscribed from stock alert', subscribed: false });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error unsubscribing', error: error.message });
  }
};
