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

    const { autoReplyText, autoReplyEnabled } = req.body;

    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop profile not found' });
    }

    const enabledBool = autoReplyEnabled === 'true' || autoReplyEnabled === true;

    const updatedShop = await prisma.shopProfile.update({
      where: { id: shop.id },
      data: {
        autoReplyText: autoReplyText !== undefined ? autoReplyText : shop.autoReplyText,
        autoReplyEnabled: autoReplyEnabled !== undefined ? enabledBool : shop.autoReplyEnabled
      }
    });

    return res.status(200).json({
      message: 'Shop settings updated successfully',
      shop: updatedShop
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating shop settings', error: error.message });
  }
};
