"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = exports.getOrderById = exports.getOrders = exports.createOrder = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const notificationService_1 = require("../services/notificationService");
// 1. Create Order (Checkout Cart)
const createOrder = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        if (req.user.role !== 'BUYER')
            return res.status(403).json({ message: 'Only buyers can place orders' });
        const { couponCode, addressId } = req.body;
        if (!addressId) {
            return res.status(400).json({ message: 'Delivery address is required' });
        }
        // Verify address
        const address = await prisma_1.default.address.findUnique({ where: { id: addressId } });
        if (!address || address.userId !== req.user.id) {
            return res.status(400).json({ message: 'Invalid or unauthorized delivery address' });
        }
        // Fetch buyer cart items
        const cartItems = await prisma_1.default.cartItem.findMany({
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
        const getActivePrice = (v) => {
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
        const shopPrices = {};
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
            const coupon = await prisma_1.default.coupon.findUnique({
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
            }
            else {
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
            }
            else if (coupon.discountType === 'FIXED') {
                discountAmount = coupon.discountValue;
            }
            finalTotal = Math.max(0, originalTotal - discountAmount);
            appliedCoupon = coupon;
        }
        // Execute order creation transaction
        const order = await prisma_1.default.$transaction(async (tx) => {
            // 1. Create Order record
            const newOrder = await tx.order.create({
                data: {
                    userId: req.user.id,
                    status: 'PENDING',
                    totalPrice: finalTotal,
                    couponId: appliedCoupon ? appliedCoupon.id : null,
                    addressId
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
                where: { userId: req.user.id }
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
        await (0, notificationService_1.createNotification)(req.user.id, 'Order Placed Successfully', `Your order #${order?.id.substring(0, 8)} has been placed. Total: $${finalTotal.toFixed(2)}`);
        // Send Seller Notifications (notify each shop whose items were bought)
        const uniqueShopIds = Array.from(new Set(cartItems.map((item) => item.variant.product.shopId)));
        for (const sId of uniqueShopIds) {
            const shopProfile = await prisma_1.default.shopProfile.findUnique({
                where: { id: sId },
                select: { userId: true, shopName: true }
            });
            if (shopProfile) {
                await (0, notificationService_1.createNotification)(shopProfile.userId, 'New Order Received', `You received a new order for items in your shop "${shopProfile.shopName}".`);
            }
        }
        return res.status(201).json({
            message: 'Order created successfully',
            order
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error checking out', error: error.message });
    }
};
exports.createOrder = createOrder;
// 2. Get Orders List
const getOrders = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        let orders;
        if (req.user.role === 'ADMIN') {
            // Admins see all orders
            orders = await prisma_1.default.order.findMany({
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    address: true,
                    items: { include: { variant: { include: { product: true } } } }
                },
                orderBy: { createdAt: 'desc' }
            });
        }
        else if (req.user.role === 'SELLER') {
            // Sellers see orders containing their products
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop)
                return res.status(404).json({ message: 'Shop profile not found' });
            // Find order items belonging to this shop
            const orderItems = await prisma_1.default.orderItem.findMany({
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
            const orderMap = {};
            orderItems.forEach((item) => {
                if (!orderMap[item.orderId]) {
                    const { order, ...itemData } = item;
                    orderMap[item.orderId] = {
                        ...order,
                        items: [itemData]
                    };
                }
                else {
                    const { order, ...itemData } = item;
                    orderMap[item.orderId].items.push(itemData);
                }
            });
            orders = Object.values(orderMap);
        }
        else {
            // Buyers see their own orders
            orders = await prisma_1.default.order.findMany({
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving orders', error: error.message });
    }
};
exports.getOrders = getOrders;
// 3. Get Order Details
const getOrderById = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const order = await prisma_1.default.order.findUnique({
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
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop)
                return res.status(404).json({ message: 'Shop profile not found' });
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving order', error: error.message });
    }
};
exports.getOrderById = getOrderById;
// 4. Update Order Status (Seller or Admin)
const updateOrderStatus = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const { status } = req.body;
        const allowedStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value. Must be PENDING, PROCESSING, SHIPPED, DELIVERED, or CANCELLED' });
        }
        const order = await prisma_1.default.order.findUnique({
            where: { id },
            include: { items: true }
        });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        // Role checks
        if (req.user.role === 'SELLER') {
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop)
                return res.status(404).json({ message: 'Shop profile not found' });
            // Verify that order has items from their shop
            const hasShopItem = order.items.some((item) => item.shopId === shop.id);
            if (!hasShopItem) {
                return res.status(403).json({ message: 'Forbidden: Access denied' });
            }
        }
        const updatedOrder = await prisma_1.default.order.update({
            where: { id },
            data: { status }
        });
        // Notify Buyer
        await (0, notificationService_1.createNotification)(order.userId, 'Order Status Updated', `Your order #${order.id.substring(0, 8)} status is now: ${status}`);
        return res.status(200).json({
            message: 'Order status updated successfully',
            order: updatedOrder
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
};
exports.updateOrderStatus = updateOrderStatus;
