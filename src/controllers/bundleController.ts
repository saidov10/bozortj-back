import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// "Buy together" bundles: a seller groups several of their products and sells the
// set at a discount. Raises average order value and moves accessories.

const bundleInclude = {
  items: {
    include: {
      product: {
        include: {
          images: { take: 1 },
          brand: true,
          color: true
        }
      }
    }
  }
};

// Compute the bundle's original total and discounted price from its items.
const priceBundle = (bundle: any) => {
  const original = bundle.items.reduce((sum: number, it: any) => {
    const p = it.product;
    const eff = p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;
    return sum + eff;
  }, 0);
  const bundlePrice = +(original * (1 - bundle.discountPercent / 100)).toFixed(2);
  return { originalTotal: +original.toFixed(2), bundlePrice, savings: +(original - bundlePrice).toFixed(2) };
};

const shopOf = (userId: string) => prisma.shopProfile.findUnique({ where: { userId } });

// POST /api/bundles  (SELLER)  { name, discountPercent, productIds: [] }
export const createBundle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await shopOf(req.user.id);
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const { name, discountPercent, productIds } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Bundle name is required' });
    }
    const discount = parseFloat(discountPercent);
    if (isNaN(discount) || discount < 0 || discount > 90) {
      return res.status(400).json({ message: 'discountPercent must be between 0 and 90' });
    }
    const ids: string[] = Array.isArray(productIds) ? Array.from(new Set(productIds)) : [];
    if (ids.length < 2) {
      return res.status(400).json({ message: 'A bundle needs at least 2 products' });
    }

    // All products must belong to this shop.
    const owned = await prisma.product.findMany({
      where: { id: { in: ids }, shopId: shop.id },
      select: { id: true }
    });
    if (owned.length !== ids.length) {
      return res.status(400).json({ message: 'All bundle products must belong to your shop' });
    }

    const bundle = await prisma.bundle.create({
      data: {
        shopId: shop.id,
        name: name.trim(),
        discountPercent: discount,
        items: { create: ids.map((productId) => ({ productId })) }
      },
      include: bundleInclude
    });

    return res.status(201).json({ message: 'Bundle created', bundle: { ...bundle, pricing: priceBundle(bundle) } });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating bundle', error: error.message });
  }
};

// GET /api/bundles/shop/:shopId  (public) — active bundles for a shop
export const getShopBundles = async (req: AuthRequest, res: Response) => {
  try {
    const { shopId } = req.params;
    const bundles = await prisma.bundle.findMany({
      where: { shopId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: bundleInclude
    });
    return res.status(200).json({
      bundles: bundles.map((b) => ({ ...b, pricing: priceBundle(b) }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving bundles', error: error.message });
  }
};

// GET /api/bundles/product/:productId  (public) — bundles that include a product
export const getProductBundles = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const bundles = await prisma.bundle.findMany({
      where: { isActive: true, items: { some: { productId } } },
      orderBy: { createdAt: 'desc' },
      include: bundleInclude
    });
    return res.status(200).json({
      bundles: bundles.map((b) => ({ ...b, pricing: priceBundle(b) }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving product bundles', error: error.message });
  }
};

// DELETE /api/bundles/:id  (SELLER)
export const deleteBundle = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await shopOf(req.user.id);
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const { id } = req.params;
    const bundle = await prisma.bundle.findUnique({ where: { id } });
    if (!bundle) return res.status(404).json({ message: 'Bundle not found' });
    if (bundle.shopId !== shop.id) return res.status(403).json({ message: 'You do not own this bundle' });

    await prisma.bundle.delete({ where: { id } });
    return res.status(200).json({ message: 'Bundle deleted' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting bundle', error: error.message });
  }
};
