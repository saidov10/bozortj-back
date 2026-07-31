import prisma from '../config/prisma';
import { createNotification } from './notificationService';

// Fan-out helpers for follow / back-in-stock features. Kept separate from the
// controllers so both REST handlers and background jobs can reuse them.

// Notify everyone following a shop (new product, flash sale, etc.).
export const notifyShopFollowers = async (
  shopId: string,
  title: string,
  content: string,
  meta?: Record<string, any>
): Promise<void> => {
  try {
    const followers = await prisma.shopFollow.findMany({
      where: { shopId },
      select: { userId: true }
    });
    for (const { userId } of followers) {
      await createNotification(userId, title, content, meta);
    }
  } catch (err) {
    console.error('notifyShopFollowers failed:', err);
  }
};

// Notify buyers who asked to be told when a product came back in stock, then
// mark those subscriptions as notified so a single restock alerts each once.
export const notifyBackInStock = async (productId: string): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stockQuantity: true }
    });
    if (!product || product.stockQuantity <= 0) return;

    const subs = await prisma.stockNotification.findMany({
      where: { productId, notified: false },
      select: { id: true, userId: true }
    });
    if (subs.length === 0) return;

    for (const sub of subs) {
      await createNotification(
        sub.userId,
        'Мол дубора омад! 🔔',
        `«${product.name}» дубора мавҷуд шуд. Онро зуд харед, то дубора тамом нашавад!`,
        { type: 'BACK_IN_STOCK', productId }
      );
    }

    await prisma.stockNotification.updateMany({
      where: { id: { in: subs.map((s) => s.id) } },
      data: { notified: true }
    });
  } catch (err) {
    console.error('notifyBackInStock failed:', err);
  }
};
