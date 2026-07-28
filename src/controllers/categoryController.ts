import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// --- CATEGORIES ---

// Get all categories with subcategories
export const getCategories = async (req: Request, res: Response) => {
  try {






    
    const categories = await prisma.category.findMany({
      include: { subcategories: true }
    });
    return res.status(200).json({ categories });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving categories', error: error.message });
  }
};

// Create a category (Seller only)
export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const existing = await prisma.category.findUnique({
      where: { name }
    });
    if (existing) {
      return res.status(400).json({ message: 'Category already exists' });
    }

    const category = await prisma.category.create({
      data: { name }
    });
    return res.status(201).json({ message: 'Category created successfully', category });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating category', error: error.message });
  }
};

// Update a category (Seller only)
export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name }
    });
    return res.status(200).json({ message: 'Category updated successfully', category: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating category', error: error.message });
  }
};

// Delete a category (Seller only)
export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has products
    const productsCount = await prisma.product.count({ where: { categoryId: id } });
    if (productsCount > 0) {
      return res.status(400).json({ message: 'Cannot delete category with associated products' });
    }

    await prisma.category.delete({ where: { id } });
    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting category', error: error.message });
  }
};

// --- SUBCATEGORIES ---

// Get subcategories under a category
export const getSubcategories = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await prisma.subcategory.findMany({
      where: { categoryId }
    });
    return res.status(200).json({ subcategories });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving subcategories', error: error.message });
  }
};

// Create a subcategory (Seller only)
export const createSubcategory = async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Subcategory name is required' });
    }

    // Verify category exists
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ message: 'Parent category not found' });
    }

    // Check if subcategory already exists under this category
    const existing = await prisma.subcategory.findUnique({
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

    const subcategory = await prisma.subcategory.create({
      data: {
        name,
        categoryId
      }
    });

    return res.status(201).json({ message: 'Subcategory created successfully', subcategory });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating subcategory', error: error.message });
  }
};

// Update a subcategory (Seller only)
export const updateSubcategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Subcategory name is required' });
    }

    const subcategory = await prisma.subcategory.findUnique({ where: { id } });
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    const updated = await prisma.subcategory.update({
      where: { id },
      data: { name }
    });

    return res.status(200).json({ message: 'Subcategory updated successfully', subcategory: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating subcategory', error: error.message });
  }
};

// Delete a subcategory (Seller only)
export const deleteSubcategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const subcategory = await prisma.subcategory.findUnique({ where: { id } });
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    // Check if subcategory has products
    const productsCount = await prisma.product.count({ where: { subcategoryId: id } });
    if (productsCount > 0) {
      return res.status(400).json({ message: 'Cannot delete subcategory with associated products' });
    }

    await prisma.subcategory.delete({ where: { id } });
    return res.status(200).json({ message: 'Subcategory deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting subcategory', error: error.message });
  }
};
