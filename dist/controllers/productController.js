"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyToReview = exports.addReview = exports.getProductById = exports.getProducts = exports.deleteProduct = exports.updateProduct = exports.createProduct = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Create Product (Seller Only)
const createProduct = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Get seller's shop profile
        const shop = await prisma_1.default.shopProfile.findUnique({
            where: { userId: req.user.id }
        });
        if (!shop) {
            return res.status(403).json({ message: 'Only sellers with a shop profile can create products' });
        }
        const { name, description, price, isOnDiscount, discountPrice, colorId, subcategoryId, size, stockQuantity, categoryId, brandId, variants } = req.body;
        // "bez foto ne poluchaetsya dobavit" - Check that files are uploaded
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'At least one product photo is required' });
        }
        // Verify category, brand, and color exist
        const categoryExists = await prisma_1.default.category.findUnique({ where: { id: categoryId } });
        const brandExists = await prisma_1.default.brand.findUnique({ where: { id: brandId } });
        const colorExists = await prisma_1.default.color.findUnique({ where: { id: colorId } });
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
            const subcategoryExists = await prisma_1.default.subcategory.findFirst({
                where: { id: subcategoryId, categoryId }
            });
            if (!subcategoryExists) {
                return res.status(400).json({ message: 'Invalid subcategory ID or subcategory does not belong to the selected category' });
            }
        }
        const discountBool = isOnDiscount === 'true' || isOnDiscount === true;
        const finalDiscountPrice = discountPrice ? parseFloat(discountPrice) : null;
        // Direct sanity check
        if (discountBool && (finalDiscountPrice === null || finalDiscountPrice >= parseFloat(price))) {
            return res.status(400).json({ message: 'Discount price must be provided and must be less than the original price' });
        }
        // Parse variants if provided
        let parsedVariants = [];
        if (variants) {
            try {
                parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
            }
            catch (e) {
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
        const product = await prisma_1.default.$transaction(async (tx) => {
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
                    categoryId,
                    brandId
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
            }
            else {
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating product', error: error.message });
    }
};
exports.createProduct = createProduct;
// 2. Update Product (Seller Only)
const updateProduct = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { id } = req.params;
        const { name, description, price, isOnDiscount, discountPrice, colorId, subcategoryId, size, stockQuantity, categoryId, brandId } = req.body;
        const product = await prisma_1.default.product.findUnique({
            where: { id },
            include: { shop: true, images: true }
        });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // Check ownership
        if (product.shop.userId !== req.user.id) {
            return res.status(403).json({ message: 'You do not own this product' });
        }
        const updateData = {};
        if (name)
            updateData.name = name;
        if (description)
            updateData.description = description;
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
        }
        else {
            updateData.discountPrice = null;
        }
        if (size)
            updateData.size = size;
        if (stockQuantity)
            updateData.stockQuantity = parseInt(stockQuantity);
        if (colorId) {
            const colorExists = await prisma_1.default.color.findUnique({ where: { id: colorId } });
            if (!colorExists)
                return res.status(400).json({ message: 'Invalid color ID' });
            updateData.colorId = colorId;
        }
        const finalCategoryId = categoryId || product.categoryId;
        if (categoryId) {
            const categoryExists = await prisma_1.default.category.findUnique({ where: { id: categoryId } });
            if (!categoryExists)
                return res.status(400).json({ message: 'Invalid category ID' });
            updateData.categoryId = categoryId;
        }
        if (subcategoryId) {
            const subcategoryExists = await prisma_1.default.subcategory.findFirst({
                where: { id: subcategoryId, categoryId: finalCategoryId }
            });
            if (!subcategoryExists) {
                return res.status(400).json({ message: 'Invalid subcategory ID or subcategory does not belong to the selected category' });
            }
            updateData.subcategoryId = subcategoryId;
        }
        else if (subcategoryId === null || subcategoryId === '') {
            updateData.subcategoryId = null;
        }
        if (brandId) {
            const brandExists = await prisma_1.default.brand.findUnique({ where: { id: brandId } });
            if (!brandExists)
                return res.status(400).json({ message: 'Invalid brand ID' });
            updateData.brandId = brandId;
        }
        const files = req.files;
        const updatedProduct = await prisma_1.default.$transaction(async (tx) => {
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating product', error: error.message });
    }
};
exports.updateProduct = updateProduct;
// 3. Delete Product (Seller Only)
const deleteProduct = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { id } = req.params;
        const product = await prisma_1.default.product.findUnique({
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
        await prisma_1.default.product.delete({
            where: { id }
        });
        return res.status(200).json({ message: 'Product deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
};
exports.deleteProduct = deleteProduct;
// 4. Get All Products with Filters (Public)
const getProducts = async (req, res) => {
    try {
        const { categoryId, subcategoryId, brandId, colorId, size, shopId, search } = req.query;
        const where = {};
        if (categoryId)
            where.categoryId = categoryId;
        if (subcategoryId)
            where.subcategoryId = subcategoryId;
        if (brandId)
            where.brandId = brandId;
        if (colorId)
            where.colorId = colorId;
        if (size)
            where.size = { equals: size, mode: 'insensitive' };
        if (shopId)
            where.shopId = shopId;
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { description: { contains: search } }
            ];
        }
        const products = await prisma_1.default.product.findMany({
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
            const averageRating = reviewCount > 0
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving products', error: error.message });
    }
};
exports.getProducts = getProducts;
// 5. Get Single Product details (Public)
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await prisma_1.default.product.findUnique({
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
        const averageRating = reviewCount > 0
            ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
            : 0;
        return res.status(200).json({
            product: {
                ...product,
                averageRating,
                reviewCount
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving product', error: error.message });
    }
};
exports.getProductById = getProductById;
// 6. Add Review (Buyer Only)
const addReview = async (req, res) => {
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
        const productExists = await prisma_1.default.product.findUnique({ where: { id: productId } });
        if (!productExists) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // Check if review already exists
        const existingReview = await prisma_1.default.review.findFirst({
            where: {
                productId,
                userId: req.user.id
            }
        });
        const files = req.files;
        const review = await prisma_1.default.$transaction(async (tx) => {
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
            }
            else {
                reviewRecord = await tx.review.create({
                    data: {
                        userId: req.user.id,
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error saving review', error: error.message });
    }
};
exports.addReview = addReview;
// 7. Reply to Review (Seller Only)
const replyToReview = async (req, res) => {
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
        const shop = await prisma_1.default.shopProfile.findUnique({
            where: { userId: req.user.id }
        });
        if (!shop) {
            return res.status(404).json({ message: 'Shop profile not found' });
        }
        // Find review and check if product belongs to the seller's shop
        const review = await prisma_1.default.review.findUnique({
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
        const updatedReview = await prisma_1.default.review.update({
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error replying to review', error: error.message });
    }
};
exports.replyToReview = replyToReview;
