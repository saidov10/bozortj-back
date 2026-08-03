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

    // 6. Traffic & conversion, low stock, and "viewed but not selling" — drawn
    // from this shop's product catalog. viewCount is the total product-page views.
    const shopProducts = await prisma.product.findMany({
      where: { shopId: shop.id },
      select: {
        id: true,
        name: true,
        viewCount: true,
        stockQuantity: true,
        lowStockThreshold: true,
        isPromoted: true,
        promotedUntil: true
      }
    });

    const totalViews = shopProducts.reduce((sum, p) => sum + p.viewCount, 0);
    // Conversion = units sold / product-page views (as a percentage).
    const conversionRate = totalViews > 0 ? +((totalItemsSold / totalViews) * 100).toFixed(2) : 0;

    const lowStockProducts = shopProducts
      .filter((p) => p.stockQuantity <= p.lowStockThreshold)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, threshold: p.lowStockThreshold }))
      .sort((a, b) => a.stock - b.stock);

    // Products getting attention but no sales — prime candidates for a price cut,
    // better photos, or a promotion.
    const now = Date.now();
    const viewedNotSold = shopProducts
      .filter((p) => p.viewCount > 0 && !productSalesCount[p.id])
      .map((p) => ({ id: p.id, name: p.name, views: p.viewCount }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const activePromotions = shopProducts.filter(
      (p) => p.isPromoted && p.promotedUntil != null && new Date(p.promotedUntil).getTime() > now
    ).length;

    return res.status(200).json({
      analytics: {
        shopName: shop.shopName,
        totalRevenue,
        totalItemsSold,
        averageRating,
        reviewCount: reviews.length,
        topProducts,
        monthlyBreakdown,
        orderStatusBreakdown,
        totalViews,
        conversionRate,
        lowStockProducts,
        viewedNotSold,
        activePromotions,
        productCount: shopProducts.length
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving analytics', error: error.message });
  }
};

// Sales heatmap (Seller) — GET /api/analytics/heatmap
// Returns a day-of-week × hour grid of order activity, so the seller knows when
// buyers are active (best time to launch a flash sale or be online).
export const getSalesHeatmap = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const items = await prisma.orderItem.findMany({
      where: { shopId: shop.id, order: { status: { not: 'CANCELLED' } } },
      select: { quantity: true, price: true, order: { select: { createdAt: true } } }
    });

    // grid[day][hour] = order-line count; also track revenue per cell.
    const counts: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const revenue: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

    let peak = { day: 0, hour: 0, count: 0 };
    items.forEach((it) => {
      const d = new Date(it.order.createdAt);
      const day = d.getDay(); // 0=Sunday
      const hour = d.getHours();
      counts[day][hour] += 1;
      revenue[day][hour] += it.price * it.quantity;
      if (counts[day][hour] > peak.count) peak = { day, hour, count: counts[day][hour] };
    });

    return res.status(200).json({
      // dayLabels[0] === Sunday to match JS getDay()
      dayLabels: ['Якшанбе', 'Душанбе', 'Сешанбе', 'Чоршанбе', 'Панҷшанбе', 'Ҷумъа', 'Шанбе'],
      counts,
      revenue: revenue.map((row) => row.map((v) => +v.toFixed(2))),
      peak
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving heatmap', error: error.message });
  }
};

// Seller dashboard timeseries (Seller) — GET /api/analytics/dashboard
// A 30-day daily series (orders / units / revenue) plus period KPIs, growth vs the
// prior 30 days, and quick action counts — everything a home dashboard chart needs.
export const getSellerDashboard = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const since = new Date(now.getTime() - 60 * dayMs); // pull 60 days to compare periods

    const items = await prisma.orderItem.findMany({
      where: { shopId: shop.id, order: { status: { not: 'CANCELLED' }, createdAt: { gte: since } } },
      select: { quantity: true, price: true, orderId: true, order: { select: { createdAt: true } } }
    });

    // Build a 30-day daily series (oldest → newest).
    const series: { date: string; orders: number; units: number; revenue: number }[] = [];
    const dayIndex = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      dayIndex.set(key, series.length);
      series.push({ date: key, orders: 0, units: 0, revenue: 0 });
    }
    const ordersPerDay: Record<string, Set<string>> = {};

    // Period accumulators.
    let rev30 = 0, rev30prev = 0;
    let units30 = 0;
    const orders30 = new Set<string>();
    const orders30prev = new Set<string>();
    let revToday = 0, rev7 = 0;
    const ordersToday = new Set<string>();
    const orders7 = new Set<string>();
    const startToday = new Date(now.toISOString().slice(0, 10)).getTime();
    const start7 = now.getTime() - 7 * dayMs;
    const start30 = now.getTime() - 30 * dayMs;
    const start60 = now.getTime() - 60 * dayMs;

    items.forEach((it) => {
      const created = new Date(it.order.createdAt);
      const t = created.getTime();
      const rev = it.price * it.quantity;
      const key = created.toISOString().slice(0, 10);

      if (dayIndex.has(key)) {
        const row = series[dayIndex.get(key)!];
        row.units += it.quantity;
        row.revenue = +(row.revenue + rev).toFixed(2);
        (ordersPerDay[key] ||= new Set()).add(it.orderId);
      }
      if (t >= start30) { rev30 += rev; units30 += it.quantity; orders30.add(it.orderId); }
      else if (t >= start60) { rev30prev += rev; orders30prev.add(it.orderId); }
      if (t >= startToday) { revToday += rev; ordersToday.add(it.orderId); }
      if (t >= start7) { rev7 += rev; orders7.add(it.orderId); }
    });

    // Fill per-day order counts.
    Object.entries(ordersPerDay).forEach(([key, set]) => {
      const idx = dayIndex.get(key);
      if (idx != null) series[idx].orders = set.size;
    });

    const growth = (cur: number, prev: number): number | null =>
      prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : cur > 0 ? 100 : null;

    // Quick action counts.
    const [pendingOrders, unansweredQuestions, lowStock] = await Promise.all([
      prisma.orderItem.findMany({
        where: { shopId: shop.id, order: { status: 'PENDING' } },
        select: { orderId: true },
        distinct: ['orderId']
      }),
      prisma.productQuestion.count({ where: { product: { shopId: shop.id }, answer: null } }),
      prisma.product.count({ where: { shopId: shop.id, stockQuantity: { lte: 5 } } })
    ]);

    return res.status(200).json({
      series,
      kpis: {
        today: { revenue: +revToday.toFixed(2), orders: ordersToday.size },
        last7Days: { revenue: +rev7.toFixed(2), orders: orders7.size },
        last30Days: { revenue: +rev30.toFixed(2), orders: orders30.size, units: units30 },
        revenueGrowthPercent: growth(rev30, rev30prev),
        ordersGrowthPercent: growth(orders30.size, orders30prev.size)
      },
      actions: {
        pendingOrders: pendingOrders.length,
        unansweredQuestions,
        lowStockProducts: lowStock
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving dashboard', error: error.message });
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
