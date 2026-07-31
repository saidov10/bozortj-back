import crypto from 'crypto';
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Wedding gift registry (рӯйхати тӯёна). The couple builds a list of wanted
// products and shares a public link (shareCode). Guests see what's still needed
// and mark items purchased, so no one buys a duplicate gift — a naturally viral
// feature for the Tajik wedding season.

const registryInclude = {
  items: {
    include: {
      product: {
        include: { images: { take: 1 }, brand: true, shop: { select: { id: true, shopName: true } } }
      }
    }
  }
};

// POST /api/registries  (auth)  { title, eventDate? }
export const createRegistry = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { title, eventDate } = req.body;
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ message: 'Registry title is required' });
    }

    const shareCode = crypto.randomBytes(5).toString('hex');
    const registry = await prisma.giftRegistry.create({
      data: {
        ownerId: req.user.id,
        title: title.trim(),
        eventDate: eventDate ? new Date(eventDate) : null,
        shareCode
      },
      include: registryInclude
    });
    return res.status(201).json({ message: 'Registry created', registry });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating registry', error: error.message });
  }
};

// GET /api/registries/mine  (auth)
export const getMyRegistries = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const registries = await prisma.giftRegistry.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: registryInclude
    });
    return res.status(200).json({ registries });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving registries', error: error.message });
  }
};

// GET /api/registries/:shareCode  (public) — the shareable guest view
export const getRegistryByCode = async (req: AuthRequest, res: Response) => {
  try {
    const { shareCode } = req.params;
    const registry = await prisma.giftRegistry.findUnique({
      where: { shareCode },
      include: {
        ...registryInclude,
        owner: { select: { name: true } }
      }
    });
    if (!registry) return res.status(404).json({ message: 'Registry not found' });
    return res.status(200).json({ registry });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving registry', error: error.message });
  }
};

// Load a registry owned by the caller.
const ownedRegistry = async (registryId: string, userId: string) => {
  const registry = await prisma.giftRegistry.findUnique({ where: { id: registryId } });
  if (!registry || registry.ownerId !== userId) return null;
  return registry;
};

// POST /api/registries/:id/items  (owner)  { productId, quantityWanted? }
export const addRegistryItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const { productId, quantityWanted } = req.body;

    if (!(await ownedRegistry(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this registry' });
    }
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const item = await prisma.giftRegistryItem.upsert({
      where: { registryId_productId: { registryId: id, productId } },
      update: { quantityWanted: Math.max(1, parseInt(quantityWanted) || 1) },
      create: { registryId: id, productId, quantityWanted: Math.max(1, parseInt(quantityWanted) || 1) },
      include: { product: { include: { images: { take: 1 } } } }
    });
    return res.status(201).json({ message: 'Item added to registry', item });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding registry item', error: error.message });
  }
};

// DELETE /api/registries/:id/items/:itemId  (owner)
export const removeRegistryItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id, itemId } = req.params;
    if (!(await ownedRegistry(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this registry' });
    }
    await prisma.giftRegistryItem.deleteMany({ where: { id: itemId, registryId: id } });
    return res.status(200).json({ message: 'Item removed' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing registry item', error: error.message });
  }
};

// POST /api/registries/:shareCode/items/:itemId/purchase  (public)  { quantity? }
// A guest marks (part of) an item as purchased so others don't buy duplicates.
export const markRegistryItemPurchased = async (req: AuthRequest, res: Response) => {
  try {
    const { shareCode, itemId } = req.params;
    const quantity = Math.max(1, parseInt(req.body.quantity) || 1);

    const registry = await prisma.giftRegistry.findUnique({ where: { shareCode } });
    if (!registry) return res.status(404).json({ message: 'Registry not found' });

    const item = await prisma.giftRegistryItem.findFirst({ where: { id: itemId, registryId: registry.id } });
    if (!item) return res.status(404).json({ message: 'Registry item not found' });

    const newPurchased = Math.min(item.quantityWanted, item.quantityPurchased + quantity);
    const updated = await prisma.giftRegistryItem.update({
      where: { id: item.id },
      data: { quantityPurchased: newPurchased }
    });
    return res.status(200).json({ message: 'Marked as purchased. Ташаккур! 🎁', item: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error marking item purchased', error: error.message });
  }
};
