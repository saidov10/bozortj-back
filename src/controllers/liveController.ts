import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { broadcastLiveUpdate } from '../services/chatSocket';
import { notifyShopFollowers } from '../services/engagementService';

// Live shopping (live-фурӯш): a seller runs a timed live session showcasing a set
// of products at special "live only" prices. While the stream is LIVE the live
// price is applied to each product as a real discount (so checkout charges it);
// when the stream ENDS the original pricing is restored from a per-item snapshot.
// Watchers get real-time updates over the socket ("live_update").

const streamInclude = {
  shop: { select: { id: true, shopName: true, bannerUrl: true, brandColor: true } },
  items: {
    include: {
      product: {
        include: { images: { take: 1 }, brand: true }
      }
    },
    orderBy: { createdAt: 'asc' as const }
  }
};

const shapeItem = (it: any, live: boolean) => ({
  id: it.id,
  productId: it.productId,
  livePrice: it.livePrice,
  isFeatured: it.isFeatured,
  // The live price is only "active" while the stream is LIVE.
  effectivePrice: live ? it.livePrice : it.product?.price ?? it.livePrice,
  savings: it.product ? +(it.product.price - it.livePrice).toFixed(2) : 0,
  product: it.product
    ? {
        id: it.product.id,
        name: it.product.name,
        price: it.product.price,
        image: it.product.images?.[0]?.url ?? null,
        brand: it.product.brand?.name ?? null,
        stockQuantity: it.product.stockQuantity
      }
    : null
});

const shapeStream = (s: any) => {
  const live = s.status === 'LIVE';
  return {
    id: s.id,
    title: s.title,
    status: s.status,
    isLive: live,
    scheduledAt: s.scheduledAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    viewerPeak: s.viewerPeak,
    createdAt: s.createdAt,
    shop: s.shop ?? null,
    itemCount: s.items?.length ?? 0,
    featuredProductId: s.items?.find((i: any) => i.isFeatured)?.productId ?? null,
    items: s.items ? s.items.map((i: any) => shapeItem(i, live)) : undefined
  };
};

const getSellerShop = async (userId: string) =>
  prisma.shopProfile.findUnique({ where: { userId } });

// POST /api/live  (SELLER)  { title, scheduledAt? }
export const createStream = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await getSellerShop(req.user.id);
    if (!shop) return res.status(403).json({ message: 'Only sellers with a shop can go live' });

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'A stream title is required' });

    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ message: 'scheduledAt must be a valid date' });
    }

    const stream = await prisma.liveStream.create({
      data: { shopId: shop.id, title, scheduledAt },
      include: streamInclude
    });
    return res.status(201).json({ message: 'Стрим сохта шуд', stream: shapeStream(stream) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating stream', error: error.message });
  }
};

// Ensures the stream exists and belongs to the requesting seller.
const ownedStream = async (streamId: string, userId: string) => {
  const stream = await prisma.liveStream.findUnique({
    where: { id: streamId },
    include: { shop: { select: { userId: true, id: true, shopName: true } } }
  });
  if (!stream || stream.shop.userId !== userId) return null;
  return stream;
};

// POST /api/live/:id/items  (SELLER)  { productId, livePrice }
export const addStreamItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stream = await ownedStream(req.params.id, req.user.id);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status === 'ENDED') return res.status(400).json({ message: 'This stream has ended' });

    const { productId } = req.body;
    const livePrice = parseFloat(req.body.livePrice);
    if (isNaN(livePrice) || livePrice <= 0) {
      return res.status(400).json({ message: 'livePrice must be a positive number' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shopId !== stream.shop.id) {
      return res.status(403).json({ message: 'You can only feature your own products' });
    }
    if (livePrice >= product.price) {
      return res.status(400).json({ message: 'livePrice must be below the normal price' });
    }

    const item = await prisma.liveStreamItem.upsert({
      where: { streamId_productId: { streamId: stream.id, productId } },
      update: { livePrice },
      create: { streamId: stream.id, productId, livePrice }
    });

    // If the stream is already live, apply the discount immediately.
    if (stream.status === 'LIVE') {
      await applyLivePrice(item.id);
    }

    broadcastLiveUpdate({ streamId: stream.id, status: stream.status, event: 'ITEMS' });
    return res.status(201).json({ message: 'Мол ба стрим илова шуд', item });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding item', error: error.message });
  }
};

// DELETE /api/live/:id/items/:itemId  (SELLER)
export const removeStreamItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stream = await ownedStream(req.params.id, req.user.id);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    const item = await prisma.liveStreamItem.findFirst({
      where: { id: req.params.itemId, streamId: stream.id }
    });
    if (!item) return res.status(404).json({ message: 'Item not found' });

    // Restore the product's pricing if the discount was live.
    if (stream.status === 'LIVE') await restoreLivePrice(item.id);
    await prisma.liveStreamItem.delete({ where: { id: item.id } });

    broadcastLiveUpdate({ streamId: stream.id, status: stream.status, event: 'ITEMS' });
    return res.status(200).json({ message: 'Мол аз стрим бароварда шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing item', error: error.message });
  }
};

// Apply an item's live price to its product, snapshotting the original state.
const applyLivePrice = async (itemId: string) => {
  const item = await prisma.liveStreamItem.findUnique({
    where: { id: itemId },
    include: { product: { select: { isOnDiscount: true, discountPrice: true } } }
  });
  if (!item || !item.product) return;
  await prisma.$transaction([
    prisma.liveStreamItem.update({
      where: { id: itemId },
      data: {
        origIsOnDiscount: item.product.isOnDiscount,
        origDiscountPrice: item.product.discountPrice
      }
    }),
    prisma.product.update({
      where: { id: item.productId },
      data: { isOnDiscount: true, discountPrice: item.livePrice }
    })
  ]);
};

// Restore a product's original pricing from the item's snapshot.
const restoreLivePrice = async (itemId: string) => {
  const item = await prisma.liveStreamItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  await prisma.product.update({
    where: { id: item.productId },
    data: {
      isOnDiscount: item.origIsOnDiscount ?? false,
      discountPrice: item.origDiscountPrice ?? null
    }
  });
};

// PATCH /api/live/:id/start  (SELLER)
export const startStream = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stream = await ownedStream(req.params.id, req.user.id);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status === 'LIVE') return res.status(400).json({ message: 'Stream is already live' });
    if (stream.status === 'ENDED') return res.status(400).json({ message: 'This stream has ended' });

    const items = await prisma.liveStreamItem.findMany({ where: { streamId: stream.id } });
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { status: 'LIVE', startedAt: new Date() }
    });
    // Apply every item's live price as a real discount.
    for (const it of items) await applyLivePrice(it.id);

    broadcastLiveUpdate({ streamId: stream.id, status: 'LIVE', event: 'STARTED' });

    // Tell the shop's followers the live sale has begun.
    void notifyShopFollowers(
      stream.shop.id,
      `${stream.shop.shopName} ҳозир LIVE аст 🔴`,
      `«${stream.title}» — фурӯши зинда бо тахфиф оғоз шуд. Ҳозир дохил шавед!`,
      { type: 'LIVE_STARTED', streamId: stream.id }
    );

    const full = await prisma.liveStream.findUnique({ where: { id: stream.id }, include: streamInclude });
    return res.status(200).json({ message: 'Стрим оғоз ёфт 🔴', stream: shapeStream(full) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error starting stream', error: error.message });
  }
};

// PATCH /api/live/:id/feature  (SELLER)  { productId }
export const featureItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stream = await ownedStream(req.params.id, req.user.id);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });

    const { productId } = req.body;
    const item = await prisma.liveStreamItem.findFirst({ where: { streamId: stream.id, productId } });
    if (!item) return res.status(404).json({ message: 'This product is not part of the stream' });

    await prisma.$transaction([
      prisma.liveStreamItem.updateMany({ where: { streamId: stream.id }, data: { isFeatured: false } }),
      prisma.liveStreamItem.update({ where: { id: item.id }, data: { isFeatured: true } })
    ]);

    broadcastLiveUpdate({
      streamId: stream.id,
      status: stream.status,
      event: 'FEATURE',
      featuredProductId: productId,
      livePrice: item.livePrice
    });
    return res.status(200).json({ message: 'Мол пин карда шуд', featuredProductId: productId });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error featuring item', error: error.message });
  }
};

// PATCH /api/live/:id/end  (SELLER)
export const endStream = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const stream = await ownedStream(req.params.id, req.user.id);
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    if (stream.status === 'ENDED') return res.status(400).json({ message: 'Stream already ended' });

    const items = await prisma.liveStreamItem.findMany({ where: { streamId: stream.id } });
    // Restore each product's original pricing.
    for (const it of items) await restoreLivePrice(it.id);

    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { status: 'ENDED', endedAt: new Date() }
    });
    broadcastLiveUpdate({ streamId: stream.id, status: 'ENDED', event: 'ENDED' });
    return res.status(200).json({ message: 'Стрим анҷом ёфт' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error ending stream', error: error.message });
  }
};

// GET /api/live  (public) — currently live + scheduled upcoming streams
export const getStreams = async (_req: AuthRequest, res: Response) => {
  try {
    const streams = await prisma.liveStream.findMany({
      where: { status: { in: ['LIVE', 'SCHEDULED'] } },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }, { scheduledAt: 'asc' }],
      include: streamInclude
    });
    // LIVE first, then scheduled.
    const shaped = streams.map(shapeStream).sort((a, b) => (a.isLive === b.isLive ? 0 : a.isLive ? -1 : 1));
    return res.status(200).json({ streams: shaped });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving streams', error: error.message });
  }
};

// GET /api/live/:id  (public) — one stream with its items
export const getStreamById = async (req: AuthRequest, res: Response) => {
  try {
    const stream = await prisma.liveStream.findUnique({
      where: { id: req.params.id },
      include: streamInclude
    });
    if (!stream) return res.status(404).json({ message: 'Stream not found' });
    return res.status(200).json({ stream: shapeStream(stream) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving stream', error: error.message });
  }
};

// GET /api/live/mine  (SELLER)
export const getMyStreams = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await getSellerShop(req.user.id);
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });
    const streams = await prisma.liveStream.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      include: streamInclude
    });
    return res.status(200).json({ streams: streams.map(shapeStream) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving streams', error: error.message });
  }
};
