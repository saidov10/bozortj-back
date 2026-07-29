import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Get all colors
export const getColors = async (req: Request, res: Response) => {
  try {
    const colors = await prisma.color.findMany();
    return res.status(200).json({ colors });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving colors', error: error.message });
  }
};

// Create a color (Seller/Admin only)
export const createColor = async (req: AuthRequest, res: Response) => {
  try {
    const { name, hexCode } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Color name is required' });
    }

    const existing = await prisma.color.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: 'Color already exists' });
    }

    const color = await prisma.color.create({
      data: { name, hexCode: hexCode ?? null }
    });
    return res.status(201).json({ message: 'Color created successfully', color });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating color', error: error.message });
  }
};

// Update a color (Seller/Admin only)
export const updateColor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, hexCode } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Color name is required' });
    }

    const color = await prisma.color.findUnique({ where: { id } });
    if (!color) {
      return res.status(404).json({ message: 'Color not found' });
    }

    const dataToUpdate: { name: string; hexCode?: string | null } = { name };
    if (hexCode !== undefined) dataToUpdate.hexCode = hexCode;

    const updated = await prisma.color.update({
      where: { id },
      data: dataToUpdate
    });
    return res.status(200).json({ message: 'Color updated successfully', color: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating color', error: error.message });
  }
};

// Delete a color (Seller only)
export const deleteColor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const color = await prisma.color.findUnique({ where: { id } });
    if (!color) {
      return res.status(404).json({ message: 'Color not found' });
    }

    // Check if color has products
    const productsCount = await prisma.product.count({ where: { colorId: id } });
    if (productsCount > 0) {
      return res.status(400).json({ message: 'Cannot delete color with associated products' });
    }

    await prisma.color.delete({ where: { id } });
    return res.status(200).json({ message: 'Color deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting color', error: error.message });
  }
};
