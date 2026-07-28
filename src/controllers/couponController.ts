import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// 1. Get Coupons
export const getCoupons = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    let coupons;

    if (req.user.role === 'SELLER') {
      // Find shop
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

      // Sellers see their own coupons and global coupons (null shopId)
      coupons = await prisma.coupon.findMany({
        where: {
          OR: [
            { shopId: shop.id },
            { shopId: null }
          ]
        }
      });
    } else {
      // Buyers and Admins see all coupons
      coupons = await prisma.coupon.findMany({
        include: {
          shop: {
            select: { shopName: true }
          }
        }
      });
    }

    return res.status(200).json({ coupons });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error fetching coupons', error: error.message });
  }
};

// 2. Create Coupon
export const createCoupon = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { code, discountType, discountValue, minPurchase, maxUsage, expiryDate } = req.body;

    if (!code || !discountType || !discountValue) {
      return res.status(400).json({ message: 'Code, discountType, and discountValue are required' });
    }

    if (discountType !== 'PERCENT' && discountType !== 'FIXED') {
      return res.status(400).json({ message: 'discountType must be PERCENT or FIXED' });
    }

    // Check if code already exists
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    let shopId: string | null = null;
    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(403).json({ message: 'Only sellers with shop profiles can create coupons' });
      shopId = shop.id;
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        discountType,
        discountValue: parseFloat(discountValue),
        minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
        maxUsage: maxUsage ? parseInt(maxUsage) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        shopId
      }
    });

    return res.status(201).json({ message: 'Coupon created successfully', coupon });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating coupon', error: error.message });
  }
};

// 3. Delete Coupon
export const deleteCoupon = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    // Auth validation
    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop || coupon.shopId !== shop.id) {
        return res.status(403).json({ message: 'You do not have permission to delete this coupon' });
      }
    }

    await prisma.coupon.delete({ where: { id } });
    return res.status(200).json({ message: 'Coupon deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting coupon', error: error.message });
  }
};
