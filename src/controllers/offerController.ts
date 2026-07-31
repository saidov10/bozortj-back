import { Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// Price bargaining ("Нарх пешниҳод кун") — a cultural feature: in a real Tajik
// bazaar everyone haggles. A buyer proposes a price; the seller accepts,
// rejects, or counters. On acceptance we mint a single-use, buyer-locked coupon
// worth the discount so the buyer checks out at the agreed price.

const OFFER_TTL_HOURS = 48;

// Current effective unit price of a product (respects an active discount).
const effectiveUnitPrice = (product: { price: number; discountPrice: number | null; isOnDiscount: boolean }) => {
  if (product.isOnDiscount && product.discountPrice != null) return product.discountPrice;
  return product.price;
};

const offerInclude = {
  product: {
    include: { images: { take: 1 }, shop: { select: { id: true, shopName: true } } }
  },
  buyer: { select: { id: true, name: true, avatarUrl: true } }
};

const shapeOffer = (o: any) => ({
  id: o.id,
  productId: o.productId,
  offeredPrice: o.offeredPrice,
  counterPrice: o.counterPrice,
  agreedPrice: o.agreedPrice,
  status: o.status,
  message: o.message,
  couponCode: o.couponCode,
  createdAt: o.createdAt,
  respondedAt: o.respondedAt,
  expiresAt: o.expiresAt,
  isExpired: new Date(o.expiresAt) < new Date() && o.status !== 'ACCEPTED',
  product: o.product
    ? {
        id: o.product.id,
        name: o.product.name,
        price: o.product.price,
        discountPrice: o.product.discountPrice,
        isOnDiscount: o.product.isOnDiscount,
        image: o.product.images?.[0]?.url ?? null,
        shopName: o.product.shop?.shopName ?? null,
        shopId: o.product.shop?.id ?? null
      }
    : null,
  buyer: o.buyer ?? null
});

// Generate a single-use, buyer-locked FIXED coupon for the agreed price and
// attach its code to the offer. Returns the coupon code.
const issueDealCoupon = async (params: {
  offerId: string;
  buyerId: string;
  shopId: string;
  originalUnitPrice: number;
  agreedPrice: number;
}): Promise<string> => {
  const { offerId, buyerId, shopId, originalUnitPrice, agreedPrice } = params;
  const discountValue = Math.max(0, +(originalUnitPrice - agreedPrice).toFixed(2));
  const code = `DEAL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const expiryDate = new Date(Date.now() + OFFER_TTL_HOURS * 60 * 60 * 1000);

  await prisma.coupon.create({
    data: {
      code,
      discountType: 'FIXED',
      discountValue,
      minPurchase: 0,
      maxUsage: 1,
      shopId,
      assignedUserId: buyerId,
      expiryDate
    }
  });

  await prisma.priceOffer.update({
    where: { id: offerId },
    data: { status: 'ACCEPTED', agreedPrice, couponCode: code, respondedAt: new Date() }
  });

  return code;
};

// 1. Buyer creates a price offer.
export const createOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'BUYER') return res.status(403).json({ message: 'Only buyers can make price offers' });

    const { productId, offeredPrice, message } = req.body;
    if (!productId || offeredPrice === undefined) {
      return res.status(400).json({ message: 'productId and offeredPrice are required' });
    }

    const price = parseFloat(offeredPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ message: 'offeredPrice must be a positive number' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { id: true, userId: true, shopName: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const current = effectiveUnitPrice(product);
    if (price >= current) {
      return res.status(400).json({
        message: `Нархи пешниҳодшуда бояд аз нархи ҷорӣ (${current} с.) камтар бошад`
      });
    }

    // Prevent spamming the same product with multiple open offers.
    const existingOpen = await prisma.priceOffer.findFirst({
      where: { productId, buyerId: req.user.id, status: { in: ['PENDING', 'COUNTERED'] } }
    });
    if (existingOpen) {
      return res.status(409).json({ message: 'Шумо аллакай як пешниҳоди фаъол барои ин мол доред' });
    }

    const offer = await prisma.priceOffer.create({
      data: {
        productId,
        buyerId: req.user.id,
        shopId: product.shop.id,
        offeredPrice: price,
        message: message?.toString().slice(0, 500) || null,
        expiresAt: new Date(Date.now() + OFFER_TTL_HOURS * 60 * 60 * 1000)
      },
      include: offerInclude
    });

    // Notify the seller (in-app + Telegram + Web Push, via createNotification).
    await createNotification(
      product.shop.userId,
      '🤝 Пешниҳоди нави нарх!',
      `Барои "${product.name}" харидор ${price} с. пешниҳод кард (нархи ҷорӣ: ${current} с.).`,
      { type: 'PRICE_OFFER', offerId: offer.id, productId }
    );

    return res.status(201).json({ message: 'Пешниҳод фиристода шуд', offer: shapeOffer(offer) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating offer', error: error.message });
  }
};

// 2. Buyer: my offers.
export const getMyOffers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const offers = await prisma.priceOffer.findMany({
      where: { buyerId: req.user.id },
      include: offerInclude,
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ offers: offers.map(shapeOffer) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving offers', error: error.message });
  }
};

// 3. Seller: offers received on my products.
export const getReceivedOffers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });

    const offers = await prisma.priceOffer.findMany({
      where: { shopId: shop.id },
      include: offerInclude,
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ offers: offers.map(shapeOffer) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving offers', error: error.message });
  }
};

// Load an offer and verify the current seller owns it. Returns [offer, product]
// or sends the error response and returns null.
const loadSellerOffer = async (req: AuthRequest, res: Response) => {
  const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user!.id } });
  if (!shop) {
    res.status(403).json({ message: 'Shop profile not found' });
    return null;
  }
  const offer = await prisma.priceOffer.findUnique({
    where: { id: req.params.id },
    include: { product: true }
  });
  if (!offer) {
    res.status(404).json({ message: 'Offer not found' });
    return null;
  }
  if (offer.shopId !== shop.id) {
    res.status(403).json({ message: 'This offer is not for your shop' });
    return null;
  }
  return offer;
};

// 4. Seller accepts the buyer's current price.
export const acceptOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const offer = await loadSellerOffer(req, res);
    if (!offer) return;

    if (offer.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot accept an offer with status ${offer.status}` });
    }

    const code = await issueDealCoupon({
      offerId: offer.id,
      buyerId: offer.buyerId,
      shopId: offer.shopId,
      originalUnitPrice: effectiveUnitPrice(offer.product),
      agreedPrice: offer.offeredPrice
    });

    await createNotification(
      offer.buyerId,
      '✅ Пешниҳоди шумо қабул шуд!',
      `Барои "${offer.product.name}" нархи ${offer.offeredPrice} с. тасдиқ шуд. Дар харид коди «${code}»-ро истифода баред.`,
      { type: 'OFFER_ACCEPTED', offerId: offer.id, couponCode: code, productId: offer.productId }
    );

    return res.status(200).json({ message: 'Пешниҳод қабул шуд', couponCode: code });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error accepting offer', error: error.message });
  }
};

// 5. Seller rejects.
export const rejectOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const offer = await loadSellerOffer(req, res);
    if (!offer) return;

    if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
      return res.status(400).json({ message: `Cannot reject an offer with status ${offer.status}` });
    }

    await prisma.priceOffer.update({
      where: { id: offer.id },
      data: { status: 'REJECTED', respondedAt: new Date() }
    });

    await createNotification(
      offer.buyerId,
      'Пешниҳоди нарх рад шуд',
      `Мутаассифона, фурӯшанда пешниҳоди шуморо барои "${offer.product.name}" қабул накард.`,
      { type: 'OFFER_REJECTED', offerId: offer.id, productId: offer.productId }
    );

    return res.status(200).json({ message: 'Пешниҳод рад шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error rejecting offer', error: error.message });
  }
};

// 6. Seller counters with a different price.
export const counterOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const offer = await loadSellerOffer(req, res);
    if (!offer) return;

    if (offer.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot counter an offer with status ${offer.status}` });
    }

    const counter = parseFloat(req.body.counterPrice);
    const current = effectiveUnitPrice(offer.product);
    if (isNaN(counter) || counter <= 0) {
      return res.status(400).json({ message: 'counterPrice must be a positive number' });
    }
    if (counter <= offer.offeredPrice || counter >= current) {
      return res.status(400).json({
        message: `Нархи ҷавобӣ бояд байни ${offer.offeredPrice} ва ${current} сомонӣ бошад`
      });
    }

    await prisma.priceOffer.update({
      where: { id: offer.id },
      data: {
        status: 'COUNTERED',
        counterPrice: counter,
        message: req.body.message?.toString().slice(0, 500) || offer.message,
        respondedAt: new Date()
      }
    });

    await createNotification(
      offer.buyerId,
      '🤝 Фурӯшанда нархи ҷавобӣ пешниҳод кард',
      `Барои "${offer.product.name}" фурӯшанда ${counter} с. пешниҳод мекунад. Қабул мекунед?`,
      { type: 'OFFER_COUNTERED', offerId: offer.id, counterPrice: counter, productId: offer.productId }
    );

    return res.status(200).json({ message: 'Нархи ҷавобӣ фиристода шуд', counterPrice: counter });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error countering offer', error: error.message });
  }
};

// 7. Buyer accepts the seller's counter-offer → mint the deal coupon.
export const acceptCounter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const offer = await prisma.priceOffer.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { shop: { select: { userId: true } } } } }
    });
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (offer.buyerId !== req.user.id) return res.status(403).json({ message: 'This is not your offer' });
    if (offer.status !== 'COUNTERED' || offer.counterPrice == null) {
      return res.status(400).json({ message: 'There is no counter-offer to accept' });
    }
    if (new Date(offer.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'This offer has expired' });
    }

    const code = await issueDealCoupon({
      offerId: offer.id,
      buyerId: offer.buyerId,
      shopId: offer.shopId,
      originalUnitPrice: effectiveUnitPrice(offer.product),
      agreedPrice: offer.counterPrice
    });

    await createNotification(
      offer.product.shop.userId,
      '✅ Харидор нархи ҷавобиро қабул кард',
      `Барои "${offer.product.name}" нархи ${offer.counterPrice} с. мувофиқа шуд.`,
      { type: 'COUNTER_ACCEPTED', offerId: offer.id, productId: offer.productId }
    );

    return res.status(200).json({ message: 'Нарх мувофиқа шуд', couponCode: code });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error accepting counter-offer', error: error.message });
  }
};
