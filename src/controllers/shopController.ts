import { Request, Response } from 'express';
import prisma from '../config/prisma';

// 1. Get all shops with optional search
export const getShops = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;

    const where: any = {};
    if (search) {
      where.OR = [
        { shopName: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    const shops = await prisma.shopProfile.findMany({
      where,
      include: {
        category: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            avatarUrl: true
          }
        }
      }
    });

    return res.status(200).json({ shops });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving shops', error: error.message });
  }
};

// 2. Get shop details and its products
export const getShopById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const shop = await prisma.shopProfile.findUnique({
      where: { id },
      include: {
        category: true,
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            avatarUrl: true
          }
        },
        products: {
          include: {
            images: true,
            category: true,
            brand: true
          }
        }
      }
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    return res.status(200).json({ shop });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving shop details', error: error.message });
  }
};

// 3. Update shop settings (Auto-Reply etc.) - Seller Only
export const updateShopSettings = async (req: any, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'SELLER') return res.status(403).json({ message: 'Only sellers can modify shop settings' });

    const {
      autoReplyText, autoReplyEnabled, deliveryFee, freeDeliveryThreshold,
      allowPickup, pickupAddress, installmentEnabled, installmentMonths
    } = req.body;

    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop profile not found' });
    }

    const enabledBool = autoReplyEnabled === 'true' || autoReplyEnabled === true;

    // Delivery fee (seller-defined). Empty string / null clears the free-delivery
    // threshold. Negative values are rejected.
    let deliveryFeeVal = shop.deliveryFee;
    if (deliveryFee !== undefined) {
      const parsed = parseFloat(deliveryFee);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'deliveryFee must be a non-negative number' });
      }
      deliveryFeeVal = parsed;
    }

    let thresholdVal = shop.freeDeliveryThreshold;
    if (freeDeliveryThreshold !== undefined) {
      if (freeDeliveryThreshold === null || freeDeliveryThreshold === '') {
        thresholdVal = null;
      } else {
        const parsed = parseFloat(freeDeliveryThreshold);
        if (isNaN(parsed) || parsed < 0) {
          return res.status(400).json({ message: 'freeDeliveryThreshold must be a non-negative number' });
        }
        thresholdVal = parsed;
      }
    }

    // Self-pickup settings.
    const dataPatch: any = {
      autoReplyText: autoReplyText !== undefined ? autoReplyText : shop.autoReplyText,
      autoReplyEnabled: autoReplyEnabled !== undefined ? enabledBool : shop.autoReplyEnabled,
      deliveryFee: deliveryFeeVal,
      freeDeliveryThreshold: thresholdVal
    };
    if (allowPickup !== undefined) dataPatch.allowPickup = allowPickup === 'true' || allowPickup === true;
    if (pickupAddress !== undefined) dataPatch.pickupAddress = pickupAddress || null;

    // Installments (насия): enable/disable and the list of month plans offered.
    if (installmentEnabled !== undefined) {
      dataPatch.installmentEnabled = installmentEnabled === 'true' || installmentEnabled === true;
    }
    if (installmentMonths !== undefined) {
      let months: number[] = [];
      if (Array.isArray(installmentMonths)) {
        months = installmentMonths.map((m: any) => parseInt(m)).filter((m: number) => !isNaN(m) && m >= 2);
      } else if (typeof installmentMonths === 'string' && installmentMonths.trim() !== '') {
        months = installmentMonths.split(',').map((m) => parseInt(m.trim())).filter((m) => !isNaN(m) && m >= 2);
      }
      dataPatch.installmentMonths = Array.from(new Set(months));
    }

    const updatedShop = await prisma.shopProfile.update({
      where: { id: shop.id },
      data: dataPatch
    });

    return res.status(200).json({
      message: 'Shop settings updated successfully',
      shop: updatedShop
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating shop settings', error: error.message });
  }
};
