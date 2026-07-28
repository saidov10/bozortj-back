"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShopSettings = exports.getShopById = exports.getShops = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get all shops with optional search
const getShops = async (req, res) => {
    try {
        const { search } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { shopName: { contains: search } },
                { description: { contains: search } }
            ];
        }
        const shops = await prisma_1.default.shopProfile.findMany({
            where,
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        phone: true,
                        avatarUrl: true
                    }
                }
            }
        });
        return res.status(200).json({ shops });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving shops', error: error.message });
    }
};
exports.getShops = getShops;
// 2. Get shop details and its products
const getShopById = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await prisma_1.default.shopProfile.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        phone: true,
                        avatarUrl: true
                    }
                },
                products: {
                    include: {
                        images: true,
                        category: true,
                        brand: true
                    }
                }
            }
        });
        if (!shop) {
            return res.status(404).json({ message: 'Shop not found' });
        }
        return res.status(200).json({ shop });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving shop details', error: error.message });
    }
};
exports.getShopById = getShopById;
// 3. Update shop settings (Auto-Reply etc.) - Seller Only
const updateShopSettings = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        if (req.user.role !== 'SELLER')
            return res.status(403).json({ message: 'Only sellers can modify shop settings' });
        const { autoReplyText, autoReplyEnabled } = req.body;
        const shop = await prisma_1.default.shopProfile.findUnique({
            where: { userId: req.user.id }
        });
        if (!shop) {
            return res.status(404).json({ message: 'Shop profile not found' });
        }
        const enabledBool = autoReplyEnabled === 'true' || autoReplyEnabled === true;
        const updatedShop = await prisma_1.default.shopProfile.update({
            where: { id: shop.id },
            data: {
                autoReplyText: autoReplyText !== undefined ? autoReplyText : shop.autoReplyText,
                autoReplyEnabled: autoReplyEnabled !== undefined ? enabledBool : shop.autoReplyEnabled
            }
        });
        return res.status(200).json({
            message: 'Shop settings updated successfully',
            shop: updatedShop
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating shop settings', error: error.message });
    }
};
exports.updateShopSettings = updateShopSettings;
