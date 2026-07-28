import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// 1. Get Cart Items (Buyer Only)
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: {
        variant: {
          include: {
            color: true,
            product: {
              include: {
                images: true,
                shop: {
                  select: {
                    id: true,
                    shopName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return res.status(200).json({ cartItems });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving cart', error: error.message });
  }
};

// 2. Add Item to Cart (Buyer Only)
export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { productId, variantId, quantity } = req.body;
    const qty = parseInt(quantity) || 1;

    let targetVariantId = variantId;

    // Backwards-compatibility: if productId is sent instead of variantId, find the first variant
    if (!targetVariantId && productId) {
      const defaultVariant = await prisma.productVariant.findFirst({
        where: { productId }
      });
      if (!defaultVariant) {
        return res.status(404).json({ message: 'Product or its variants not found' });
      }
      targetVariantId = defaultVariant.id;
    }

    if (!targetVariantId) {
      return res.status(400).json({ message: 'Either variantId or productId is required' });
    }

    // Check if variant exists and has stock
    const variant = await prisma.productVariant.findUnique({
      where: { id: targetVariantId },
      include: { product: true }
    });

    if (!variant) {
      return res.status(404).json({ message: 'Product variant not found' });
    }

    if (variant.stockQuantity < qty) {
      return res.status(400).json({ message: `Insufficient stock for variant. Only ${variant.stockQuantity} available.` });
    }

    // Check if item already in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        userId: req.user.id,
        variantId: targetVariantId
      }
    });

    let cartItem;
    if (existingItem) {
      // Update quantity
      const newQty = existingItem.quantity + qty;
      if (variant.stockQuantity < newQty) {
        return res.status(400).json({ message: `Insufficient stock for the requested quantity. Total in cart would exceed stock.` });
      }

      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty },
        include: {
          variant: {
            include: { product: true }
          }
        }
      });
    } else {
      // Create new cart item
      cartItem = await prisma.cartItem.create({
        data: {
          userId: req.user.id,
          variantId: targetVariantId,
          quantity: qty
        },
        include: {
          variant: {
            include: { product: true }
          }
        }
      });
    }

    return res.status(200).json({
      message: 'Item added to cart successfully',
      cartItem
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding to cart', error: error.message });
  }
};

// 3. Update Cart Item Quantity (Buyer Only)
export const updateCartItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { quantity } = req.body;

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive integer' });
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id },
      include: {
        variant: true
      }
    });

    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (cartItem.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this cart item' });
    }

    // Check stock of the variant
    if (cartItem.variant.stockQuantity < qty) {
      return res.status(400).json({ message: `Insufficient stock for variant. Only ${cartItem.variant.stockQuantity} available.` });
    }

    const updatedItem = await prisma.cartItem.update({
      where: { id },
      data: { quantity: qty },
      include: {
        variant: {
          include: { product: true }
        }
      }
    });

    return res.status(200).json({
      message: 'Cart updated successfully',
      cartItem: updatedItem
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating cart', error: error.message });
  }
};

// 4. Remove Item from Cart (Buyer Only)
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id }
    });

    if (!cartItem) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    if (cartItem.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this cart item' });
    }

    await prisma.cartItem.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Item removed from cart successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing from cart', error: error.message });
  }
};
