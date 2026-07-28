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
        product: {
          select: { id: true, name: true }
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
      if (!productSalesCount[item.productId]) {
        productSalesCount[item.productId] = {
          name: item.product.name,
          quantity: item.quantity,
          revenue: itemRevenue
        };
      } else {
        productSalesCount[item.productId].quantity += item.quantity;
        productSalesCount[item.productId].revenue += itemRevenue;
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

    return res.status(200).json({
      analytics: {
        shopName: shop.shopName,
        totalRevenue,
        totalItemsSold,
        averageRating,
        reviewCount: reviews.length,
        topProducts,
        monthlyBreakdown
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving analytics', error: error.message });
  }
};
