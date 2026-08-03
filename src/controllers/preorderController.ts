import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// Pre-order (фармоиши пешакӣ): a seller announces a product that hasn't arrived
// yet; buyers reserve it in advance so the seller sees real demand and knows how
// much to bring. On release the seller notifies every reserver at once.

const preorderInclude = {
  product: { include: { images: { take: 1 }, shop: { select: { id: true, shopName: true, userId: true } } } },
  user: { select: { id: true, name: true, phone: true } }
};

const shapePreorder = (p: any) => ({
  id: p.id,
  productId: p.productId,
  quantity: p.quantity,
  status: p.status,
  createdAt: p.createdAt,
  buyer: p.user ?? undefined,
  product: p.product
    ? {
        id: p.product.id,
        name: p.product.name,
        image: p.product.images?.[0]?.url ?? null,
        price: p.product.price,
        isPreorder: p.product.isPreorder,
        preorderReleaseDate: p.product.preorderReleaseDate,
        shopName: p.product.shop?.shopName ?? null
      }
    : null
});

// PUT /api/preorders/products/:productId/settings  (SELLER)
// Body: { isPreorder, preorderReleaseDate?, preorderLimit? }
export const setPreorderSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { userId: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    const isPreorder = req.body.isPreorder === true || req.body.isPreorder === 'true';
    const data: any = { isPreorder };

    if (req.body.preorderReleaseDate !== undefined) {
      if (req.body.preorderReleaseDate === '' || req.body.preorderReleaseDate === null) {
        data.preorderReleaseDate = null;
      } else {
        const d = new Date(req.body.preorderReleaseDate);
        if (isNaN(d.getTime())) return res.status(400).json({ message: 'preorderReleaseDate must be a valid date' });
        data.preorderReleaseDate = d;
      }
    }
    if (req.body.preorderLimit !== undefined) {
      if (req.body.preorderLimit === '' || req.body.preorderLimit === null) {
        data.preorderLimit = null;
      } else {
        const n = parseInt(req.body.preorderLimit);
        if (isNaN(n) || n < 1) return res.status(400).json({ message: 'preorderLimit must be a positive whole number' });
        data.preorderLimit = n;
      }
    }

    const updated = await prisma.product.update({ where: { id: productId }, data });
    return res.status(200).json({
      message: isPreorder ? 'Фармоиши пешакӣ фаъол шуд' : 'Фармоиши пешакӣ хомӯш шуд',
      preorder: {
        isPreorder: updated.isPreorder,
        preorderReleaseDate: updated.preorderReleaseDate,
        preorderLimit: updated.preorderLimit
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating preorder settings', error: error.message });
  }
};

// POST /api/preorders  (BUYER)  { productId, quantity? }
export const reservePreorder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { productId } = req.body;
    const quantity = Math.max(1, parseInt(req.body.quantity) || 1);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { id: true, shopName: true, userId: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!product.isPreorder) return res.status(400).json({ message: 'This product is not open for pre-order' });

    // Enforce the optional reservation cap (sum of active reservations + this one).
    if (product.preorderLimit != null) {
      const agg = await prisma.preorder.aggregate({
        where: { productId, status: { in: ['RESERVED', 'NOTIFIED'] }, userId: { not: req.user.id } },
        _sum: { quantity: true }
      });
      const reservedByOthers = agg._sum.quantity ?? 0;
      if (reservedByOthers + quantity > product.preorderLimit) {
        return res.status(409).json({ message: 'Ҳадди фармоиши пешакӣ пур шуд' });
      }
    }

    const preorder = await prisma.preorder.upsert({
      where: { productId_userId: { productId, userId: req.user.id } },
      update: { quantity, status: 'RESERVED' },
      create: { productId, userId: req.user.id, quantity },
      include: preorderInclude
    });

    // Tell the seller demand ticked up.
    await createNotification(
      product.shop.userId,
      'Фармоиши пешакии нав 📋',
      `«${product.name}» — ${quantity} адад пешакӣ фармоиш шуд.`,
      { type: 'PREORDER_RESERVED', productId, preorderId: preorder.id }
    );

    return res.status(201).json({ message: 'Фармоиши пешакӣ сабт шуд', preorder: shapePreorder(preorder) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error reserving preorder', error: error.message });
  }
};

// GET /api/preorders/mine  (BUYER)
export const getMyPreorders = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const preorders = await prisma.preorder.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: preorderInclude
    });
    return res.status(200).json({ preorders: preorders.map(shapePreorder) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving preorders', error: error.message });
  }
};

// GET /api/preorders/shop  (SELLER) — demand across my pre-order products
export const getShopPreorders = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });

    const preorders = await prisma.preorder.findMany({
      where: { product: { shopId: shop.id } },
      orderBy: { createdAt: 'desc' },
      include: preorderInclude
    });

    // Aggregate demand per product for a quick "how many should I bring" view.
    const demand: Record<string, { productId: string; name: string; totalUnits: number; reservations: number }> = {};
    preorders.forEach((p) => {
      if (p.status === 'CANCELLED') return;
      const key = p.productId;
      if (!demand[key]) {
        demand[key] = { productId: key, name: p.product?.name ?? '', totalUnits: 0, reservations: 0 };
      }
      demand[key].totalUnits += p.quantity;
      demand[key].reservations += 1;
    });

    return res.status(200).json({
      preorders: preorders.map(shapePreorder),
      demand: Object.values(demand)
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving preorders', error: error.message });
  }
};

// DELETE /api/preorders/:id  (BUYER) — cancel my reservation
export const cancelPreorder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const preorder = await prisma.preorder.findUnique({ where: { id: req.params.id } });
    if (!preorder) return res.status(404).json({ message: 'Preorder not found' });
    if (preorder.userId !== req.user.id) return res.status(403).json({ message: 'You do not own this preorder' });

    await prisma.preorder.update({ where: { id: preorder.id }, data: { status: 'CANCELLED' } });
    return res.status(200).json({ message: 'Фармоиши пешакӣ бекор шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error cancelling preorder', error: error.message });
  }
};

// POST /api/preorders/products/:productId/release  (SELLER)  { stockQuantity? }
// Marks the product released: turns off pre-order, optionally sets arriving stock,
// and notifies every reserver that it's now available to buy.
export const releasePreorder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { userId: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    const data: any = { isPreorder: false };
    if (req.body.stockQuantity !== undefined && req.body.stockQuantity !== '') {
      const s = parseInt(req.body.stockQuantity);
      if (!isNaN(s) && s >= 0) data.stockQuantity = s;
    }
    await prisma.product.update({ where: { id: productId }, data });

    // Notify all active reservers.
    const reservers = await prisma.preorder.findMany({
      where: { productId, status: { in: ['RESERVED', 'NOTIFIED'] } },
      select: { id: true, userId: true }
    });
    for (const r of reservers) {
      await createNotification(
        r.userId,
        '🎉 Моли пешфармоишкардаатон омад!',
        `«${product.name}» ҳоло дастрас аст. Барои харид шитоб кунед!`,
        { type: 'PREORDER_RELEASED', productId }
      );
    }
    await prisma.preorder.updateMany({
      where: { productId, status: 'RESERVED' },
      data: { status: 'NOTIFIED' }
    });

    return res.status(200).json({ message: `Мол дастрас шуд — ${reservers.length} харидор огоҳ карда шуд`, notified: reservers.length });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error releasing preorder', error: error.message });
  }
};
