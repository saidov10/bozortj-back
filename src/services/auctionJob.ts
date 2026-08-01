import crypto from 'crypto';
import prisma from '../config/prisma';
import { createNotification } from './notificationService';
import { broadcastAuctionUpdate } from './chatSocket';

// Closes auctions whose timer has passed: marks them ENDED, and if there's a
// winner, issues a single-use, buyer-locked coupon so they can check out at the
// won price. Runs on an interval (advances while the app is awake on Render).

const RUN_EVERY_MS = 60 * 1000; // every minute

export const closeEndedAuctions = async (): Promise<void> => {
  try {
    const now = new Date();
    const ended = await prisma.auction.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: now } },
      include: { product: { select: { id: true, name: true, price: true, shopId: true } } }
    });

    for (const auction of ended) {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: 'ENDED' } });
      broadcastAuctionUpdate({
        auctionId: auction.id,
        productId: auction.productId,
        currentPrice: auction.currentPrice,
        currentBidderId: auction.currentBidderId,
        status: 'ENDED'
      });

      if (!auction.currentBidderId) {
        // No bids — just tell the seller.
        const shop = await prisma.shopProfile.findUnique({
          where: { id: auction.shopId },
          select: { userId: true }
        });
        if (shop) {
          await createNotification(
            shop.userId,
            'Музояда бе пешниҳод анҷом ёфт',
            `Музоядаи «${auction.product.name}» бидуни пешниҳод анҷом ёфт.`,
            { type: 'AUCTION_ENDED', auctionId: auction.id }
          );
        }
        continue;
      }

      // Winner: mint a buyer-locked coupon for the difference to the list price so
      // they pay the won price at checkout.
      const discountValue = Math.max(0, +(auction.product.price - auction.currentPrice).toFixed(2));
      const code = `WIN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const expiryDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await prisma.coupon.create({
        data: {
          code,
          discountType: 'FIXED',
          discountValue,
          minPurchase: 0,
          maxUsage: 1,
          shopId: auction.product.shopId,
          assignedUserId: auction.currentBidderId,
          expiryDate
        }
      });

      await createNotification(
        auction.currentBidderId,
        '🏆 Шумо музоядаро бурдед!',
        `Шумо «${auction.product.name}»-ро бо ${auction.currentPrice} сомонӣ бурдед. Барои харид коди «${code}»-ро истифода баред (то 48 соат).`,
        { type: 'AUCTION_WON', auctionId: auction.id, couponCode: code, productId: auction.productId }
      );

      const shop = await prisma.shopProfile.findUnique({
        where: { id: auction.shopId },
        select: { userId: true }
      });
      if (shop) {
        await createNotification(
          shop.userId,
          '🔨 Музояда анҷом ёфт',
          `«${auction.product.name}» бо ${auction.currentPrice} сомонӣ фурӯхта шуд.`,
          { type: 'AUCTION_SOLD', auctionId: auction.id }
        );
      }
    }

    if (ended.length > 0) console.log(`Auction job: closed ${ended.length} auction(s).`);
  } catch (err) {
    console.error('closeEndedAuctions failed:', err);
  }
};

export const startAuctionJob = (): void => {
  setTimeout(() => void closeEndedAuctions(), 30 * 1000);
  setInterval(() => void closeEndedAuctions(), RUN_EVERY_MS);
};
