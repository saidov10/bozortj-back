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
