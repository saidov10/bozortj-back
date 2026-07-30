import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAttributeFields } from '../config/categoryAttributes';
import { summarizeReviews, isAssistantConfigured } from '../services/assistantService';

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
          attributes: parsedAttributes ?? undefined
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

      // Create product images
      const imageRecords = files.map((file) => ({
        productId: newProduct.id,
        url: `/uploads/products/${file.filename}`
      }));

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
    if (stockQuantity) updateData.stockQuantity = parseInt(stockQuantity);

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

      // If new images are uploaded, add them
      if (files && files.length > 0) {
        const imageRecords = files.map((file) => ({
          productId: id,
          url: `/uploads/products/${file.filename}`
        }));

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

    return res.status(200).json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating product', error: error.message });
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
    const { categoryId, subcategoryId, brandId, colorId, size, shopId, search } = req.query;

    const where: any = {};

    if (categoryId) where.categoryId = categoryId as string;
    if (subcategoryId) where.subcategoryId = subcategoryId as string;
    if (brandId) where.brandId = brandId as string;
    if (colorId) where.colorId = colorId as string;
    if (size) where.size = { equals: size as string, mode: 'insensitive' };
    if (shopId) where.shopId = shopId as string;

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
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

    // Add averageRating to response
    const productsWithRating = products.map((product) => {
      const reviewCount = product.reviews.length;
      const averageRating =
        reviewCount > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
          : 0;

      // Omit detailed reviews from summary
      const { reviews, ...productData } = product;

      return {
        ...productData,
        averageRating,
        reviewCount
      };
    });

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
