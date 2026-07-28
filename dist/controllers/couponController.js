"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCoupon = exports.createCoupon = exports.getCoupons = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get Coupons
const getCoupons = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        let coupons;
        if (req.user.role === 'SELLER') {
            // Find shop
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop)
                return res.status(404).json({ message: 'Shop profile not found' });
            // Sellers see their own coupons and global coupons (null shopId)
            coupons = await prisma_1.default.coupon.findMany({
                where: {
                    OR: [
                        { shopId: shop.id },
                        { shopId: null }
                    ]
                }
            });
        }
        else {
            // Buyers and Admins see all coupons
            coupons = await prisma_1.default.coupon.findMany({
                include: {
                    shop: {
                        select: { shopName: true }
                    }
                }
            });
        }
        return res.status(200).json({ coupons });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error fetching coupons', error: error.message });
    }
};
exports.getCoupons = getCoupons;
// 2. Create Coupon
const createCoupon = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { code, discountType, discountValue, minPurchase, maxUsage, expiryDate } = req.body;
        if (!code || !discountType || !discountValue) {
            return res.status(400).json({ message: 'Code, discountType, and discountValue are required' });
        }
        if (discountType !== 'PERCENT' && discountType !== 'FIXED') {
            return res.status(400).json({ message: 'discountType must be PERCENT or FIXED' });
        }
        // Check if code already exists
        const existing = await prisma_1.default.coupon.findUnique({ where: { code } });
        if (existing) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }
        let shopId = null;
        if (req.user.role === 'SELLER') {
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop)
                return res.status(403).json({ message: 'Only sellers with shop profiles can create coupons' });
            shopId = shop.id;
        }
        const coupon = await prisma_1.default.coupon.create({
            data: {
                code: code.toUpperCase().trim(),
                discountType,
                discountValue: parseFloat(discountValue),
                minPurchase: minPurchase ? parseFloat(minPurchase) : 0,
                maxUsage: maxUsage ? parseInt(maxUsage) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                shopId
            }
        });
        return res.status(201).json({ message: 'Coupon created successfully', coupon });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating coupon', error: error.message });
    }
};
exports.createCoupon = createCoupon;
// 3. Delete Coupon
const deleteCoupon = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const coupon = await prisma_1.default.coupon.findUnique({ where: { id } });
        if (!coupon)
            return res.status(404).json({ message: 'Coupon not found' });
        // Auth validation
        if (req.user.role === 'SELLER') {
            const shop = await prisma_1.default.shopProfile.findUnique({
                where: { userId: req.user.id }
            });
            if (!shop || coupon.shopId !== shop.id) {
                return res.status(403).json({ message: 'You do not have permission to delete this coupon' });
            }
        }
        await prisma_1.default.coupon.delete({ where: { id } });
        return res.status(200).json({ message: 'Coupon deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting coupon', error: error.message });
    }
};
exports.deleteCoupon = deleteCoupon;
