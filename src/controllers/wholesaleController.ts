import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Wholesale (оптом) tiered pricing: sellers set "buy N+, pay less per unit".
// Buyers see the tiers on the product page; checkout applies the best tier per
// line automatically (see cartController / orderController pricing).

// Verify the seller owns the product; returns the product or null.
const ownedProduct = async (productId: string, userId: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { shop: { select: { userId: true } } }
  });
  if (!product || product.shop.userId !== userId) return null;
  return product;
};

// GET /api/products/:id/wholesale  (public) — tiers sorted by quantity
export const getProductWholesaleTiers = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tiers = await prisma.wholesaleTier.findMany({
      where: { productId: id },
      orderBy: { minQty: 'asc' },
      select: { id: true, minQty: true, price: true }
    });
    return res.status(200).json({ tiers });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving wholesale tiers', error: error.message });
  }
};

// PUT /api/products/:id/wholesale  (SELLER) — replaces the full tier set
// Body: { tiers: [{ minQty, price }, ...] }
export const setWholesaleTiers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;

    const product = await ownedProduct(id, req.user.id);
    if (!product) return res.status(403).json({ message: 'You do not own this product' });

    const rawTiers = Array.isArray(req.body.tiers) ? req.body.tiers : [];
    // Validate & normalise: positive integer qty, positive price, below base price.
    const seen = new Set<number>();
    const clean: { minQty: number; price: number }[] = [];
    for (const t of rawTiers) {
      const minQty = parseInt(t.minQty);
      const price = parseFloat(t.price);
      if (isNaN(minQty) || minQty < 2 || isNaN(price) || price <= 0) continue;
      if (price >= product.price) {
        return res.status(400).json({ message: `Wholesale price (${price}) must be below the base price (${product.price})` });
      }
      if (seen.has(minQty)) continue;
      seen.add(minQty);
      clean.push({ minQty, price });
    }

    // Replace atomically.
    await prisma.$transaction([
      prisma.wholesaleTier.deleteMany({ where: { productId: id } }),
      ...(clean.length > 0
        ? [prisma.wholesaleTier.createMany({ data: clean.map((t) => ({ productId: id, ...t })) })]
        : [])
    ]);

    const tiers = await prisma.wholesaleTier.findMany({
      where: { productId: id },
      orderBy: { minQty: 'asc' },
      select: { id: true, minQty: true, price: true }
    });
    return res.status(200).json({ message: 'Wholesale tiers saved', tiers });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error saving wholesale tiers', error: error.message });
  }
};
