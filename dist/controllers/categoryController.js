"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSubcategory = exports.updateSubcategory = exports.createSubcategory = exports.getSubcategories = exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// --- CATEGORIES ---
// Get all categories with subcategories
const getCategories = async (req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
            include: { subcategories: true }
        });
        return res.status(200).json({ categories });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving categories', error: error.message });
    }
};
exports.getCategories = getCategories;
// Create a category (Seller only)
const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const existing = await prisma_1.default.category.findUnique({
            where: { name }
        });
        if (existing) {
            return res.status(400).json({ message: 'Category already exists' });
        }
        const category = await prisma_1.default.category.create({
            data: { name }
        });
        return res.status(201).json({ message: 'Category created successfully', category });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating category', error: error.message });
    }
};
exports.createCategory = createCategory;
// Update a category (Seller only)
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const category = await prisma_1.default.category.findUnique({ where: { id } });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        const updated = await prisma_1.default.category.update({
            where: { id },
            data: { name }
        });
        return res.status(200).json({ message: 'Category updated successfully', category: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating category', error: error.message });
    }
};
exports.updateCategory = updateCategory;
// Delete a category (Seller only)
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await prisma_1.default.category.findUnique({ where: { id } });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        // Check if category has products
        const productsCount = await prisma_1.default.product.count({ where: { categoryId: id } });
        if (productsCount > 0) {
            return res.status(400).json({ message: 'Cannot delete category with associated products' });
        }
        await prisma_1.default.category.delete({ where: { id } });
        return res.status(200).json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting category', error: error.message });
    }
};
exports.deleteCategory = deleteCategory;
// --- SUBCATEGORIES ---
// Get subcategories under a category
const getSubcategories = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const subcategories = await prisma_1.default.subcategory.findMany({
            where: { categoryId }
        });
        return res.status(200).json({ subcategories });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving subcategories', error: error.message });
    }
};
exports.getSubcategories = getSubcategories;
// Create a subcategory (Seller only)
const createSubcategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Subcategory name is required' });
        }
        // Verify category exists
        const category = await prisma_1.default.category.findUnique({ where: { id: categoryId } });
        if (!category) {
            return res.status(404).json({ message: 'Parent category not found' });
        }
        // Check if subcategory already exists under this category
        const existing = await prisma_1.default.subcategory.findUnique({
            where: {
                name_categoryId: {
                    name,
                    categoryId
                }
            }
        });
        if (existing) {
            return res.status(400).json({ message: 'Subcategory already exists in this category' });
        }
        const subcategory = await prisma_1.default.subcategory.create({
            data: {
                name,
                categoryId
            }
        });
        return res.status(201).json({ message: 'Subcategory created successfully', subcategory });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error creating subcategory', error: error.message });
    }
};
exports.createSubcategory = createSubcategory;
// Update a subcategory (Seller only)
const updateSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Subcategory name is required' });
        }
        const subcategory = await prisma_1.default.subcategory.findUnique({ where: { id } });
        if (!subcategory) {
            return res.status(404).json({ message: 'Subcategory not found' });
        }
        const updated = await prisma_1.default.subcategory.update({
            where: { id },
            data: { name }
        });
        return res.status(200).json({ message: 'Subcategory updated successfully', subcategory: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating subcategory', error: error.message });
    }
};
exports.updateSubcategory = updateSubcategory;
// Delete a subcategory (Seller only)
const deleteSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const subcategory = await prisma_1.default.subcategory.findUnique({ where: { id } });
        if (!subcategory) {
            return res.status(404).json({ message: 'Subcategory not found' });
        }
        // Check if subcategory has products
        const productsCount = await prisma_1.default.product.count({ where: { subcategoryId: id } });
        if (productsCount > 0) {
            return res.status(400).json({ message: 'Cannot delete subcategory with associated products' });
        }
        await prisma_1.default.subcategory.delete({ where: { id } });
        return res.status(200).json({ message: 'Subcategory deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error deleting subcategory', error: error.message });
    }
};
exports.deleteSubcategory = deleteSubcategory;
