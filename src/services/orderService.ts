import prisma from '../config/prisma';
import { createNotification } from './notificationService';
import { broadcastOrderStatus } from './chatSocket';
import { ServiceError } from '../utils/serviceError';

// Order helpers shared by the Telegram bot (advance status from a button, daily
// summaries, buyer order list). The REST controller keeps its own copy of the
// status-update flow; this mirrors its authorization rules.

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

// Seller moves an order to the next status straight from Telegram.
export const sellerAdvanceOrderStatus = async (
  orderId: string,
  sellerUserId: string,
  status: string
): Promise<{ status: string; shortId: string }> => {
  if (!ALLOWED_STATUSES.includes(status)) throw new ServiceError(400, 'Invalid status');

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new ServiceError(404, 'Order not found');

  const shop = await prisma.shopProfile.findUnique({ where: { userId: sellerUserId } });
  if (!shop) throw new ServiceError(403, 'Shop profile not found');
  if (!order.items.some((i) => i.shopId === shop.id)) {
    throw new ServiceError(403, 'This order has no items from your shop');
  }

  await prisma.order.update({ where: { id: orderId }, data: { status } });
  await prisma.orderStatusHistory.create({
    data: { orderId, status, note: 'Updated via Telegram' }
  });

  await createNotification(
    order.userId,
    'Order Status Updated',
    `Your order #${orderId.substring(0, 8)} status is now: ${status}`,
    { type: 'ORDER_STATUS', orderId, status }
  );
  broadcastOrderStatus(order.userId, { orderId, status, note: 'Updated via Telegram' });

  return { status, shortId: orderId.substring(0, 8) };
};

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Daily summary for a seller (used by /today command and the daily push job).
export const getSellerDailySummary = async (sellerUserId: string) => {
  const shop = await prisma.shopProfile.findUnique({ where: { userId: sellerUserId } });
  if (!shop) throw new ServiceError(403, 'Shop profile not found');

  const todayStart = startOfToday();

  const [itemsToday, pendingOffers, pendingQuestions] = await Promise.all([
    prisma.orderItem.findMany({
      where: { shopId: shop.id, order: { createdAt: { gte: todayStart } } },
      select: { price: true, quantity: true }
    }),
    prisma.priceOffer.count({ where: { shopId: shop.id, status: 'PENDING' } }),
    prisma.productQuestion.count({ where: { product: { shopId: shop.id }, answer: null } })
  ]);

  const revenue = +itemsToday.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2);

  return {
    shopName: shop.shopName,
    ordersItemsToday: itemsToday.length,
    revenueToday: revenue,
    pendingOffers,
    pendingQuestions
  };
};

// Recent orders for a buyer (used by /orders command).
export const getBuyerRecentOrders = async (buyerUserId: string) => {
  return prisma.order.findMany({
    where: { userId: buyerUserId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, totalPrice: true, createdAt: true }
  });
};
