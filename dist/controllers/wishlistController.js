"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFromWishlist = exports.addToWishlist = exports.getWishlist = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get Wishlist Items (Buyer Only)
const getWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const wishlistItems = await prisma_1.default.wishlistItem.findMany({
            where: { userId: req.user.id },
            include: {
                product: {
                    include: {
                        images: true,
                        shop: {
                            select: {
                                id: true,
                                shopName: true
                            }
                        }
                    }
                }
            }
        });
        return res.status(200).json({ wishlistItems });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving wishlist', error: error.message });
    }
};
exports.getWishlist = getWishlist;
// 2. Add Item to Wishlist (Buyer Only)
const addToWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { productId } = req.body;
        // Check if product exists
        const product = await prisma_1.default.product.findUnique({ where: { id: productId } });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        // Check if item already in wishlist
        const existingItem = await prisma_1.default.wishlistItem.findUnique({
            where: {
                userId_productId: {
                    userId: req.user.id,
                    productId
                }
            }
        });
        if (existingItem) {
            return res.status(400).json({ message: 'Product is already in your wishlist' });
        }
        const wishlistItem = await prisma_1.default.wishlistItem.create({
            data: {
                userId: req.user.id,
                productId
            },
            include: { product: true }
        });
        return res.status(200).json({
            message: 'Product added to wishlist successfully',
            wishlistItem
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error adding to wishlist', error: error.message });
    }
};
exports.addToWishlist = addToWishlist;
// 3. Remove Item from Wishlist (Buyer Only)
const removeFromWishlist = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { id } = req.params;
        const wishlistItem = await prisma_1.default.wishlistItem.findUnique({
            where: { id }
        });
        if (!wishlistItem) {
            return res.status(404).json({ message: 'Wishlist item not found' });
        }
        if (wishlistItem.userId !== req.user.id) {
            return res.status(403).json({ message: 'You do not own this wishlist item' });
        }
        await prisma_1.default.wishlistItem.delete({
            where: { id }
        });
        return res.status(200).json({ message: 'Product removed from wishlist successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error removing from wishlist', error: error.message });
    }
};
exports.removeFromWishlist = removeFromWishlist;
