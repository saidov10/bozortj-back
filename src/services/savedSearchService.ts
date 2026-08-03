import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { createNotification } from './notificationService';

// Saved search + alert (ҷустуҷӯи захирашуда): turn a buyer's stored search into a
// live alert. Shared by the REST controller (to run a search now) and the
// product-create hook (to notify matching buyers when a new product lands).

const effectivePrice = (p: { price: number; discountPrice: number | null; isOnDiscount: boolean }): number =>
  p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;

// Build a Prisma product filter from a saved search's fields (same semantics as
// the public product listing: multi-term text across name/description/brand/category).
export const buildProductWhere = (s: {
  query?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  colorId?: string | null;
  size?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}): Prisma.ProductWhereInput => {
  const where: Prisma.ProductWhereInput = {};
  const and: Prisma.ProductWhereInput[] = [];

  if (s.categoryId) where.categoryId = s.categoryId;
  if (s.brandId) where.brandId = s.brandId;
  if (s.colorId) where.colorId = s.colorId;
  if (s.size) where.size = { equals: s.size, mode: 'insensitive' };
  if (s.minPrice != null || s.maxPrice != null) {
    where.price = {};
    if (s.minPrice != null) (where.price as any).gte = s.minPrice;
    if (s.maxPrice != null) (where.price as any).lte = s.maxPrice;
  }

  if (s.query && s.query.trim()) {
    const terms = s.query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    terms.forEach((term) => {
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { brand: { name: { contains: term, mode: 'insensitive' } } },
          { category: { name: { contains: term, mode: 'insensitive' } } }
        ]
      });
    });
  }
  if (and.length) where.AND = and;
  return where;
};

// Does a specific product satisfy a saved search? Used at product-create time.
const matchesQueryTerms = (product: any, query?: string | null): boolean => {
  if (!query || !query.trim()) return true;
  const haystack = [
    product.name,
    product.description,
    product.brand?.name,
    product.category?.name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Match if ANY term is present (same "loose" spirit as the search box).
  return terms.some((t) => haystack.includes(t));
};

// On a new product, alert every buyer whose saved search matches it.
export const notifyNewProductToSavedSearches = async (productId: string): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true, category: true, shop: { select: { userId: true, shopName: true } } }
    });
    if (!product) return;

    const eff = effectivePrice(product);

    // Structured filters map straight to a DB query; nullable fields mean "any".
    const searches = await prisma.savedSearch.findMany({
      where: {
        notifyOnNew: true,
        AND: [
          { OR: [{ categoryId: null }, { categoryId: product.categoryId }] },
          { OR: [{ brandId: null }, { brandId: product.brandId }] },
          { OR: [{ colorId: null }, { colorId: product.colorId }] },
          { OR: [{ minPrice: null }, { minPrice: { lte: eff } }] },
          { OR: [{ maxPrice: null }, { maxPrice: { gte: eff } }] }
        ]
      },
      select: { id: true, userId: true, name: true, query: true, size: true }
    });

    for (const s of searches) {
      // Don't alert a seller about their own shop's product.
      if (s.userId === product.shop.userId) continue;
      // Refine on free-text terms and size in memory.
      if (!matchesQueryTerms(product, s.query)) continue;
      if (s.size && s.size.toLowerCase() !== product.size.toLowerCase()) continue;

      const label = s.name || s.query || 'ҷустуҷӯи шумо';
      await createNotification(
        s.userId,
        '🔔 Моли мувофиқ пайдо шуд',
        `Барои «${label}»: «${product.name}» — ${eff} сомонӣ дар «${product.shop.shopName}».`,
        { type: 'SAVED_SEARCH_MATCH', productId: product.id, savedSearchId: s.id }
      );
      await prisma.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: new Date() } });
    }
  } catch (err) {
    console.error('notifyNewProductToSavedSearches failed:', err);
  }
};
