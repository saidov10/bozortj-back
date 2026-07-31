import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { cached, invalidateCache, TTL } from '../utils/cache';

// Get all brands (cached — brands change rarely).
export const getBrands = async (req: Request, res: Response) => {
  try {
    const brands = await cached('brands:all', TTL.long, () => prisma.brand.findMany());
    return res.status(200).json({ brands });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving brands', error: error.message });
  }
};

// Create a brand (Seller only)
export const createBrand = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    const existing = await prisma.brand.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: 'Brand already exists' });
    }

    const brand = await prisma.brand.create({
      data: { name }
    });
    invalidateCache('brands');
    return res.status(201).json({ message: 'Brand created successfully', brand });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating brand', error: error.message });
  }
};

// Update a brand (Seller only)
export const updateBrand = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: { name }
    });
    invalidateCache('brands');
    return res.status(200).json({ message: 'Brand updated successfully', brand: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating brand', error: error.message });
  }
};

// Delete a brand (Seller only)
export const deleteBrand = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    // Check if brand has products
    const productsCount = await prisma.product.count({ where: { brandId: id } });
    if (productsCount > 0) {
      return res.status(400).json({ message: 'Cannot delete brand with associated products' });
    }

    await prisma.brand.delete({ where: { id } });
    invalidateCache('brands');
    return res.status(200).json({ message: 'Brand deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting brand', error: error.message });
  }
};
