import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// 1. Get Wishlist Items (Buyer Only)
export const getWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { userId: req.user.id },
      include: {
        product: {
          include: {
            images: true,
            category: true,
            subcategory: true,
            brand: true,
            color: true,
            variants: {
              include: { color: true }
            },
            shop: {
              select: {
                id: true,
                shopName: true
              }
            },
            reviews: {
              select: {
                rating: true
              }
            }
          }
        }
      }
    });

    const wishlist = wishlistItems.map((item) => {
      const reviewCount = item.product.reviews.length;
      const averageRating =
        reviewCount > 0
          ? item.product.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
          : 0;

      const { reviews, ...productData } = item.product;

      return {
        id: item.id,
        product: {
          ...productData,
          averageRating,
          reviewCount
        }
      };
    });

    return res.status(200).json({ wishlist });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving wishlist', error: error.message });
  }
};

// 2. Add Item to Wishlist (Buyer Only)
export const addToWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { productId } = req.body;

    // Check if product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if item already in wishlist
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: req.user.id,
          productId
        }
      }
    });

    if (existingItem) {
      return res.status(400).json({ message: 'Product is already in your wishlist' });
    }

    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        userId: req.user.id,
        productId
      },
      include: { product: true }
    });

    return res.status(200).json({
      message: 'Product added to wishlist successfully',
      wishlistItem
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding to wishlist', error: error.message });
  }
};

// 3. Remove Item from Wishlist (Buyer Only)
export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: { id }
    });

    if (!wishlistItem) {
      return res.status(404).json({ message: 'Wishlist item not found' });
    }

    if (wishlistItem.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this wishlist item' });
    }

    await prisma.wishlistItem.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Product removed from wishlist successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing from wishlist', error: error.message });
  }
};
