import prisma from '../config/prisma';
import { createNotification } from './notificationService';

// How old a cart item must be before we consider it "abandoned".
const ABANDON_AFTER_HOURS = 24;
// How often to run the sweep.
const RUN_EVERY_MS = 60 * 60 * 1000; // 1 hour

// One sweep: find cart items that have sat untouched for >24h and haven't been
// reminded yet, then send each affected buyer a single reminder notification.
export const runAbandonedCartSweep = async (): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);

    const staleItems = await prisma.cartItem.findMany({
      where: { abandonedNotified: false, createdAt: { lt: cutoff } },
      include: {
        variant: { include: { product: { select: { name: true } } } }
      }
    });

    if (staleItems.length === 0) return;

    // Group by buyer so each person gets one reminder, not one per item.
    const byUser = new Map<string, { itemIds: string[]; productName: string; count: number }>();
    for (const item of staleItems) {
      const entry = byUser.get(item.userId) || {
        itemIds: [],
        productName: item.variant.product.name,
        count: 0
      };
      entry.itemIds.push(item.id);
      entry.count += 1;
      byUser.set(item.userId, entry);
    }

    for (const [userId, info] of byUser) {
      const content =
        info.count > 1
          ? `Дар сабади шумо ${info.count} мол интизор аст, аз ҷумла "${info.productName}". Онҳо метавонанд зуд тамом шаванд — харидро ба анҷом расонед! 🛒`
          : `"${info.productName}" ҳанӯз дар сабади шумо интизор аст. Онро аз даст надиҳед — харидро ба анҷом расонед! 🛒`;

      await createNotification(userId, 'Сабади шумо интизор аст 🛒', content, {
        type: 'ABANDONED_CART'
      });

      // Mark these items so we don't remind again.
      await prisma.cartItem.updateMany({
        where: { id: { in: info.itemIds } },
        data: { abandonedNotified: true }
      });
    }

    console.log(`Abandoned cart sweep: reminded ${byUser.size} buyer(s).`);
  } catch (err) {
    console.error('Abandoned cart sweep failed:', err);
  }
};

// Start the recurring sweep. Note: on Render's free tier the service sleeps
// after ~15min idle, so the interval only advances while the app is awake —
// reminders are best-effort and fire on the next sweep after the app wakes.
export const startAbandonedCartJob = (): void => {
  // First run shortly after boot, then on the interval.
  setTimeout(() => {
    void runAbandonedCartSweep();
  }, 60 * 1000);

  setInterval(() => {
    void runAbandonedCartSweep();
  }, RUN_EVERY_MS);
};
