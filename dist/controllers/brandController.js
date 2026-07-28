"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBrand = exports.updateBrand = exports.createBrand = exports.getBrands = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Get all brands
const getBrands = async (req, res) => {
    try {
        const brands = await prisma_1.default.brand.findMany();
        return res.status(200).json({ brands });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving brands', error: error.message });
    }
};
exports.getBrands = getBrands;
// Create a brand (Seller only)
const createBrand = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Brand name is required' });
        }
        const existing = await prisma_1.default.brand.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Brand already exists' });
        }
        const brand = await prisma_1.default.brand.create({
            data: { name }
        });
        return res.status(201).json({ message: 'Brand created successfully', brand });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating brand', error: error.message });
    }
};
exports.createBrand = createBrand;
// Update a brand (Seller only)
const updateBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Brand name is required' });
        }
        const brand = await prisma_1.default.brand.findUnique({ where: { id } });
        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }
        const updated = await prisma_1.default.brand.update({
            where: { id },
            data: { name }
        });
        return res.status(200).json({ message: 'Brand updated successfully', brand: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating brand', error: error.message });
    }
};
exports.updateBrand = updateBrand;
// Delete a brand (Seller only)
const deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const brand = await prisma_1.default.brand.findUnique({ where: { id } });
        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }
        // Check if brand has products
        const productsCount = await prisma_1.default.product.count({ where: { brandId: id } });
        if (productsCount > 0) {
            return res.status(400).json({ message: 'Cannot delete brand with associated products' });
        }
        await prisma_1.default.brand.delete({ where: { id } });
        return res.status(200).json({ message: 'Brand deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting brand', error: error.message });
    }
};
exports.deleteBrand = deleteBrand;
