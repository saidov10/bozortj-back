import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { buildProductWhere } from '../services/savedSearchService';

// Saved search + alert (ҷустуҷӯи захирашуда): a buyer stores a search with filters
// and gets notified when a new matching product lands. They can also re-run any
// saved search to see current matches.

const RESULT_INCLUDE = {
  images: true,
  brand: true,
  category: true,
  color: true,
  variants: { include: { color: true } },
  shop: { select: { id: true, shopName: true } },
  reviews: { select: { rating: true } }
};

const withRating = (product: any) => {
  const reviews = product.reviews || [];
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviewCount : 0;
  const { reviews: _r, ...rest } = product;
  return { ...rest, averageRating, reviewCount };
};

const parseFilters = (b: any) => ({
  name: b.name ? String(b.name).slice(0, 80) : null,
  query: b.query ? String(b.query).slice(0, 120) : null,
  categoryId: b.categoryId || null,
  brandId: b.brandId || null,
  colorId: b.colorId || null,
  size: b.size ? String(b.size) : null,
  minPrice: b.minPrice !== undefined && b.minPrice !== '' ? parseFloat(b.minPrice) : null,
  maxPrice: b.maxPrice !== undefined && b.maxPrice !== '' ? parseFloat(b.maxPrice) : null,
  notifyOnNew: b.notifyOnNew === undefined ? true : b.notifyOnNew === true || b.notifyOnNew === 'true'
});

// POST /api/saved-searches  (BUYER)
export const createSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const f = parseFilters(req.body);

    // Require at least one meaningful criterion.
    if (!f.query && !f.categoryId && !f.brandId && !f.colorId && f.minPrice == null && f.maxPrice == null) {
      return res.status(400).json({ message: 'Ҳадди ақал як меъёри ҷустуҷӯ лозим аст' });
    }
    if (f.minPrice != null && f.maxPrice != null && f.minPrice > f.maxPrice) {
      return res.status(400).json({ message: 'minPrice бояд аз maxPrice калон набошад' });
    }

    const saved = await prisma.savedSearch.create({ data: { userId: req.user.id, ...f } });
    const matchCount = await prisma.product.count({ where: buildProductWhere(saved) });
    return res.status(201).json({ message: 'Ҷустуҷӯ захира шуд', savedSearch: saved, matchCount });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating saved search', error: error.message });
  }
};

// GET /api/saved-searches  (BUYER) — my saved searches, each with a live match count
export const getSavedSearches = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const searches = await prisma.savedSearch.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    const withCounts = await Promise.all(
      searches.map(async (s) => ({
        ...s,
        matchCount: await prisma.product.count({ where: buildProductWhere(s) })
      }))
    );
    return res.status(200).json({ savedSearches: withCounts });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving saved searches', error: error.message });
  }
};

// PATCH /api/saved-searches/:id  (BUYER) — toggle alerts / rename
export const updateSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const existing = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    const data: any = {};
    if (req.body.name !== undefined) data.name = req.body.name ? String(req.body.name).slice(0, 80) : null;
    if (req.body.notifyOnNew !== undefined) data.notifyOnNew = req.body.notifyOnNew === true || req.body.notifyOnNew === 'true';
    const updated = await prisma.savedSearch.update({ where: { id: existing.id }, data });
    return res.status(200).json({ message: 'Навсозӣ шуд', savedSearch: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating saved search', error: error.message });
  }
};

// DELETE /api/saved-searches/:id  (BUYER)
export const deleteSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const existing = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    await prisma.savedSearch.delete({ where: { id: existing.id } });
    return res.status(200).json({ message: 'Ҷустуҷӯ нест карда шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting saved search', error: error.message });
  }
};

// GET /api/saved-searches/:id/results  (BUYER) — run the saved search now
export const getSavedSearchResults = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const s = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!s || s.userId !== req.user.id) return res.status(404).json({ message: 'Saved search not found' });

    const products = await prisma.product.findMany({
      where: buildProductWhere(s),
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: RESULT_INCLUDE
    });
    return res.status(200).json({ products: products.map(withRating) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error running saved search', error: error.message });
  }
};
