import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Get Seller Shop Analytics
export const getSellerAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // Verify shop exists
    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop profile not found' });
    }

    // Fetch order items belonging to this shop (excluding cancelled orders)
    const sales = await prisma.orderItem.findMany({
      where: {
        shopId: shop.id,
        order: {
          status: { not: 'CANCELLED' }
        }
      },
      include: {
        order: {
          select: { createdAt: true }
        },
        variant: {
          include: {
            product: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    // 1. Total revenue & total items sold
    let totalRevenue = 0;
    let totalItemsSold = 0;
    const productSalesCount: Record<string, { name: string; quantity: number; revenue: number }> = {};

    sales.forEach((item) => {
      const itemRevenue = item.price * item.quantity;
      totalRevenue += itemRevenue;
      totalItemsSold += item.quantity;

      // Group for top products
      const product = item.variant.product;
      if (!productSalesCount[product.id]) {
        productSalesCount[product.id] = {
          name: product.name,
          quantity: item.quantity,
          revenue: itemRevenue
        };
      } else {
        productSalesCount[product.id].quantity += item.quantity;
        productSalesCount[product.id].revenue += itemRevenue;
      }
    });

    // 2. Average rating of products in this shop
    const reviews = await prisma.review.findMany({
      where: {
        product: { shopId: shop.id }
      },
      select: { rating: true }
    });

    const averageRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    // 3. Top selling products
    const topProducts = Object.entries(productSalesCount)
      .map(([id, info]) => ({
        id,
        name: info.name,
        quantitySold: info.quantity,
        revenueGenerated: info.revenue
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);

    // 4. Monthly revenue breakdown (last 6 months)
    const monthlyBreakdown: Record<string, number> = {};
    sales.forEach((item) => {
      const date = new Date(item.order.createdAt);
      // E.g. "2026-07"
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + (item.price * item.quantity);
    });

    // 5. Order status breakdown (for this shop's orders)
    const shopOrders = await prisma.orderItem.findMany({
      where: { shopId: shop.id },
      select: { order: { select: { id: true, status: true } } },
      distinct: ['orderId']
    });
    const orderStatusBreakdown: Record<string, number> = {};
    shopOrders.forEach((item) => {
      const status = item.order.status;
      orderStatusBreakdown[status] = (orderStatusBreakdown[status] || 0) + 1;
    });

    return res.status(200).json({
      analytics: {
        shopName: shop.shopName,
        totalRevenue,
        totalItemsSold,
        averageRating,
        reviewCount: reviews.length,
        topProducts,
        monthlyBreakdown,
        orderStatusBreakdown
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving analytics', error: error.message });
  }
};

// Get Platform-Wide Analytics (Admin Only)
export const getAdminAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // Non-cancelled order items power revenue/product numbers
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { status: { not: 'CANCELLED' } }
      },
      include: {
        order: { select: { createdAt: true } },
        shop: { select: { id: true, shopName: true } },
        variant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        }
      }
    });

    let totalRevenue = 0;
    let totalItemsSold = 0;
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    const shopSales: Record<string, { name: string; revenue: number }> = {};
    const dailyRevenue: Record<string, number> = {};

    orderItems.forEach((item) => {
      const itemRevenue = item.price * item.quantity;
      totalRevenue += itemRevenue;
      totalItemsSold += item.quantity;

      const product = item.variant.product;
      if (!productSales[product.id]) {
        productSales[product.id] = { name: product.name, quantity: item.quantity, revenue: itemRevenue };
      } else {
        productSales[product.id].quantity += item.quantity;
        productSales[product.id].revenue += itemRevenue;
      }

      const shop = item.shop;
      if (!shopSales[shop.id]) {
        shopSales[shop.id] = { name: shop.shopName, revenue: itemRevenue };
      } else {
        shopSales[shop.id].revenue += itemRevenue;
      }

      const dayKey = item.order.createdAt.toISOString().slice(0, 10); // "2026-07-30"
      dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + itemRevenue;
    });

    const topProducts = Object.entries(productSales)
      .map(([id, info]) => ({ id, name: info.name, quantitySold: info.quantity, revenueGenerated: info.revenue }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5);

    const topSellers = Object.entries(shopSales)
      .map(([id, info]) => ({ id, shopName: info.name, revenue: info.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Order status breakdown across the whole platform
    const allOrders = await prisma.order.findMany({ select: { status: true } });
    const orderStatusBreakdown: Record<string, number> = {};
    allOrders.forEach((o) => {
      orderStatusBreakdown[o.status] = (orderStatusBreakdown[o.status] || 0) + 1;
    });

    const [totalUsers, totalBuyers, totalSellers, totalProducts, totalShops] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'BUYER' } }),
      prisma.user.count({ where: { role: 'SELLER' } }),
      prisma.product.count(),
      prisma.shopProfile.count()
    ]);

    return res.status(200).json({
      analytics: {
        totalRevenue,
        totalItemsSold,
        totalOrders: allOrders.length,
        totalUsers,
        totalBuyers,
        totalSellers,
        totalProducts,
        totalShops,
        topProducts,
        topSellers,
        orderStatusBreakdown,
        dailyRevenue // last N days present in the data, e.g. { "2026-07-30": 152.5 }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving admin analytics', error: error.message });
  }
};
