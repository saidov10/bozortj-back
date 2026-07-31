import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { notifyShopFollowers } from '../services/engagementService';
import { postToChannel } from '../services/telegramService';

const flashSaleProductInclude = {
  product: {
    include: {
      images: { take: 1 },
      brand: true,
      category: true,
      shop: { select: { id: true, shopName: true } }
    }
  }
};

// Shape one flash sale for the API, adding live/derived fields.
const shapeFlashSale = (fs: any) => {
  const now = new Date();
  const isActive = fs.startsAt <= now && fs.endsAt > now;
  const isSoldOut = fs.stockLimit != null && fs.soldCount >= fs.stockLimit;
  return {
    id: fs.id,
    productId: fs.productId,
    salePrice: fs.salePrice,
    originalPrice: fs.product?.price ?? null,
    startsAt: fs.startsAt,
    endsAt: fs.endsAt,
    soldCount: fs.soldCount,
    stockLimit: fs.stockLimit,
    isActive: isActive && !isSoldOut,
    isSoldOut,
    secondsRemaining: Math.max(0, Math.floor((new Date(fs.endsAt).getTime() - now.getTime()) / 1000)),
    product: fs.product
      ? {
          id: fs.product.id,
          name: fs.product.name,
          price: fs.product.price,
          image: fs.product.images?.[0]?.url ?? null,
          brand: fs.product.brand?.name ?? null,
          category: fs.product.category?.name ?? null,
          shopName: fs.product.shop?.shopName ?? null,
          stockQuantity: fs.product.stockQuantity
        }
      : null
  };
};

// 1. Create a flash sale (Seller only)
export const createFlashSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Only sellers with a shop can create flash sales' });

    const { productId, salePrice, startsAt, endsAt, stockLimit } = req.body;

    if (!productId || salePrice === undefined || !endsAt) {
      return res.status(400).json({ message: 'productId, salePrice and endsAt are required' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shopId !== shop.id) {
      return res.status(403).json({ message: 'You can only put your own products on sale' });
    }

    const price = parseFloat(salePrice);
    if (isNaN(price) || price <= 0 || price >= product.price) {
      return res.status(400).json({ message: 'Sale price must be a positive number below the product price' });
    }

    const start = startsAt ? new Date(startsAt) : new Date();
    const end = new Date(endsAt);
    if (isNaN(end.getTime()) || end <= new Date()) {
      return res.status(400).json({ message: 'endsAt must be a valid future date' });
    }
    if (end <= start) {
      return res.status(400).json({ message: 'endsAt must be after startsAt' });
    }

    let limit: number | null = null;
    if (stockLimit !== undefined && stockLimit !== null && stockLimit !== '') {
      limit = parseInt(stockLimit, 10);
      if (isNaN(limit) || limit <= 0) {
        return res.status(400).json({ message: 'stockLimit must be a positive whole number' });
      }
    }

    const flashSale = await prisma.flashSale.create({
      data: {
        productId,
        shopId: shop.id,
        salePrice: price,
        startsAt: start,
        endsAt: end,
        stockLimit: limit
      },
      include: flashSaleProductInclude
    });

    // Announce the sale: alert the shop's followers and cross-post to the public
    // Telegram channel (both best-effort, off the response path).
    const image = flashSale.product?.images?.[0]?.url ?? null;
    void notifyShopFollowers(
      shop.id,
      `⚡ Flash Sale: ${shop.shopName}`,
      `«${product.name}» — ${price} с. (пештар ${product.price} с.). Шитоб кунед!`,
      { type: 'FLASH_SALE', flashSaleId: flashSale.id, productId }
    );
    void postToChannel({
      title: `⚡ Flash Sale — ${product.name}`,
      body: `Танҳо ${price} сомонӣ (пештар ${product.price} с.) дар мағозаи «${shop.shopName}». Шумораш маҳдуд!`,
      productId,
      imageUrl: image
    });

    return res.status(201).json({ message: 'Flash sale created', flashSale: shapeFlashSale(flashSale) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating flash sale', error: error.message });
  }
};

// 2. List active flash sales (Public) — for the homepage banner/section
export const getActiveFlashSales = async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const sales = await prisma.flashSale.findMany({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      include: flashSaleProductInclude,
      orderBy: { endsAt: 'asc' }
    });

    const shaped = sales.map(shapeFlashSale).filter((s) => !s.isSoldOut);
    return res.status(200).json({ flashSales: shaped });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving flash sales', error: error.message });
  }
};

// 3. Get one flash sale (Public)
export const getFlashSaleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const flashSale = await prisma.flashSale.findUnique({
      where: { id },
      include: flashSaleProductInclude
    });
    if (!flashSale) return res.status(404).json({ message: 'Flash sale not found' });
    return res.status(200).json({ flashSale: shapeFlashSale(flashSale) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving flash sale', error: error.message });
  }
};

// 4. List my flash sales (Seller)
export const getMyFlashSales = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });

    const sales = await prisma.flashSale.findMany({
      where: { shopId: shop.id },
      include: flashSaleProductInclude,
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ flashSales: sales.map(shapeFlashSale) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving flash sales', error: error.message });
  }
};

// 5. Delete/cancel a flash sale (Seller — own only)
export const deleteFlashSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;

    const flashSale = await prisma.flashSale.findUnique({ where: { id } });
    if (!flashSale) return res.status(404).json({ message: 'Flash sale not found' });

    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop || flashSale.shopId !== shop.id) {
      return res.status(403).json({ message: 'You can only cancel your own flash sales' });
    }

    await prisma.flashSale.delete({ where: { id } });
    return res.status(200).json({ message: 'Flash sale cancelled' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting flash sale', error: error.message });
  }
};
