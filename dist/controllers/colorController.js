"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteColor = exports.updateColor = exports.createColor = exports.getColors = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Get all colors
const getColors = async (req, res) => {
    try {
        const colors = await prisma_1.default.color.findMany();
        return res.status(200).json({ colors });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving colors', error: error.message });
    }
};
exports.getColors = getColors;
// Create a color (Seller only)
const createColor = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Color name is required' });
        }
        const existing = await prisma_1.default.color.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Color already exists' });
        }
        const color = await prisma_1.default.color.create({
            data: { name }
        });
        return res.status(201).json({ message: 'Color created successfully', color });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating color', error: error.message });
    }
};
exports.createColor = createColor;
// Update a color (Seller only)
const updateColor = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Color name is required' });
        }
        const color = await prisma_1.default.color.findUnique({ where: { id } });
        if (!color) {
            return res.status(404).json({ message: 'Color not found' });
        }
        const updated = await prisma_1.default.color.update({
            where: { id },
            data: { name }
        });
        return res.status(200).json({ message: 'Color updated successfully', color: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating color', error: error.message });
    }
};
exports.updateColor = updateColor;
// Delete a color (Seller only)
const deleteColor = async (req, res) => {
    try {
        const { id } = req.params;
        const color = await prisma_1.default.color.findUnique({ where: { id } });
        if (!color) {
            return res.status(404).json({ message: 'Color not found' });
        }
        // Check if color has products
        const productsCount = await prisma_1.default.product.count({ where: { colorId: id } });
        if (productsCount > 0) {
            return res.status(400).json({ message: 'Cannot delete color with associated products' });
        }
        await prisma_1.default.color.delete({ where: { id } });
        return res.status(200).json({ message: 'Color deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting color', error: error.message });
    }
};
exports.deleteColor = deleteColor;
