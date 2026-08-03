import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { postToChannel, isTelegramConfigured } from '../services/telegramService';

// Social sharing: turn any product into a ready-to-post card for Telegram,
// WhatsApp and Instagram (Stories), so sellers spread listings in one tap.

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://bozor.tj';
const API_URL = process.env.PUBLIC_API_URL || '';

const effective = (p: { price: number; discountPrice: number | null; isOnDiscount: boolean }): number =>
  p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;

// Make an uploaded image path absolute so remote apps can fetch it.
const absImage = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return API_URL ? `${API_URL}${url}` : url;
};

const slugTag = (s: string): string =>
  '#' + s.trim().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');

// Build the shareable card payload for a product.
const buildCard = (product: any) => {
  const price = effective(product);
  const url = `${SITE_URL}/products/${product.id}`;
  const priceLine = product.isOnDiscount && product.discountPrice != null
    ? `💥 ${price} сомонӣ (пештар ${product.price})`
    : `💰 ${price} сомонӣ`;

  const caption = [
    `🛍️ ${product.name}`,
    priceLine,
    product.shop?.shopName ? `🏪 ${product.shop.shopName}` : '',
    '',
    `👉 ${url}`
  ].filter(Boolean).join('\n');

  const hashtags = Array.from(
    new Set([
      product.brand?.name && slugTag(product.brand.name),
      product.category?.name && slugTag(product.category.name),
      slugTag('BozorTJ'),
      slugTag('Тоҷикистон')
    ].filter(Boolean))
  );

  const imageUrl = absImage(product.images?.[0]?.url ?? null);
  const shareText = `${caption}\n\n${hashtags.join(' ')}`;

  return {
    productId: product.id,
    title: product.name,
    price,
    url,
    caption,
    hashtags,
    shareText,
    imageUrl,
    // Deep links the frontend can open directly.
    links: {
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      // Instagram has no web share URL — the app uses the image + caption via the
      // native share sheet (Web Share API) or a manual Stories post.
      instagram: null
    },
    telegramChannelAvailable: isTelegramConfigured()
  };
};

const CARD_INCLUDE = {
  images: { take: 1 },
  brand: true,
  category: true,
  shop: { select: { shopName: true, userId: true } }
};

// GET /api/share/products/:id/card  (public) — the shareable card payload.
export const getShareCard = async (req: AuthRequest, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: CARD_INCLUDE
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.status(200).json({ card: buildCard(product) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error building share card', error: error.message });
  }
};

// POST /api/share/products/:id/telegram  (SELLER) — one-tap post to the public
// Telegram channel. Only the product's owner may post it.
export const shareToTelegram = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: 'Telegram is not configured on the server' });
    }

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: CARD_INCLUDE
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only share your own products' });
    }

    const price = effective(product);
    await postToChannel({
      title: product.name,
      body: `${price} сомонӣ${product.shop.shopName ? ` — «${product.shop.shopName}»` : ''}`,
      productId: product.id,
      imageUrl: product.images?.[0]?.url ?? null
    });

    return res.status(200).json({ message: 'Мол ба канали Telegram нашр шуд ✅' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error sharing to Telegram', error: error.message });
  }
};
