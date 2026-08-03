import { Response } from 'express';
import QRCode from 'qrcode';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://bozor.tj';

// Seller productivity tools: export orders to CSV, bulk-import products from CSV,
// and generate a shop QR code to bridge the physical bazaar to the online shop.

// Escape a value for CSV (wrap in quotes, double inner quotes).
const csv = (v: any): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/seller/export/orders  (SELLER) — download this shop's orders as CSV
export const exportOrdersCsv = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const items = await prisma.orderItem.findMany({
      where: { shopId: shop.id },
      include: {
        order: { include: { user: { select: { name: true, phone: true } }, address: true } },
        variant: { include: { product: { select: { name: true } } } }
      },
      orderBy: { order: { createdAt: 'desc' } }
    });

    const header = ['OrderID', 'Date', 'Status', 'Product', 'Size', 'Qty', 'UnitPrice', 'LineTotal', 'Buyer', 'Phone', 'City'];
    const rows = items.map((it) => [
      it.orderId.substring(0, 8),
      it.order.createdAt.toISOString().slice(0, 10),
      it.order.status,
      it.variant.product.name,
      it.variant.size,
      it.quantity,
      it.price,
      +(it.price * it.quantity).toFixed(2),
      it.order.user?.name ?? '',
      it.order.user?.phone ?? '',
      it.order.address?.city ?? ''
    ]);

    const body = [header, ...rows].map((r) => r.map(csv).join(',')).join('\r\n');
    // BOM so Excel opens UTF-8 (Cyrillic) correctly.
    const out = '﻿' + body;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${shop.shopName}.csv"`);
    return res.status(200).send(out);
  } catch (error: any) {
    return res.status(500).json({ message: 'Error exporting orders', error: error.message });
  }
};

// Minimal CSV parser (handles quoted fields, commas, CRLF). Good enough for the
// import template we ship; not a full RFC-4180 implementation.
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const clean = text.replace(/^﻿/, '');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

// POST /api/seller/import/products  (SELLER) — multipart "file" CSV
// Columns: name, description, price, stockQuantity, brand, [size], [discountPrice]
// Brand is matched case-insensitively; color/category default to the shop's.
export const importProductsCsv = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id },
      include: { category: true }
    });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });
    if (!shop.categoryId) {
      return res.status(400).json({ message: 'Your shop has no category set; cannot import' });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file || !file.buffer) return res.status(400).json({ message: 'A CSV file is required (field "file")' });

    const rows = parseCsv(file.buffer.toString('utf-8'));
    if (rows.length < 2) return res.status(400).json({ message: 'CSV has no data rows' });

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (name: string) => headers.indexOf(name);
    const iName = idx('name');
    const iDesc = idx('description');
    const iPrice = idx('price');
    const iStock = idx('stockquantity');
    const iBrand = idx('brand');
    const iSize = idx('size');
    const iDiscount = idx('discountprice');

    if (iName < 0 || iPrice < 0 || iStock < 0) {
      return res.status(400).json({ message: 'CSV must have at least: name, price, stockQuantity columns' });
    }

    // Preload brands and a default color for fallback.
    const brands = await prisma.brand.findMany();
    const brandByName = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
    const defaultColor = await prisma.color.findFirst();
    if (!defaultColor) return res.status(400).json({ message: 'No colors configured on the platform' });

    const created: string[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const name = (cells[iName] || '').trim();
      const price = parseFloat(cells[iPrice]);
      const stock = parseInt(cells[iStock]);
      if (!name || isNaN(price) || isNaN(stock)) {
        errors.push({ row: r + 1, message: 'Missing/invalid name, price or stockQuantity' });
        continue;
      }
      const brandName = iBrand >= 0 ? (cells[iBrand] || '').trim() : '';
      let brandId = brandByName.get(brandName.toLowerCase());
      if (!brandId && brandName) {
        const nb = await prisma.brand.create({ data: { name: brandName } });
        brandId = nb.id;
        brandByName.set(brandName.toLowerCase(), nb.id);
      }
      if (!brandId) {
        errors.push({ row: r + 1, message: 'Brand is required' });
        continue;
      }
      const size = iSize >= 0 && cells[iSize] ? cells[iSize].trim() : 'One Size';
      const discountPrice = iDiscount >= 0 && cells[iDiscount] ? parseFloat(cells[iDiscount]) : null;

      try {
        const product = await prisma.product.create({
          data: {
            shopId: shop.id,
            name,
            description: iDesc >= 0 ? (cells[iDesc] || '').trim() : name,
            price,
            isOnDiscount: discountPrice != null && discountPrice < price,
            discountPrice: discountPrice != null && discountPrice < price ? discountPrice : null,
            colorId: defaultColor.id,
            size,
            stockQuantity: stock,
            categoryId: shop.categoryId,
            brandId,
            variants: { create: [{ colorId: defaultColor.id, size, stockQuantity: stock }] }
          }
        });
        created.push(product.id);
      } catch (e: any) {
        errors.push({ row: r + 1, message: e.message });
      }
    }

    return res.status(200).json({
      message: `Imported ${created.length} product(s)`,
      importedCount: created.length,
      errorCount: errors.length,
      errors: errors.slice(0, 20)
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error importing products', error: error.message });
  }
};

// GET /api/seller/price-insights  (SELLER) — "нархнома": compares each of the
// seller's products against the median effective price of comparable products
// from OTHER shops (same category, refined by shared name terms / brand) and flags
// items priced noticeably above or below the market, with a suggested price.
const effective = (p: { price: number; discountPrice: number | null; isOnDiscount: boolean }): number =>
  p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : +((s[mid - 1] + s[mid]) / 2).toFixed(2);
};

export const getPriceInsights = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const OVER = 15; // % above market → overpriced
    const UNDER = -15; // % below market → underpriced (leaving money on the table)

    const myProducts = await prisma.product.findMany({
      where: { shopId: shop.id },
      select: {
        id: true, name: true, price: true, discountPrice: true, isOnDiscount: true,
        categoryId: true, brandId: true
      }
    });
    if (myProducts.length === 0) return res.status(200).json({ insights: [], checked: 0 });

    // Pull comparable products from other shops, grouped by category, in one query.
    const categoryIds = Array.from(new Set(myProducts.map((p) => p.categoryId)));
    const others = await prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, shopId: { not: shop.id } },
      select: { name: true, price: true, discountPrice: true, isOnDiscount: true, categoryId: true, brandId: true },
      take: 2000
    });
    const othersByCategory = new Map<string, typeof others>();
    others.forEach((o) => {
      const arr = othersByCategory.get(o.categoryId) || [];
      arr.push(o);
      othersByCategory.set(o.categoryId, arr);
    });

    const insights = myProducts.map((p) => {
      const pool = othersByCategory.get(p.categoryId) || [];
      const terms = p.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      // Prefer close matches (shared name term or same brand); fall back to whole category.
      let comparable = pool.filter(
        (o) =>
          o.brandId === p.brandId ||
          terms.some((t) => o.name.toLowerCase().includes(t))
      );
      let basis: 'similar' | 'category' = 'similar';
      if (comparable.length < 3) {
        comparable = pool;
        basis = 'category';
      }

      const myPrice = effective(p);
      const marketMedian = median(comparable.map(effective));
      const deltaPercent = marketMedian > 0 ? +(((myPrice - marketMedian) / marketMedian) * 100).toFixed(1) : 0;

      let status: 'overpriced' | 'underpriced' | 'fair' | 'no_data' = 'fair';
      if (comparable.length === 0 || marketMedian === 0) status = 'no_data';
      else if (deltaPercent > OVER) status = 'overpriced';
      else if (deltaPercent < UNDER) status = 'underpriced';

      return {
        productId: p.id,
        name: p.name,
        myPrice,
        marketMedian,
        deltaPercent,
        status,
        basis,
        sampleSize: comparable.length,
        // A gentle nudge toward the market when far off.
        suggestedPrice:
          status === 'overpriced' ? +(marketMedian * 1.03).toFixed(2)
          : status === 'underpriced' ? +(marketMedian * 0.98).toFixed(2)
          : null
      };
    });

    // Most actionable first: biggest overprice, then underprice.
    insights.sort((a, b) => {
      const rank = (s: string) => (s === 'overpriced' ? 0 : s === 'underpriced' ? 1 : s === 'fair' ? 2 : 3);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent);
    });

    const summary = {
      overpriced: insights.filter((i) => i.status === 'overpriced').length,
      underpriced: insights.filter((i) => i.status === 'underpriced').length,
      fair: insights.filter((i) => i.status === 'fair').length,
      noData: insights.filter((i) => i.status === 'no_data').length
    };

    return res.status(200).json({ checked: insights.length, summary, insights });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error computing price insights', error: error.message });
  }
};

// GET /api/seller/qr  (SELLER) — a QR code (PNG data URL) linking to the shop
// page, so the seller can print it and stick it on their bazaar stall.
export const getShopQrCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(404).json({ message: 'Shop profile not found' });

    const url = `${SITE_URL}/shops/${shop.id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
    return res.status(200).json({ shopId: shop.id, url, qrDataUrl: dataUrl });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error generating QR code', error: error.message });
  }
};
