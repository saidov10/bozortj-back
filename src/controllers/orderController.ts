import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { broadcastStockUpdate, broadcastOrderStatus, broadcastFlashSaleUpdate } from '../services/chatSocket';
import { buildOrderButtons } from '../services/telegramService';

// 1. Create Order (Checkout Cart)
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'BUYER') return res.status(403).json({ message: 'Only buyers can place orders' });

    const { couponCode, addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ message: 'Delivery address is required' });
    }

    // Verify address
    const address = await prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== req.user.id) {
      return res.status(400).json({ message: 'Invalid or unauthorized delivery address' });
    }

    // Fetch buyer cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: {
        variant: {
          include: {
            product: true
          }
        }
      }
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ message: 'Your shopping cart is empty' });
    }

    // Helper to resolve active price for variant
    const getActivePrice = (v: any) => {
      const isOnDiscount = v.product.isOnDiscount;
      const basePrice = v.price !== null ? v.price : v.product.price;
      const discountPrice = v.discountPrice !== null ? v.discountPrice : v.product.discountPrice;
      
      if (isOnDiscount && discountPrice !== null) {
        return discountPrice;
      }
      return basePrice;
    };

    // Verify stock availability
    for (const item of cartItems) {
      if (item.variant.stockQuantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product "${item.variant.product.name}" (Size: ${item.variant.size}). Only ${item.variant.stockQuantity} items left.`
        });
      }
    }

    // Calculate prices
    let originalTotal = 0;
    const shopPrices: Record<string, number> = {};

    cartItems.forEach((item) => {
      const activePrice = getActivePrice(item.variant);
      const itemTotal = activePrice * item.quantity;
      originalTotal += itemTotal;

      const shopId = item.variant.product.shopId;
      shopPrices[shopId] = (shopPrices[shopId] || 0) + itemTotal;
    });

    let finalTotal = originalTotal;
    let appliedCoupon = null;

    // Apply Coupon if provided
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase().trim() }
      });

      if (!coupon) {
        return res.status(400).json({ message: 'Invalid coupon code' });
      }

      // Check Expiry Date
      if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
        return res.status(400).json({ message: 'Coupon code has expired' });
      }

      // Check Max Usage Limit
      if (coupon.maxUsage !== null && coupon.usedCount >= coupon.maxUsage) {
        return res.status(400).json({ message: 'Coupon usage limit reached' });
      }

      // Buyer-locked coupon (e.g. an accepted price offer): only the assigned
      // buyer may redeem it.
      if (coupon.assignedUserId && coupon.assignedUserId !== req.user.id) {
        return res.status(400).json({ message: 'This coupon is not valid for your account' });
      }

      // Check Shop Restriction & Min Purchase
      let discountBasePrice = originalTotal;
      if (coupon.shopId) {
        const shopTotal = shopPrices[coupon.shopId] || 0;
        if (shopTotal < coupon.minPurchase) {
          return res.status(400).json({
            message: `Minimum purchase of $${coupon.minPurchase} from the specific shop is required to use this coupon`
          });
        }
        discountBasePrice = shopTotal;
      } else {
        if (originalTotal < coupon.minPurchase) {
          return res.status(400).json({
            message: `Minimum order value of $${coupon.minPurchase} is required to use this coupon`
          });
        }
      }

      // Calculate Discount Value
      let discountAmount = 0;
      if (coupon.discountType === 'PERCENT') {
        discountAmount = discountBasePrice * (coupon.discountValue / 100);
      } else if (coupon.discountType === 'FIXED') {
        discountAmount = coupon.discountValue;
      }

      finalTotal = Math.max(0, originalTotal - discountAmount);
      appliedCoupon = coupon;
    }

    // Delivery fee: each shop sets its own flat fee, waived when that shop's
    // subtotal reaches its free-delivery threshold. Charged on top of the
    // (possibly discounted) product total.
    let deliveryTotal = 0;
    const shopIds = Object.keys(shopPrices);
    if (shopIds.length > 0) {
      const shops = await prisma.shopProfile.findMany({
        where: { id: { in: shopIds } },
        select: { id: true, deliveryFee: true, freeDeliveryThreshold: true }
      });
      for (const shop of shops) {
        const subtotal = shopPrices[shop.id] || 0;
        const qualifiesFree =
          shop.freeDeliveryThreshold != null && subtotal >= shop.freeDeliveryThreshold;
        if (!qualifiesFree) deliveryTotal += shop.deliveryFee;
      }
    }
    deliveryTotal = +deliveryTotal.toFixed(2);
    finalTotal = +(finalTotal + deliveryTotal).toFixed(2);

    // Execute order creation transaction
    const order = await prisma.$transaction(async (tx) => {
      // 1. Create Order record
      const newOrder = await tx.order.create({
        data: {
          userId: req.user!.id,
          status: 'PENDING',
          totalPrice: finalTotal,
          deliveryFee: deliveryTotal,
          couponId: appliedCoupon ? appliedCoupon.id : null,
          addressId
        }
      });

      // Record initial status in the tracking timeline
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          status: 'PENDING',
          note: 'Order placed'
        }
      });

      // 2. Create Order Items & decrease stocks
      for (const item of cartItems) {
        const activePrice = getActivePrice(item.variant);

        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            variantId: item.variantId,
            quantity: item.quantity,
            price: activePrice,
            shopId: item.variant.product.shopId
          }
        });

        // Update product variant stock
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQuantity: {
              decrement: item.quantity
            }
          }
        });

        // Update parent product stock
        await tx.product.update({
          where: { id: item.variant.productId },
          data: {
            stockQuantity: {
              decrement: item.quantity
            }
          }
        });
      }

      // 3. Increment coupon usage if applied
      if (appliedCoupon) {
        await tx.coupon.update({
          where: { id: appliedCoupon.id },
          data: {
            usedCount: {
              increment: 1
            }
          }
        });
      }

      // 4. Clear Cart
      await tx.cartItem.deleteMany({
        where: { userId: req.user!.id }
      });

      return tx.order.findUnique({
        where: { id: newOrder.id },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    select: { name: true, images: true }
                  }
                }
              }
            }
          }
        }
      });
    });

    // Send Buyer In-App Notification
    await createNotification(
      req.user.id,
      'Order Placed Successfully',
      `Your order #${order?.id.substring(0, 8)} has been placed. Total: $${finalTotal.toFixed(2)}`
    );

    // Send Seller Notifications (notify each shop whose items were bought)
    const uniqueShopIds = Array.from(new Set(cartItems.map((item) => item.variant.product.shopId)));
    for (const sId of uniqueShopIds) {
      const shopProfile = await prisma.shopProfile.findUnique({
        where: { id: sId },
        select: { userId: true, shopName: true }
      });
      if (shopProfile) {
        await createNotification(
          shopProfile.userId,
          'New Order Received',
          `You received a new order for items in your shop "${shopProfile.shopName}".`,
          { type: 'NEW_ORDER', orderId: order?.id },
          order?.id ? { telegramButtons: buildOrderButtons(order.id) } : undefined
        );
      }
    }

    // Live stock broadcast: anyone currently viewing these products sees the
    // "Faqat N to monad!" counter update in real time, no refresh needed.
    cartItems.forEach((item) => {
      broadcastStockUpdate(item.variant.productId, {
        variantId: item.variantId,
        stockQuantity: item.variant.stockQuantity - item.quantity,
        productStockQuantity: item.variant.product.stockQuantity - item.quantity
      });
    });

    // Flash sale: bump the live "sold" counter for any active sale on the
    // bought products (best-effort, outside the critical path).
    try {
      const qtyByProduct: Record<string, number> = {};
      cartItems.forEach((item) => {
        qtyByProduct[item.variant.productId] =
          (qtyByProduct[item.variant.productId] || 0) + item.quantity;
      });
      const now = new Date();
      for (const [productId, qty] of Object.entries(qtyByProduct)) {
        const sale = await prisma.flashSale.findFirst({
          where: { productId, startsAt: { lte: now }, endsAt: { gt: now } }
        });
        if (sale) {
          const updated = await prisma.flashSale.update({
            where: { id: sale.id },
            data: { soldCount: { increment: qty } }
          });
          broadcastFlashSaleUpdate({
            flashSaleId: updated.id,
            productId,
            soldCount: updated.soldCount,
            stockLimit: updated.stockLimit
          });
        }
      }
    } catch (fsErr) {
      console.error('Flash sale counter update failed:', fsErr);
    }

    return res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error checking out', error: error.message });
  }
};

// 1b. Delivery quote for the buyer's current cart — lets the frontend show the
// delivery fee (per shop) before checkout. Mirrors the fee logic in createOrder.
export const getDeliveryQuote = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { variant: { include: { product: true } } }
    });

    const activePrice = (v: any) => {
      const base = v.price !== null ? v.price : v.product.price;
      const disc = v.discountPrice !== null ? v.discountPrice : v.product.discountPrice;
      return v.product.isOnDiscount && disc !== null ? disc : base;
    };

    const shopSubtotals: Record<string, number> = {};
    let productTotal = 0;
    for (const item of cartItems) {
      const line = activePrice(item.variant) * item.quantity;
      productTotal += line;
      const shopId = item.variant.product.shopId;
      shopSubtotals[shopId] = (shopSubtotals[shopId] || 0) + line;
    }

    const shopIds = Object.keys(shopSubtotals);
    const shops = shopIds.length
      ? await prisma.shopProfile.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, shopName: true, deliveryFee: true, freeDeliveryThreshold: true }
        })
      : [];

    let deliveryTotal = 0;
    const perShop = shops.map((shop) => {
      const subtotal = shopSubtotals[shop.id] || 0;
      const isFree = shop.freeDeliveryThreshold != null && subtotal >= shop.freeDeliveryThreshold;
      const fee = isFree ? 0 : shop.deliveryFee;
      deliveryTotal += fee;
      return {
        shopId: shop.id,
        shopName: shop.shopName,
        subtotal: +subtotal.toFixed(2),
        deliveryFee: +fee.toFixed(2),
        isFreeDelivery: isFree,
        freeDeliveryThreshold: shop.freeDeliveryThreshold
      };
    });

    deliveryTotal = +deliveryTotal.toFixed(2);
    productTotal = +productTotal.toFixed(2);

    return res.status(200).json({
      productTotal,
      deliveryTotal,
      grandTotal: +(productTotal + deliveryTotal).toFixed(2),
      perShop
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error computing delivery quote', error: error.message });
  }
};

// 2. Get Orders List
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    let orders;

    if (req.user.role === 'ADMIN') {
      // Admins see all orders
      orders = await prisma.order.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          address: true,
          items: { include: { variant: { include: { product: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (req.user.role === 'SELLER') {
      // Sellers see orders containing their products
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

      // Find order items belonging to this shop
      const orderItems = await prisma.orderItem.findMany({
        where: { shopId: shop.id },
        include: {
          order: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
          variant: { include: { product: true } }
        },
        orderBy: { order: { createdAt: 'desc' } }
      });

      // Group items by order to return clean order structures
      const orderMap: Record<string, any> = {};
      orderItems.forEach((item) => {
        if (!orderMap[item.orderId]) {
          const { order, ...itemData } = item;
          orderMap[item.orderId] = {
            ...order,
            items: [itemData]
          };
        } else {
          const { order, ...itemData } = item;
          orderMap[item.orderId].items.push(itemData);
        }
      });

      orders = Object.values(orderMap);
    } else {
      // Buyers see their own orders
      orders = await prisma.order.findMany({
        where: { userId: req.user.id },
        include: {
          address: true,
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, images: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return res.status(200).json({ orders });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving orders', error: error.message });
  }
};

// 3. Get Order Details
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        address: true,
        items: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, images: true } }
              }
            }
          }
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify ownership
    if (req.user.role === 'BUYER' && order.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }

    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

      // Verify that this order contains products from their shop
      const hasShopItem = order.items.some((item) => item.shopId === shop.id);
      if (!hasShopItem) {
        return res.status(403).json({ message: 'Forbidden: Access denied' });
      }

      // Filter out items that do not belong to this seller
      const sellerItems = order.items.filter((item) => item.shopId === shop.id);
      return res.status(200).json({
        order: {
          ...order,
          items: sellerItems
        }
      });
    }

    return res.status(200).json({ order });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving order', error: error.message });
  }
};

// 4. Update Order Status (Seller or Admin)
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value. Must be PENDING, PROCESSING, SHIPPED, DELIVERED, or CANCELLED' });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Role checks
    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

      // Verify that order has items from their shop
      const hasShopItem = order.items.some((item) => item.shopId === shop.id);
      if (!hasShopItem) {
        return res.status(403).json({ message: 'Forbidden: Access denied' });
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status }
    });

    // Record status change in the tracking timeline
    await prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        status,
        note: note || null
      }
    });

    // Notify Buyer
    await createNotification(
      order.userId,
      'Order Status Updated',
      `Your order #${order.id.substring(0, 8)} status is now: ${status}`,
      { type: 'ORDER_STATUS', orderId: order.id, status }
    );

    // Live-update the buyer's order-tracking timeline page, no refresh needed
    broadcastOrderStatus(order.userId, { orderId: order.id, status, note: note || null });

    return res.status(200).json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating order status', error: error.message });
  }
};

// 5. Get Order Tracking Timeline (Buyer/Seller/Admin)
export const getOrderTimeline = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { select: { shopId: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify ownership (same rules as getOrderById)
    if (req.user.role === 'BUYER' && order.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: Access denied' });
    }

    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({
        where: { userId: req.user.id }
      });
      if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

      const hasShopItem = order.items.some((item) => item.shopId === shop.id);
      if (!hasShopItem) {
        return res.status(403).json({ message: 'Forbidden: Access denied' });
      }
    }

    const allStages = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    const isCancelled = order.status === 'CANCELLED';

    return res.status(200).json({
      orderId: order.id,
      currentStatus: order.status,
      isCancelled,
      stages: isCancelled ? ['CANCELLED'] : allStages,
      history: order.statusHistory.map((h) => ({
        status: h.status,
        note: h.note,
        createdAt: h.createdAt
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving order timeline', error: error.message });
  }
};
