import { Request, Response } from 'express';
import prisma from '../config/prisma';

// Seller trust badges ("Нишонҳои эътимод") — computed on the fly from data we
// already have (reviews, delivered orders, chat responsiveness). No new tables;
// results are cached briefly since they change slowly and the query set is a
// little heavy. Trust = sales for a buyer who is wary of being cheated.

interface Badge {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface TrustResult {
  shopId: string;
  stats: {
    reviewCount: number;
    avgRating: number | null;
    deliveredOrders: number;
    sellerReplyRate: number | null; // share of reviews the seller replied to
    avgResponseMinutes: number | null; // avg chat first-reply time
  };
  badges: Badge[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: TrustResult }>();

// Approximate the seller's average first-reply time in chat: walk recent
// messages in order and, for each buyer whose message is awaiting a reply,
// measure the gap until the seller's next message to that buyer.
const computeAvgResponseMinutes = async (sellerId: string): Promise<number | null> => {
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: sellerId }, { receiverId: sellerId }] },
    orderBy: { createdAt: 'asc' },
    take: 400,
    select: { senderId: true, receiverId: true, createdAt: true }
  });

  const pendingSince = new Map<string, Date>(); // buyerId -> first unanswered msg time
  const deltas: number[] = [];

  for (const m of messages) {
    const incoming = m.receiverId === sellerId; // buyer -> seller
    if (incoming) {
      if (!pendingSince.has(m.senderId)) pendingSince.set(m.senderId, m.createdAt);
    } else {
      // seller -> buyer: closes any pending gap for that buyer
      const since = pendingSince.get(m.receiverId);
      if (since) {
        deltas.push((m.createdAt.getTime() - since.getTime()) / 60000);
        pendingSince.delete(m.receiverId);
      }
    }
  }

  if (deltas.length < 3) return null;
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return Math.round(avg);
};

const computeTrust = async (shopId: string, sellerId: string): Promise<TrustResult> => {
  const [reviewAgg, reviewedCount, repliedCount, deliveredOrders, avgResponseMinutes] = await Promise.all([
    prisma.review.aggregate({
      where: { product: { shopId } },
      _avg: { rating: true },
      _count: { _all: true }
    }),
    prisma.review.count({ where: { product: { shopId } } }),
    prisma.review.count({ where: { product: { shopId }, sellerReply: { not: null } } }),
    prisma.order.count({ where: { status: 'DELIVERED', items: { some: { shopId } } } }),
    computeAvgResponseMinutes(sellerId)
  ]);

  const reviewCount = reviewedCount;
  const avgRating = reviewAgg._avg.rating ?? null;
  const sellerReplyRate = reviewCount > 0 ? +(repliedCount / reviewCount).toFixed(2) : null;

  const badges: Badge[] = [];

  if (avgRating != null && avgRating >= 4.5 && reviewCount >= 5) {
    badges.push({
      id: 'trusted',
      label: 'Фурӯшандаи боэътимод',
      icon: '⭐',
      description: `Баҳои миёна ${avgRating.toFixed(1)} аз ${reviewCount} тақриз`
    });
  }

  if (deliveredOrders >= 10) {
    badges.push({
      id: 'proven',
      label: 'Фурӯшандаи фаъол',
      icon: '📦',
      description: `${deliveredOrders} фармоиши бомуваффақият расонидашуда`
    });
  }

  if (avgResponseMinutes != null && avgResponseMinutes <= 60) {
    badges.push({
      id: 'fast-reply',
      label: 'Зуд ҷавоб медиҳад',
      icon: '💬',
      description: `Ба ҳисоби миёна дар ${avgResponseMinutes} дақиқа ҷавоб медиҳад`
    });
  }

  if (sellerReplyRate != null && sellerReplyRate >= 0.5 && reviewCount >= 5) {
    badges.push({
      id: 'engaged',
      label: 'Ба тақризҳо ҷавоб медиҳад',
      icon: '🗣️',
      description: 'Бо мизоҷон фаъолона муошират мекунад'
    });
  }

  return {
    shopId,
    stats: { reviewCount, avgRating, deliveredOrders, sellerReplyRate, avgResponseMinutes },
    badges
  };
};

// GET /api/shops/:id/badges
export const getShopBadges = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cached = cache.get(id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const shop = await prisma.shopProfile.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const data = await computeTrust(shop.id, shop.userId);
    cache.set(id, { at: Date.now(), data });
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ message: 'Error computing trust badges', error: error.message });
  }
};
