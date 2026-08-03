import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAttributeFields } from '../config/categoryAttributes';
import { summarizeReviews, isAssistantConfigured, translateProduct } from '../services/assistantService';
import { buildProductImageRecords } from '../utils/thumbnail';
import { createLocalizedNotification } from '../services/notificationService';
import { notifyShopFollowers, notifyBackInStock } from '../services/engagementService';
import { notifyNewProductToSavedSearches } from '../services/savedSearchService';
import { postToChannel } from '../services/telegramService';

// Fire-and-forget: fill in Russian name/description via the AI translator, so a
// listing written in Tajik becomes bilingual without blocking the seller.
const autoTranslateProduct = (productId: string, name: string, description: string): void => {
  if (!isAssistantConfigured()) return;
  void (async () => {
    try {
      const ru = await translateProduct({ name, description, target: 'ru' });
      if (ru.name || ru.description) {
        await prisma.product.update({
          where: { id: productId },
          data: { nameRu: ru.name || undefined, descriptionRu: ru.description || undefined }
        });
      }
    } catch (err) {
      console.error('autoTranslateProduct failed:', err);
    }
  })();
};

// Effective selling price of a product right now (respects an active discount).
const effectivePrice = (p: { price: number; discountPrice: number | null; isOnDiscount: boolean }): number =>
  p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;

// A promotion counts as active only while it hasn't expired.
export const isPromotionActive = (p: { isPromoted: boolean; promotedUntil: Date | null }): boolean =>
  p.isPromoted && p.promotedUntil != null && p.promotedUntil.getTime() > Date.now();

// Validate that required category-specific attribute fields are present.
// Returns an array of missing field labels (empty if all good).
const findMissingAttributes = (
  categoryName: string | null | undefined,
  attributes: Record<string, any> | null
): string[] => {
  return getAttributeFields(categoryName)
    .filter((f) => f.required)
    .filter((f) => {
      const v = attributes ? attributes[f.key] : undefined;
      return v === undefined || v === null || v === '';
    })
    .map((f) => f.label);
};

// 1. Create Product (Seller Only)
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get seller's shop profile (with its category)
    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id },
      include: { category: true }
    });

    if (!shop) {
      return res.status(403).json({ message: 'Only sellers with a shop profile can create products' });
    }

    const { name, description, price, isOnDiscount, discountPrice, colorId, subcategoryId, size, stockQuantity, categoryId, brandId, variants, attributes } = req.body;

    // A shop can ONLY sell within the category it registered with.
    let effectiveCategoryId = categoryId;
    if (shop.categoryId) {
      if (categoryId && categoryId !== shop.categoryId) {
        return res.status(400).json({ message: `Your shop can only sell products in the "${shop.category?.name}" category` });
      }
      effectiveCategoryId = shop.categoryId;
    }
    if (!effectiveCategoryId) {
      return res.status(400).json({ message: 'Category ID is required' });
    }

    // "bez foto ne poluchaetsya dobavit" - Check that files are uploaded
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'At least one product photo is required' });
    }

    // Verify category, brand, and color exist
    const categoryExists = await prisma.category.findUnique({ where: { id: effectiveCategoryId } });
    const brandExists = await prisma.brand.findUnique({ where: { id: brandId } });
    const colorExists = await prisma.color.findUnique({ where: { id: colorId } });

    if (!categoryExists) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }
    if (!brandExists) {
      return res.status(400).json({ message: 'Invalid brand ID' });
    }
    if (!colorExists) {
      return res.status(400).json({ message: 'Invalid color ID' });
    }

    if (subcategoryId) {
      const subcategoryExists = await prisma.subcategory.findFirst({
        where: { id: subcategoryId, categoryId: effectiveCategoryId }
      });
      if (!subcategoryExists) {
        return res.status(400).json({ message: 'Invalid subcategory ID or subcategory does not belong to the selected category' });
      }
    }

    // Parse and validate category-specific attributes
    let parsedAttributes: Record<string, any> | null = null;
    if (attributes) {
      try {
        parsedAttributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
      } catch (e) {
        return res.status(400).json({ message: 'Invalid attributes JSON format' });
      }
    }
    // Only enforce required fields for shops that have a category (new sellers)
    if (shop.categoryId) {
      const missing = findMissingAttributes(shop.category?.name, parsedAttributes);
      if (missing.length > 0) {
        return res.status(400).json({ message: `Please fill in the required fields for this category: ${missing.join(', ')}` });
      }
    }

    const discountBool = isOnDiscount === 'true' || isOnDiscount === true;
    const finalDiscountPrice = discountPrice ? parseFloat(discountPrice) : null;

    // Direct sanity check
    if (discountBool && (finalDiscountPrice === null || finalDiscountPrice >= parseFloat(price))) {
      return res.status(400).json({ message: 'Discount price must be provided and must be less than the original price' });
    }

    // Parse variants if provided
    let parsedVariants: any[] = [];
    if (variants) {
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (e) {
        return res.status(400).json({ message: 'Invalid variants JSON format' });
      }
    }

    // Sum up variant stock quantities if variants are sent
    let totalStock = parseInt(stockQuantity);
    let finalBaseColorId = colorId;
    let finalBaseSize = size;

    if (parsedVariants.length > 0) {
      totalStock = parsedVariants.reduce((sum, v) => sum + parseInt(v.stockQuantity), 0);
      finalBaseColorId = parsedVariants[0].colorId;
      finalBaseSize = parsedVariants[0].size;
    }

    const product = await prisma.$transaction(async (tx) => {
      // Create product
      const newProduct = await tx.product.create({
        data: {
          shopId: shop.id,
          name,
          description,
          price: parseFloat(price),
          isOnDiscount: discountBool,
          discountPrice: discountBool ? finalDiscountPrice : null,
          colorId: finalBaseColorId,
          subcategoryId: subcategoryId || null,
          size: finalBaseSize,
          stockQuantity: totalStock,
          categoryId: effectiveCategoryId,
          brandId,
          attributes: parsedAttributes ?? undefined,
          warrantyMonths: req.body.warrantyMonths ? Math.max(0, parseInt(req.body.warrantyMonths) || 0) : 0
        }
      });

      // Create variants
      if (parsedVariants.length > 0) {
        const variantData = parsedVariants.map((v) => ({
          productId: newProduct.id,
          colorId: v.colorId,
          size: v.size,
          stockQuantity: parseInt(v.stockQuantity),
          price: v.price ? parseFloat(v.price) : null,
          discountPrice: v.discountPrice ? parseFloat(v.discountPrice) : null
        }));
        await tx.productVariant.createMany({ data: variantData });
      } else {
        // Create 1 default variant
        await tx.productVariant.create({
          data: {
            productId: newProduct.id,
            colorId,
            size,
            stockQuantity: parseInt(stockQuantity),
            price: null,
            discountPrice: null
          }
        });
      }

      // Create product images (with generated thumbnails)
      const imageRecords = await buildProductImageRecords(files, newProduct.id);

      await tx.productImage.createMany({
        data: imageRecords
      });

      return tx.product.findUnique({
        where: { id: newProduct.id },
        include: {
          images: true,
          category: true,
          subcategory: true,
          brand: true,
          color: true,
          variants: {
            include: { color: true }
          }
        }
      });
    });

    // Post-create hooks (best-effort, off the response path):
    if (product) {
      // Seed the price-history log with the launch price.
      prisma.priceHistory
        .create({ data: { productId: product.id, price: effectivePrice(product) } })
        .catch(() => undefined);

      // Auto-generate the Russian translation.
      autoTranslateProduct(product.id, product.name, product.description);

      // Tell the shop's followers a new product just landed.
      void notifyShopFollowers(
        shop.id,
        `${shop.shopName}: моли нав 🆕`,
        `Мағозаи «${shop.shopName}» моли нав гузошт: «${product.name}».`,
        { type: 'NEW_PRODUCT', productId: product.id, shopId: shop.id }
      );

      // Alert buyers whose saved search matches this new product.
      void notifyNewProductToSavedSearches(product.id);
    }

    return res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating product', error: error.message });
  }
};

// 2. Update Product (Seller Only)
export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { name, description, price, isOnDiscount, discountPrice, colorId, subcategoryId, size, stockQuantity, categoryId, brandId, attributes } = req.body;

    const product = await prisma.product.findUnique({
      where: { id },
      include: { shop: { include: { category: true } }, images: true }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check ownership
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;
    
    let finalPrice = product.price;
    if (price) {
      finalPrice = parseFloat(price);
      updateData.price = finalPrice;
    }

    let finalIsOnDiscount = product.isOnDiscount;
    if (isOnDiscount !== undefined) {
      finalIsOnDiscount = isOnDiscount === 'true' || isOnDiscount === true;
      updateData.isOnDiscount = finalIsOnDiscount;
    }

    let finalDiscountPrice = product.discountPrice;
    if (discountPrice !== undefined) {
      finalDiscountPrice = discountPrice ? parseFloat(discountPrice) : null;
      updateData.discountPrice = finalDiscountPrice;
    }

    // Validation checks for final discount status
    if (finalIsOnDiscount) {
      if (finalDiscountPrice === null || finalDiscountPrice >= finalPrice) {
        return res.status(400).json({ message: 'Discount price must be provided and must be less than the original price' });
      }
      updateData.discountPrice = finalDiscountPrice;
    } else {
      updateData.discountPrice = null;
    }

    if (size) updateData.size = size;
    if (stockQuantity) {
      const newStock = parseInt(stockQuantity);
      updateData.stockQuantity = newStock;
      // Restocked above the alert threshold → re-arm the low-stock alert so the
      // seller is notified again next time it runs low.
      if (newStock > product.lowStockThreshold) {
        updateData.lowStockNotified = false;
      }
    }
    // Allow the seller to tune their own low-stock alert threshold.
    if (req.body.lowStockThreshold !== undefined && req.body.lowStockThreshold !== '') {
      const threshold = parseInt(req.body.lowStockThreshold);
      if (!isNaN(threshold) && threshold >= 0) updateData.lowStockThreshold = threshold;
    }
    // Warranty length in months.
    if (req.body.warrantyMonths !== undefined && req.body.warrantyMonths !== '') {
      const wm = parseInt(req.body.warrantyMonths);
      if (!isNaN(wm) && wm >= 0) updateData.warrantyMonths = wm;
    }
    // Auto-accept floor for price offers (empty string clears it).
    if (req.body.minAcceptablePrice !== undefined) {
      if (req.body.minAcceptablePrice === '' || req.body.minAcceptablePrice === null) {
        updateData.minAcceptablePrice = null;
      } else {
        const floor = parseFloat(req.body.minAcceptablePrice);
        if (!isNaN(floor) && floor >= 0) updateData.minAcceptablePrice = floor;
      }
    }

    if (colorId) {
      const colorExists = await prisma.color.findUnique({ where: { id: colorId } });
      if (!colorExists) return res.status(400).json({ message: 'Invalid color ID' });
      updateData.colorId = colorId;
    }

    // A shop is locked to its registered category — block moving the product out of it
    if (categoryId && product.shop.categoryId && categoryId !== product.shop.categoryId) {
      return res.status(400).json({ message: `Your shop can only sell products in the "${product.shop.category?.name}" category` });
    }

    const finalCategoryId = categoryId || product.categoryId;
    if (categoryId) {
      const categoryExists = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!categoryExists) return res.status(400).json({ message: 'Invalid category ID' });
      updateData.categoryId = categoryId;
    }

    // Update category-specific attributes if provided (replaces the whole object)
    if (attributes !== undefined) {
      if (attributes === '' || attributes === null) {
        updateData.attributes = Prisma.JsonNull;
      } else {
        try {
          updateData.attributes = typeof attributes === 'string' ? JSON.parse(attributes) : attributes;
        } catch (e) {
          return res.status(400).json({ message: 'Invalid attributes JSON format' });
        }
      }
    }

    if (subcategoryId) {
      const subcategoryExists = await prisma.subcategory.findFirst({
        where: { id: subcategoryId, categoryId: finalCategoryId }
      });
      if (!subcategoryExists) {
        return res.status(400).json({ message: 'Invalid subcategory ID or subcategory does not belong to the selected category' });
      }
      updateData.subcategoryId = subcategoryId;
    } else if (subcategoryId === null || subcategoryId === '') {
      updateData.subcategoryId = null;
    }

    if (brandId) {
      const brandExists = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brandExists) return res.status(400).json({ message: 'Invalid brand ID' });
      updateData.brandId = brandId;
    }

    const files = req.files as Express.Multer.File[];

    const updatedProduct = await prisma.$transaction(async (tx) => {
      // Update basic details
      await tx.product.update({
        where: { id },
        data: updateData
      });

      // If new images are uploaded, add them (with generated thumbnails)
      if (files && files.length > 0) {
        const imageRecords = await buildProductImageRecords(files, id);

        await tx.productImage.createMany({
          data: imageRecords
        });
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          images: true,
          category: true,
          subcategory: true,
          brand: true,
          color: true,
          variants: {
            include: { color: true }
          }
        }
      });
    });

    // Price-drop alert: if the effective selling price went down, notify every
    // buyer who has this product on their wishlist (in their own language,
    // mirrored to Telegram / web push). Fire-and-forget so it never blocks the
    // seller's response.
    if (updatedProduct) {
      const oldPrice = effectivePrice(product);
      const newPrice = effectivePrice(updatedProduct);

      // Price changed → append to the price-history log; if it dropped, alert
      // everyone who wishlisted it.
      if (newPrice !== oldPrice) {
        prisma.priceHistory
          .create({ data: { productId: updatedProduct.id, price: newPrice } })
          .catch(() => undefined);
        if (newPrice < oldPrice) {
          void notifyWishlistPriceDrop(updatedProduct.id, updatedProduct.name, oldPrice, newPrice);
        }
      }

      // Restocked from zero → notify "back in stock" subscribers.
      if (product.stockQuantity <= 0 && updatedProduct.stockQuantity > 0) {
        void notifyBackInStock(updatedProduct.id);
      }

      // Name/description changed → refresh the Russian translation.
      if (updateData.name !== undefined || updateData.description !== undefined) {
        autoTranslateProduct(updatedProduct.id, updatedProduct.name, updatedProduct.description);
      }
    }

    return res.status(200).json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating product', error: error.message });
  }
};

// Notify wishlist owners about a price drop on a product they saved.
const notifyWishlistPriceDrop = async (
  productId: string,
  productName: string,
  oldPrice: number,
  newPrice: number
): Promise<void> => {
  try {
    const savers = await prisma.wishlistItem.findMany({
      where: { productId },
      select: { userId: true }
    });
    for (const { userId } of savers) {
      await createLocalizedNotification(
        userId,
        'priceDrop',
        { productName, oldPrice: oldPrice.toFixed(2), newPrice: newPrice.toFixed(2) },
        { type: 'PRICE_DROP', productId }
      );
    }
  } catch (err) {
    console.error('Price-drop notification failed:', err);
  }
};

// 3. Delete Product (Seller Only)
export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: { shop: true }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check ownership
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    await prisma.product.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting product', error: error.message });
  }
};

// 4. Get All Products with Filters (Public)
export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, subcategoryId, brandId, colorId, size, shopId, search, sort, promoted, minPrice, maxPrice } = req.query;

    const where: any = {};

    if (categoryId) where.categoryId = categoryId as string;
    if (subcategoryId) where.subcategoryId = subcategoryId as string;
    if (brandId) where.brandId = brandId as string;
    if (colorId) where.colorId = colorId as string;
    if (size) where.size = { equals: size as string, mode: 'insensitive' };
    if (shopId) where.shopId = shopId as string;

    // Price range filter (matches on base price).
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    // Only currently-active promotions.
    if (promoted === 'true') {
      where.isPromoted = true;
      where.promotedUntil = { gt: new Date() };
    }

    // Full-text-ish search: case-insensitive, multi-term (AND across terms),
    // spanning product name/description plus brand, category and subcategory
    // names — so "samsung telefon" matches by brand + category too.
    if (search) {
      const terms = (search as string).trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (terms.length > 0) {
        where.AND = terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { brand: { name: { contains: term, mode: 'insensitive' } } },
            { category: { name: { contains: term, mode: 'insensitive' } } },
            { subcategory: { name: { contains: term, mode: 'insensitive' } } }
          ]
        }));
      }
    }

    // Sort: explicit user choice, else promoted-active first then newest.
    let orderBy: any;
    switch (sort) {
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'newest': orderBy = { createdAt: 'desc' }; break;
      case 'popular': orderBy = { viewCount: 'desc' }; break;
      default: orderBy = [{ isPromoted: 'desc' }, { createdAt: 'desc' }];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        images: true,
        category: true,
        subcategory: true,
        brand: true,
        color: true,
        variants: {
          include: { color: true }
        },
        shop: {
          select: {
            id: true,
            shopName: true
          }
        },
        reviews: {
          select: {
            rating: true
          }
        }
      }
    });

    // Add averageRating to response and surface the live promotion flag.
    let productsWithRating = products.map((product) => {
      const reviewCount = product.reviews.length;
      const averageRating =
        reviewCount > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
          : 0;

      // Omit detailed reviews from summary
      const { reviews, ...productData } = product;

      return {
        ...productData,
        isPromotedActive: isPromotionActive(product),
        averageRating,
        reviewCount
      };
    });

    // With the default ordering, keep only *active* promotions ahead of the rest
    // (an expired promotion still has isPromoted=true in the DB until cleaned up).
    if (!sort || (sort !== 'price_asc' && sort !== 'price_desc' && sort !== 'newest' && sort !== 'popular')) {
      productsWithRating = productsWithRating.sort((a, b) => {
        if (a.isPromotedActive !== b.isPromotedActive) return a.isPromotedActive ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return res.status(200).json({ products: productsWithRating });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving products', error: error.message });
  }
};

// 5. Get Single Product details (Public)
export const getProductById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        category: true,
        subcategory: true,
        brand: true,
        color: true,
        variants: {
          include: { color: true }
        },
        shop: {
          select: {
            id: true,
            shopName: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                avatarUrl: true
              }
            }
          }
        },
        reviews: {
          orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
          include: {
            images: true,
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Record the view: bump the aggregate counter (drives conversion analytics)
    // and, for a logged-in buyer, refresh their "recently viewed" trail. Both are
    // best-effort and never block the response.
    prisma.product
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    if (req.user && req.user.role === 'BUYER') {
      const buyerId = req.user.id;
      prisma.recentlyViewed
        .upsert({
          where: { userId_productId: { userId: buyerId, productId: id } },
          update: { viewedAt: new Date() },
          create: { userId: buyerId, productId: id }
        })
        .catch(() => undefined);
    }

    const reviewCount = product.reviews.length;
    const averageRating =
      reviewCount > 0
        ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : 0;

    return res.status(200).json({
      product: {
        ...product,
        averageRating,
        reviewCount
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving product', error: error.message });
  }
};

// Helper: shape a raw product record with averageRating/reviewCount
const withRatingSummary = (product: any) => {
  const reviews = product.reviews || [];
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0
    ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
    : 0;
  const { reviews: _reviews, ...productData } = product;
  return { ...productData, averageRating, reviewCount };
};

const RECOMMENDATION_INCLUDE = {
  images: true,
  category: true,
  subcategory: true,
  brand: true,
  color: true,
  variants: { include: { color: true } },
  shop: { select: { id: true, shopName: true } },
  reviews: { select: { rating: true } }
};

// 5b. Get Product Recommendations (Public)
// Combines "customers who bought this also bought" with a category-based fallback.
export const getProductRecommendations = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = 8;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // 1. Collaborative: find other products bought together with this one
    const coOrderItems = await prisma.orderItem.findMany({
      where: { variant: { productId: id } },
      select: { orderId: true }
    });
    const orderIds = Array.from(new Set(coOrderItems.map((o) => o.orderId)));

    const relatedIdScores: Record<string, number> = {};
    if (orderIds.length > 0) {
      const otherItems = await prisma.orderItem.findMany({
        where: {
          orderId: { in: orderIds },
          variant: { productId: { not: id } }
        },
        select: { variant: { select: { productId: true } } }
      });
      otherItems.forEach((item) => {
        const pid = item.variant.productId;
        relatedIdScores[pid] = (relatedIdScores[pid] || 0) + 1;
      });
    }

    const collaborativeIds = Object.entries(relatedIdScores)
      .sort((a, b) => b[1] - a[1])
      .map(([pid]) => pid)
      .slice(0, limit);

    let recommended: any[] = [];
    if (collaborativeIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: collaborativeIds } },
        include: RECOMMENDATION_INCLUDE
      });
      // Preserve co-purchase ranking order
      const byId = new Map(products.map((p) => [p.id, p]));
      recommended = collaborativeIds.map((pid) => byId.get(pid)).filter(Boolean);
    }

    // 2. Fallback / fill remaining slots: same category, excluding current + already picked
    if (recommended.length < limit) {
      const excludeIds = [id, ...recommended.map((p) => p.id)];
      const fillers = await prisma.product.findMany({
        where: {
          categoryId: product.categoryId,
          id: { notIn: excludeIds }
        },
        include: RECOMMENDATION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit - recommended.length
      });
      recommended = [...recommended, ...fillers];
    }

    return res.status(200).json({
      recommendations: recommended.map(withRatingSummary)
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving recommendations', error: error.message });
  }
};

// 6. Add Review (Buyer Only)
export const addReview = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id: productId } = req.params;
    const { rating, comment } = req.body;

    // Verify buyer role
    if (req.user.role !== 'BUYER') {
      return res.status(403).json({ message: 'Only buyers can add reviews' });
    }

    const productExists = await prisma.product.findUnique({ where: { id: productId } });
    if (!productExists) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if review already exists
    const existingReview = await prisma.review.findFirst({
      where: {
        productId,
        userId: req.user.id
      }
    });

    const files = req.files as Express.Multer.File[];

    const review = await prisma.$transaction(async (tx) => {
      let reviewRecord;
      if (existingReview) {
        reviewRecord = await tx.review.update({
          where: { id: existingReview.id },
          data: {
            rating: parseInt(rating),
            comment
          }
        });
        // Remove old images if new ones are uploaded
        if (files && files.length > 0) {
          await tx.reviewImage.deleteMany({
            where: { reviewId: reviewRecord.id }
          });
        }
      } else {
        reviewRecord = await tx.review.create({
          data: {
            userId: req.user!.id,
            productId,
            rating: parseInt(rating),
            comment
          }
        });
      }

      if (files && files.length > 0) {
        const imageRecords = files.map((file) => ({
          reviewId: reviewRecord.id,
          url: `/uploads/reviews/${file.filename}`
        }));
        await tx.reviewImage.createMany({ data: imageRecords });
      }

      return tx.review.findUnique({
        where: { id: reviewRecord.id },
        include: { images: true }
      });
    });

    return res.status(200).json({
      message: 'Review saved successfully',
      review
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error saving review', error: error.message });
  }
};

// 7. Reply to Review (Seller Only)
export const replyToReview = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params; // Review ID
    const { reply } = req.body;

    if (req.user.role !== 'SELLER') {
      return res.status(403).json({ message: 'Only sellers can reply to reviews' });
    }

    if (!reply || reply.trim() === '') {
      return res.status(400).json({ message: 'Reply text cannot be empty' });
    }

    // Verify shop profile exists for the seller
    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id }
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop profile not found' });
    }

    // Find review and check if product belongs to the seller's shop
    const review = await prisma.review.findUnique({
      where: { id },
      include: {
        product: true
      }
    });

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    if (review.product.shopId !== shop.id) {
      return res.status(403).json({ message: 'You can only reply to reviews for your own products' });
    }

    const updatedReview = await prisma.review.update({
      where: { id },
      data: {
        sellerReply: reply,
        sellerReplyAt: new Date()
      },
      include: {
        images: true
      }
    });

    return res.status(200).json({
      message: 'Reply added successfully',
      review: updatedReview
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error replying to review', error: error.message });
  }
};

// 8. AI Review Summary (Public) — GET /api/products/:id/review-summary
// Returns a cached AI pros/cons/verdict summary, regenerating it only when the
// number of reviewed comments has grown since the last summary.
const MIN_REVIEWS_FOR_SUMMARY = 3;

export const getReviewSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        reviewSummary: true,
        reviewSummaryAt: true,
        reviewSummaryCount: true,
        reviews: {
          where: { comment: { not: null } },
          select: { rating: true, comment: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const commented = product.reviews
      .filter((r) => r.comment && r.comment.trim() !== '')
      .map((r) => ({ rating: r.rating, comment: r.comment as string }));

    if (commented.length < MIN_REVIEWS_FOR_SUMMARY) {
      return res.status(200).json({
        available: false,
        message: 'Not enough reviews to summarize yet',
        reviewCount: commented.length
      });
    }

    // Serve cache if the review count hasn't changed since last summary.
    if (product.reviewSummary && product.reviewSummaryCount === commented.length) {
      return res.status(200).json({
        available: true,
        summary: product.reviewSummary,
        basedOnReviews: product.reviewSummaryCount,
        generatedAt: product.reviewSummaryAt,
        cached: true
      });
    }

    // Need to (re)generate — requires the AI to be configured.
    if (!isAssistantConfigured()) {
      if (product.reviewSummary) {
        return res.status(200).json({
          available: true,
          summary: product.reviewSummary,
          basedOnReviews: product.reviewSummaryCount,
          generatedAt: product.reviewSummaryAt,
          cached: true,
          stale: true
        });
      }
      return res.status(503).json({ message: 'AI assistant is not configured. Set GROQ_API_KEY on the server.' });
    }

    const summary = await summarizeReviews(product.name, commented);
    const generatedAt = new Date();

    await prisma.product.update({
      where: { id },
      data: {
        reviewSummary: summary as any,
        reviewSummaryAt: generatedAt,
        reviewSummaryCount: commented.length
      }
    });

    return res.status(200).json({
      available: true,
      summary,
      basedOnReviews: commented.length,
      generatedAt,
      cached: false
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error summarizing reviews', error: error.message });
  }
};

// 9. Search Suggestions / Autocomplete (Public) — GET /api/products/search/suggestions?q=
// Lightweight typeahead: returns matching product names, brands and categories so
// the frontend can render a dropdown as the buyer types.
export const getSearchSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) {
      return res.status(200).json({ products: [], brands: [], categories: [] });
    }

    const [products, brands, categories] = await Promise.all([
      prisma.product.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        orderBy: { viewCount: 'desc' },
        take: 6
      }),
      prisma.brand.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 4
      }),
      prisma.category.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 4
      })
    ]);

    return res.status(200).json({ products, brands, categories });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error fetching suggestions', error: error.message });
  }
};

// 10. Recently Viewed (Buyer) — GET /api/products/discovery/recently-viewed
// The buyer's browsing trail, most recent first.
export const getRecentlyViewed = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const rows = await prisma.recentlyViewed.findMany({
      where: { userId: req.user.id },
      orderBy: { viewedAt: 'desc' },
      take: 12,
      include: { product: { include: RECOMMENDATION_INCLUDE } }
    });

    const products = rows
      .filter((r) => r.product)
      .map((r) => ({ ...withRatingSummary(r.product), viewedAt: r.viewedAt }));

    return res.status(200).json({ products });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving recently viewed', error: error.message });
  }
};

// 11. Compare Products (Public) — GET /api/products/discovery/compare?ids=a,b,c
// Returns 2–4 products side by side with a unified attribute key set, so the
// frontend can render a spec-comparison table without gaps.
export const compareProducts = async (req: AuthRequest, res: Response) => {
  try {
    const ids = (req.query.ids as string || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);

    if (ids.length < 2) {
      return res.status(400).json({ message: 'Provide at least 2 product ids to compare (ids=a,b)' });
    }

    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        images: true,
        category: true,
        subcategory: true,
        brand: true,
        color: true,
        variants: { include: { color: true } },
        shop: { select: { id: true, shopName: true } },
        reviews: { select: { rating: true } }
      }
    });

    // Preserve the requested order.
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof products;

    // Union of all attribute keys across the compared products, so the table has
    // one row per spec even when a product is missing that spec.
    const attributeKeys = new Set<string>();
    ordered.forEach((p) => {
      if (p.attributes && typeof p.attributes === 'object') {
        Object.keys(p.attributes as Record<string, any>).forEach((k) => attributeKeys.add(k));
      }
    });

    return res.status(200).json({
      attributeKeys: Array.from(attributeKeys),
      products: ordered.map(withRatingSummary)
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error comparing products', error: error.message });
  }
};

// 12. Promoted Products (Public) — GET /api/products/discovery/promoted
// Active featured products for the homepage carousel.
export const getPromotedProducts = async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { isPromoted: true, promotedUntil: { gt: new Date() } },
      orderBy: { promotedUntil: 'desc' },
      take: 12,
      include: RECOMMENDATION_INCLUDE
    });
    return res.status(200).json({ products: products.map(withRatingSummary) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving promoted products', error: error.message });
  }
};

// 13. Promote a Product (Seller) — POST /api/products/:id/promote  { days }
// Seller pays to feature their product. This is a mock-payment scaffold (same
// pattern as the online-payment MOCK provider): it activates the promotion
// immediately and is ready to gate behind a real charge later.
const PROMOTION_DAILY_RATE = 5; // somoni per day (informational, returned to UI)

export const promoteProduct = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const days = Math.min(Math.max(parseInt(req.body.days) || 7, 1), 30); // clamp 1..30

    const product = await prisma.product.findUnique({
      where: { id },
      include: { shop: true }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    // Extend from the later of "now" or an existing active promotion.
    const base = isPromotionActive(product) ? product.promotedUntil! : new Date();
    const promotedUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const updated = await prisma.product.update({
      where: { id },
      data: { isPromoted: true, promotedUntil }
    });

    // Cross-post the freshly promoted product to the public Telegram channel.
    const promoImage = await prisma.productImage.findFirst({ where: { productId: id }, select: { url: true } });
    void postToChannel({
      title: `⭐ Тавсия — ${product.name}`,
      body: `${effectivePrice(product)} сомонӣ дар мағозаи «${product.shop.shopName}».`,
      productId: id,
      imageUrl: promoImage?.url ?? null
    });

    return res.status(200).json({
      message: `Product promoted for ${days} day(s)`,
      cost: days * PROMOTION_DAILY_RATE,
      dailyRate: PROMOTION_DAILY_RATE,
      promotedUntil: updated.promotedUntil,
      product: { id: updated.id, isPromoted: updated.isPromoted, promotedUntil: updated.promotedUntil }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error promoting product', error: error.message });
  }
};

// 14. Trending products (Public) — GET /api/products/discovery/trending
// "🔥 Тренди ҳафта": ranks products by recent momentum — views and units sold in
// the last 7 days (sales weighted heavier than views).
export const getTrendingProducts = async (req: AuthRequest, res: Response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const VIEW_WEIGHT = 1;
    const SALE_WEIGHT = 3;

    const [recentViews, recentSales] = await Promise.all([
      prisma.recentlyViewed.groupBy({
        by: ['productId'],
        where: { viewedAt: { gte: since } },
        _count: { productId: true }
      }),
      prisma.orderItem.findMany({
        where: { order: { createdAt: { gte: since }, status: { not: 'CANCELLED' } } },
        select: { quantity: true, variant: { select: { productId: true } } }
      })
    ]);

    const score: Record<string, number> = {};
    recentViews.forEach((v) => {
      score[v.productId] = (score[v.productId] || 0) + v._count.productId * VIEW_WEIGHT;
    });
    recentSales.forEach((s) => {
      const pid = s.variant.productId;
      score[pid] = (score[pid] || 0) + s.quantity * SALE_WEIGHT;
    });

    const topIds = Object.entries(score)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id]) => id);

    // Fallback for a fresh catalog with no recent activity: newest products.
    if (topIds.length === 0) {
      const newest = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: RECOMMENDATION_INCLUDE
      });
      return res.status(200).json({ products: newest.map(withRatingSummary) });
    }

    const products = await prisma.product.findMany({
      where: { id: { in: topIds } },
      include: RECOMMENDATION_INCLUDE
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = topIds.map((id) => byId.get(id)).filter(Boolean);

    return res.status(200).json({
      products: ordered.map((p) => ({ ...withRatingSummary(p), trendScore: score[(p as any).id] }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving trending products', error: error.message });
  }
};

// 15b. Personalized "For You" feed (Buyer) — GET /api/products/discovery/for-you
// Ranks the catalogue against the buyer's own behaviour: the categories & brands
// they viewed, wishlisted and bought. Cold-start falls back to trending/newest.
export const getForYouFeed = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const userId = req.user.id;
    const limit = 16;

    // Gather behaviour signals in parallel.
    const [viewed, wishlisted, purchased] = await Promise.all([
      prisma.recentlyViewed.findMany({
        where: { userId },
        orderBy: { viewedAt: 'desc' },
        take: 50,
        select: { productId: true, product: { select: { categoryId: true, brandId: true } } }
      }),
      prisma.wishlistItem.findMany({
        where: { userId },
        select: { productId: true, product: { select: { categoryId: true, brandId: true } } }
      }),
      prisma.orderItem.findMany({
        where: { order: { userId } },
        select: { variant: { select: { productId: true, product: { select: { categoryId: true, brandId: true } } } } }
      })
    ]);

    // Weight signals: a purchase says more than a wishlist, which says more than a view.
    const catScore: Record<string, number> = {};
    const brandScore: Record<string, number> = {};
    const bump = (cat: string | null | undefined, brand: string | null | undefined, w: number) => {
      if (cat) catScore[cat] = (catScore[cat] || 0) + w;
      if (brand) brandScore[brand] = (brandScore[brand] || 0) + w;
    };
    viewed.forEach((v) => bump(v.product?.categoryId, v.product?.brandId, 1));
    wishlisted.forEach((w) => bump(w.product?.categoryId, w.product?.brandId, 2));
    purchased.forEach((p) => bump(p.variant.product?.categoryId, p.variant.product?.brandId, 3));

    const seenIds = new Set<string>([
      ...viewed.map((v) => v.productId),
      ...wishlisted.map((w) => w.productId),
      ...purchased.map((p) => p.variant.productId)
    ]);

    const topCats = Object.keys(catScore).sort((a, b) => catScore[b] - catScore[a]).slice(0, 6);
    const topBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]).slice(0, 6);

    // Cold start: no history → fall back to newest in-stock products.
    if (topCats.length === 0 && topBrands.length === 0) {
      const newest = await prisma.product.findMany({
        where: { stockQuantity: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: RECOMMENDATION_INCLUDE
      });
      return res.status(200).json({ products: newest.map(withRatingSummary), personalized: false });
    }

    // Candidate pool: products in the buyer's favourite categories/brands, unseen.
    const candidates = await prisma.product.findMany({
      where: {
        id: { notIn: Array.from(seenIds) },
        OR: [{ categoryId: { in: topCats } }, { brandId: { in: topBrands } }]
      },
      take: 80,
      include: RECOMMENDATION_INCLUDE
    });

    const scored = candidates
      .map((p) => {
        let score = (catScore[p.categoryId] || 0) * 2 + (brandScore[p.brandId] || 0);
        if (p.isOnDiscount) score += 1.5;         // nudge deals up
        if (p.stockQuantity > 0) score += 0.5;    // prefer in-stock
        score += Math.min(p.viewCount, 100) / 200; // gentle popularity tiebreak
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Fill from newest if the affine pool was thin.
    let products = scored.map((s) => s.p);
    if (products.length < limit) {
      const exclude = new Set([...seenIds, ...products.map((p) => p.id)]);
      const fillers = await prisma.product.findMany({
        where: { id: { notIn: Array.from(exclude) }, stockQuantity: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: limit - products.length,
        include: RECOMMENDATION_INCLUDE
      });
      products = [...products, ...fillers];
    }

    return res.status(200).json({ products: products.map(withRatingSummary), personalized: true });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error building your feed', error: error.message });
  }
};

// 16. Vote a review helpful (Buyer) — POST /api/products/reviews/:reviewId/helpful
// Toggling: voting again removes the vote. helpfulCount stays in sync.
export const toggleReviewHelpful = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { reviewId } = req.params;

    const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
    if (!review) return res.status(404).json({ message: 'Review not found' });

    const existing = await prisma.reviewVote.findUnique({
      where: { userId_reviewId: { userId: req.user.id, reviewId } }
    });

    let voted: boolean;
    if (existing) {
      await prisma.$transaction([
        prisma.reviewVote.delete({ where: { id: existing.id } }),
        prisma.review.update({ where: { id: reviewId }, data: { helpfulCount: { decrement: 1 } } })
      ]);
      voted = false;
    } else {
      await prisma.$transaction([
        prisma.reviewVote.create({ data: { userId: req.user.id, reviewId } }),
        prisma.review.update({ where: { id: reviewId }, data: { helpfulCount: { increment: 1 } } })
      ]);
      voted = true;
    }

    const updated = await prisma.review.findUnique({ where: { id: reviewId }, select: { helpfulCount: true } });
    return res.status(200).json({ voted, helpfulCount: updated?.helpfulCount ?? 0 });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error voting on review', error: error.message });
  }
};

// 15. Price history (Public) — GET /api/products/:id/price-history
// Powers the "how the price changed" chart on the product page.
export const getPriceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const history = await prisma.priceHistory.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'asc' },
      select: { price: true, createdAt: true }
    });
    return res.status(200).json({ history });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving price history', error: error.message });
  }
};
