import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { ServiceError } from '../utils/serviceError';
import { buildOfferButtons } from '../services/telegramService';
import {
  OFFER_TTL_HOURS,
  effectiveUnitPrice,
  issueDealCoupon,
  acceptOffer as acceptOfferSvc,
  rejectOffer as rejectOfferSvc,
  counterOffer as counterOfferSvc,
  acceptCounter as acceptCounterSvc
} from '../services/offerService';

// Price bargaining ("Нарх пешниҳод кун"). Core logic lives in offerService so
// the Telegram bot can drive accept/reject too; controllers stay thin.

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

// Map a thrown ServiceError to an HTTP response.
const handleServiceError = (res: Response, error: any) => {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: 'Server error', error: error.message });
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
      return res.status(400).json({ message: `Нархи пешниҳодшуда бояд аз нархи ҷорӣ (${current} с.) камтар бошад` });
    }

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

    // ⚡ Auto-accept: if the seller set a floor and the offer meets it, deal is
    // closed instantly — buyer gets the coupon without waiting for the seller.
    if (product.minAcceptablePrice != null && price >= product.minAcceptablePrice) {
      const code = await issueDealCoupon({
        offerId: offer.id,
        buyerId: req.user.id,
        shopId: product.shop.id,
        originalUnitPrice: current,
        agreedPrice: price
      });
      await createNotification(
        req.user.id,
        '✅ Пешниҳоди шумо фавран қабул шуд!',
        `Барои "${product.name}" нархи ${price} с. тасдиқ шуд. Дар харид коди «${code}»-ро истифода баред.`,
        { type: 'OFFER_ACCEPTED', offerId: offer.id, couponCode: code, productId }
      );
      // Let the seller know a deal auto-closed (no action needed).
      await createNotification(
        product.shop.userId,
        '🤝 Савдо худкор баста шуд',
        `Барои "${product.name}" харидор ${price} с. пешниҳод кард ва он худкор қабул шуд.`,
        { type: 'OFFER_AUTO_ACCEPTED', offerId: offer.id, productId }
      );
      const accepted = await prisma.priceOffer.findUnique({ where: { id: offer.id }, include: offerInclude });
      return res.status(201).json({
        message: 'Пешниҳоди шумо фавран қабул шуд',
        autoAccepted: true,
        couponCode: code,
        offer: shapeOffer(accepted)
      });
    }

    // Notify the seller — with inline Accept/Reject buttons on Telegram.
    await createNotification(
      product.shop.userId,
      '🤝 Пешниҳоди нави нарх!',
      `Барои "${product.name}" харидор ${price} с. пешниҳод кард (нархи ҷорӣ: ${current} с.).`,
      { type: 'PRICE_OFFER', offerId: offer.id, productId },
      { telegramButtons: buildOfferButtons(offer.id) }
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

// 4. Seller accepts.
export const acceptOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const code = await acceptOfferSvc(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Пешниҳод қабул шуд', couponCode: code });
  } catch (error: any) {
    return handleServiceError(res, error);
  }
};

// 5. Seller rejects.
export const rejectOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    await rejectOfferSvc(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Пешниҳод рад шуд' });
  } catch (error: any) {
    return handleServiceError(res, error);
  }
};

// 6. Seller counters.
export const counterOffer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const counter = parseFloat(req.body.counterPrice);
    const value = await counterOfferSvc(req.params.id, req.user.id, counter, req.body.message);
    return res.status(200).json({ message: 'Нархи ҷавобӣ фиристода шуд', counterPrice: value });
  } catch (error: any) {
    return handleServiceError(res, error);
  }
};

// 7. Buyer accepts the seller's counter-offer.
export const acceptCounter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const code = await acceptCounterSvc(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Нарх мувофиқа шуд', couponCode: code });
  } catch (error: any) {
    return handleServiceError(res, error);
  }
};
