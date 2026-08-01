import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Named shopping lists (сабадҳои номдор): a buyer keeps several saved carts and
// moves items to the real cart when ready. Items reference a variant (like the
// cart) so "move to cart" is a straight copy.

const listInclude = {
  items: {
    include: {
      variant: {
        include: {
          color: true,
          product: { include: { images: { take: 1 }, shop: { select: { id: true, shopName: true } } } }
        }
      }
    }
  }
};

const ownedList = async (listId: string, userId: string) => {
  const list = await prisma.shoppingList.findUnique({ where: { id: listId } });
  if (!list || list.userId !== userId) return null;
  return list;
};

// GET /api/shopping-lists  (BUYER)
export const getMyLists = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const lists = await prisma.shoppingList.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: listInclude
    });
    return res.status(200).json({ lists });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving lists', error: error.message });
  }
};

// POST /api/shopping-lists  (BUYER)  { name }
export const createList = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'List name is required' });
    }
    const list = await prisma.shoppingList.create({
      data: { userId: req.user.id, name: name.trim() },
      include: listInclude
    });
    return res.status(201).json({ message: 'List created', list });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating list', error: error.message });
  }
};

// DELETE /api/shopping-lists/:id  (BUYER)
export const deleteList = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!(await ownedList(req.params.id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this list' });
    }
    await prisma.shoppingList.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'List deleted' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting list', error: error.message });
  }
};

// POST /api/shopping-lists/:id/items  (BUYER)  { variantId, quantity? }
export const addListItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const { variantId, quantity } = req.body;

    if (!(await ownedList(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this list' });
    }
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) return res.status(404).json({ message: 'Product variant not found' });

    const qty = Math.max(1, parseInt(quantity) || 1);
    const item = await prisma.shoppingListItem.upsert({
      where: { listId_variantId: { listId: id, variantId } },
      update: { quantity: qty },
      create: { listId: id, variantId, quantity: qty }
    });
    return res.status(201).json({ message: 'Item added to list', item });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error adding item', error: error.message });
  }
};

// DELETE /api/shopping-lists/:id/items/:itemId  (BUYER)
export const removeListItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id, itemId } = req.params;
    if (!(await ownedList(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this list' });
    }
    await prisma.shoppingListItem.deleteMany({ where: { id: itemId, listId: id } });
    return res.status(200).json({ message: 'Item removed' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error removing item', error: error.message });
  }
};

// POST /api/shopping-lists/:id/move-to-cart  (BUYER) — copy all list items into
// the cart (capped by current stock). Out-of-stock items are reported.
export const moveListToCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    if (!(await ownedList(id, req.user.id))) {
      return res.status(403).json({ message: 'You do not own this list' });
    }

    const items = await prisma.shoppingListItem.findMany({
      where: { listId: id },
      include: { variant: { include: { product: { select: { name: true } } } } }
    });

    let added = 0;
    const skipped: string[] = [];
    for (const it of items) {
      if (it.variant.stockQuantity < 1) {
        skipped.push(it.variant.product.name);
        continue;
      }
      const qty = Math.min(it.quantity, it.variant.stockQuantity);
      const existing = await prisma.cartItem.findFirst({
        where: { userId: req.user.id, variantId: it.variantId }
      });
      if (existing) {
        const newQty = Math.min(existing.quantity + qty, it.variant.stockQuantity);
        await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
      } else {
        await prisma.cartItem.create({ data: { userId: req.user.id, variantId: it.variantId, quantity: qty } });
      }
      added++;
    }

    return res.status(200).json({ message: `${added} мол ба сабад кӯчонида шуд`, addedCount: added, skipped });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error moving list to cart', error: error.message });
  }
};
