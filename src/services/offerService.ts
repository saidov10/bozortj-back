import crypto from 'crypto';
import prisma from '../config/prisma';
import { createNotification } from './notificationService';
import { ServiceError } from '../utils/serviceError';

// Core price-bargaining logic, shared by the REST controller and the Telegram
// bot (so a seller can accept/reject an offer straight from a Telegram button).

export const OFFER_TTL_HOURS = 48;

export const effectiveUnitPrice = (product: {
  price: number;
  discountPrice: number | null;
  isOnDiscount: boolean;
}) => {
  if (product.isOnDiscount && product.discountPrice != null) return product.discountPrice;
  return product.price;
};

// Generate a single-use, buyer-locked FIXED coupon for the agreed price and
// mark the offer ACCEPTED. Returns the coupon code.
export const issueDealCoupon = async (params: {
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

// Load an offer and verify the given seller user owns its shop.
const loadOwnedOffer = async (offerId: string, sellerUserId: string) => {
  const shop = await prisma.shopProfile.findUnique({ where: { userId: sellerUserId } });
  if (!shop) throw new ServiceError(403, 'Shop profile not found');

  const offer = await prisma.priceOffer.findUnique({
    where: { id: offerId },
    include: { product: true }
  });
  if (!offer) throw new ServiceError(404, 'Offer not found');
  if (offer.shopId !== shop.id) throw new ServiceError(403, 'This offer is not for your shop');
  return offer;
};

export const acceptOffer = async (offerId: string, sellerUserId: string): Promise<string> => {
  const offer = await loadOwnedOffer(offerId, sellerUserId);
  if (offer.status !== 'PENDING') {
    throw new ServiceError(400, `Cannot accept an offer with status ${offer.status}`);
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

  return code;
};

export const rejectOffer = async (offerId: string, sellerUserId: string): Promise<void> => {
  const offer = await loadOwnedOffer(offerId, sellerUserId);
  if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
    throw new ServiceError(400, `Cannot reject an offer with status ${offer.status}`);
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
};

export const counterOffer = async (
  offerId: string,
  sellerUserId: string,
  counterPrice: number,
  message?: string
): Promise<number> => {
  const offer = await loadOwnedOffer(offerId, sellerUserId);
  if (offer.status !== 'PENDING') {
    throw new ServiceError(400, `Cannot counter an offer with status ${offer.status}`);
  }

  const current = effectiveUnitPrice(offer.product);
  if (isNaN(counterPrice) || counterPrice <= 0) {
    throw new ServiceError(400, 'counterPrice must be a positive number');
  }
  if (counterPrice <= offer.offeredPrice || counterPrice >= current) {
    throw new ServiceError(400, `Нархи ҷавобӣ бояд байни ${offer.offeredPrice} ва ${current} сомонӣ бошад`);
  }

  await prisma.priceOffer.update({
    where: { id: offer.id },
    data: {
      status: 'COUNTERED',
      counterPrice,
      message: message?.slice(0, 500) || offer.message,
      respondedAt: new Date()
    }
  });

  await createNotification(
    offer.buyerId,
    '🤝 Фурӯшанда нархи ҷавобӣ пешниҳод кард',
    `Барои "${offer.product.name}" фурӯшанда ${counterPrice} с. пешниҳод мекунад. Қабул мекунед?`,
    { type: 'OFFER_COUNTERED', offerId: offer.id, counterPrice, productId: offer.productId }
  );

  return counterPrice;
};

// Buyer accepts the seller's counter-offer → mint the deal coupon.
export const acceptCounter = async (offerId: string, buyerUserId: string): Promise<string> => {
  const offer = await prisma.priceOffer.findUnique({
    where: { id: offerId },
    include: { product: { include: { shop: { select: { userId: true } } } } }
  });
  if (!offer) throw new ServiceError(404, 'Offer not found');
  if (offer.buyerId !== buyerUserId) throw new ServiceError(403, 'This is not your offer');
  if (offer.status !== 'COUNTERED' || offer.counterPrice == null) {
    throw new ServiceError(400, 'There is no counter-offer to accept');
  }
  if (new Date(offer.expiresAt) < new Date()) {
    throw new ServiceError(400, 'This offer has expired');
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

  return code;
};
