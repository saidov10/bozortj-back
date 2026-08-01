import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { broadcastAuctionUpdate } from '../services/chatSocket';

// Auction (музояда): a seller lists a product for timed bidding; buyers raise the
// price live; when the timer ends the highest bidder wins. Live updates go out
// over the existing socket ("auction_update").

const auctionInclude = {
  product: {
    include: { images: { take: 1 }, brand: true, shop: { select: { id: true, shopName: true } } }
  },
  currentBidder: { select: { id: true, name: true } }
};

const shape = (a: any) => ({
  id: a.id,
  productId: a.productId,
  shopId: a.shopId,
  startPrice: a.startPrice,
  currentPrice: a.currentPrice,
  bidIncrement: a.bidIncrement,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  status: a.status,
  isActive: a.status === 'ACTIVE' && new Date(a.endsAt) > new Date(),
  secondsRemaining: Math.max(0, Math.floor((new Date(a.endsAt).getTime() - Date.now()) / 1000)),
  currentBidder: a.currentBidder ?? null,
  bidCount: a._count?.bids ?? undefined,
  product: a.product
    ? {
        id: a.product.id,
        name: a.product.name,
        image: a.product.images?.[0]?.url ?? null,
        brand: a.product.brand?.name ?? null,
        shopName: a.product.shop?.shopName ?? null
      }
    : null
});

// POST /api/auctions  (SELLER)  { productId, startPrice, endsAt, bidIncrement?, startsAt? }
export const createAuction = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Only sellers with a shop can run auctions' });

    const { productId, startPrice, endsAt, bidIncrement, startsAt } = req.body;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shopId !== shop.id) return res.status(403).json({ message: 'You can only auction your own products' });

    const start = parseFloat(startPrice);
    if (isNaN(start) || start <= 0) return res.status(400).json({ message: 'startPrice must be a positive number' });

    const end = new Date(endsAt);
    if (isNaN(end.getTime()) || end <= new Date()) {
      return res.status(400).json({ message: 'endsAt must be a valid future date' });
    }
    const increment = bidIncrement ? Math.max(0.5, parseFloat(bidIncrement)) : 1;

    // One active auction per product at a time.
    const existing = await prisma.auction.findFirst({ where: { productId, status: 'ACTIVE' } });
    if (existing) return res.status(409).json({ message: 'This product already has an active auction' });

    const auction = await prisma.auction.create({
      data: {
        productId,
        shopId: shop.id,
        startPrice: start,
        currentPrice: start,
        bidIncrement: increment,
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        endsAt: end
      },
      include: auctionInclude
    });
    return res.status(201).json({ message: 'Auction created', auction: shape(auction) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating auction', error: error.message });
  }
};

// GET /api/auctions  (public) — active auctions
export const getActiveAuctions = async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const auctions = await prisma.auction.findMany({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { endsAt: 'asc' },
      include: { ...auctionInclude, _count: { select: { bids: true } } }
    });
    return res.status(200).json({ auctions: auctions.map(shape) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving auctions', error: error.message });
  }
};

// GET /api/auctions/:id  (public) — one auction + recent bids
export const getAuctionById = async (req: AuthRequest, res: Response) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: {
        ...auctionInclude,
        _count: { select: { bids: true } },
        bids: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });
    if (!auction) return res.status(404).json({ message: 'Auction not found' });
    return res.status(200).json({
      auction: shape(auction),
      bids: auction.bids.map((b) => ({ amount: b.amount, at: b.createdAt, bidder: b.user }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving auction', error: error.message });
  }
};

// POST /api/auctions/:id/bid  (BUYER)  { amount }
export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const amount = parseFloat(req.body.amount);

    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return res.status(404).json({ message: 'Auction not found' });
    if (auction.status !== 'ACTIVE' || new Date(auction.endsAt) <= new Date()) {
      return res.status(400).json({ message: 'This auction has ended' });
    }

    const minNext = auction.currentBidderId
      ? auction.currentPrice + auction.bidIncrement
      : auction.currentPrice; // first bid may equal the start price
    if (isNaN(amount) || amount < minNext) {
      return res.status(400).json({ message: `Пешниҳоди шумо бояд на камтар аз ${minNext} сомонӣ бошад` });
    }

    const previousBidderId = auction.currentBidderId;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.bid.create({ data: { auctionId: id, userId: req.user!.id, amount } });
      return tx.auction.update({
        where: { id },
        data: { currentPrice: amount, currentBidderId: req.user!.id }
      });
    });

    // Live update to all watchers.
    broadcastAuctionUpdate({
      auctionId: id,
      productId: updated.productId,
      currentPrice: updated.currentPrice,
      currentBidderId: updated.currentBidderId,
      status: updated.status
    });

    // Tell the previous top bidder they've been outbid.
    if (previousBidderId && previousBidderId !== req.user.id) {
      await createNotification(
        previousBidderId,
        'Шуморо дар музояда пешӣ гирифтанд 🔨',
        `Дар музояда нархи нав ${amount} сомонӣ шуд. Барои пешсаф шудан аз нав пешниҳод кунед!`,
        { type: 'OUTBID', auctionId: id, productId: updated.productId }
      );
    }

    return res.status(200).json({ message: 'Пешниҳоди шумо қабул шуд', currentPrice: updated.currentPrice });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error placing bid', error: error.message });
  }
};

// GET /api/auctions/mine  (SELLER)
export const getMyAuctions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });
    const auctions = await prisma.auction.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      include: { ...auctionInclude, _count: { select: { bids: true } } }
    });
    return res.status(200).json({ auctions: auctions.map(shape) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving auctions', error: error.message });
  }
};
