import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// Rental (иҷора): products can be rented by the day (тӯйҳо, асбобҳо, техника).
// The seller sets a daily price + refundable deposit (гарав); buyers book a date
// range; overlapping active bookings block the calendar so nothing is double-booked.

const DAY_MS = 24 * 60 * 60 * 1000;

// Booking statuses that occupy the calendar (a slot is taken).
const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'ACTIVE'];

// Parse a YYYY-MM-DD (or ISO) date at UTC midnight; returns null if invalid.
const parseDay = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
};

const bookingInclude = {
  product: { include: { images: { take: 1 }, shop: { select: { id: true, shopName: true, userId: true } } } },
  user: { select: { id: true, name: true, phone: true } }
};

const shapeBooking = (b: any) => ({
  id: b.id,
  productId: b.productId,
  startDate: b.startDate,
  endDate: b.endDate,
  days: b.days,
  dailyPrice: b.dailyPrice,
  deposit: b.deposit,
  totalPrice: b.totalPrice,
  status: b.status,
  note: b.note ?? null,
  createdAt: b.createdAt,
  renter: b.user ?? null,
  product: b.product
    ? {
        id: b.product.id,
        name: b.product.name,
        image: b.product.images?.[0]?.url ?? null,
        shopId: b.product.shop?.id ?? null,
        shopName: b.product.shop?.shopName ?? null
      }
    : null
});

// PUT /api/rentals/products/:productId/settings  (SELLER) — enable/configure rental
// Body: { isRentable, rentalDailyPrice, rentalDeposit }
export const setRentalSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { userId: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this product' });
    }

    const isRentable = req.body.isRentable === true || req.body.isRentable === 'true';
    let dailyPrice: number | null = product.rentalDailyPrice;
    let deposit: number = product.rentalDeposit ?? 0;

    if (req.body.rentalDailyPrice !== undefined && req.body.rentalDailyPrice !== '') {
      const p = parseFloat(req.body.rentalDailyPrice);
      if (isNaN(p) || p <= 0) return res.status(400).json({ message: 'rentalDailyPrice must be a positive number' });
      dailyPrice = p;
    }
    if (req.body.rentalDeposit !== undefined && req.body.rentalDeposit !== '') {
      const d = parseFloat(req.body.rentalDeposit);
      if (isNaN(d) || d < 0) return res.status(400).json({ message: 'rentalDeposit must be zero or more' });
      deposit = d;
    }
    if (isRentable && (dailyPrice === null || dailyPrice <= 0)) {
      return res.status(400).json({ message: 'Set a positive rentalDailyPrice to enable rental' });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isRentable, rentalDailyPrice: dailyPrice, rentalDeposit: deposit }
    });

    return res.status(200).json({
      message: isRentable ? 'Иҷора фаъол шуд' : 'Иҷора хомӯш шуд',
      rental: {
        isRentable: updated.isRentable,
        rentalDailyPrice: updated.rentalDailyPrice,
        rentalDeposit: updated.rentalDeposit
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating rental settings', error: error.message });
  }
};

// GET /api/rentals/products/:productId/availability?from=&to=  (public)
// Returns the booked ranges plus, when from/to given, whether that window is free.
export const getAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isRentable: true, rentalDailyPrice: true, rentalDeposit: true }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const bookings = await prisma.rentalBooking.findMany({
      where: { productId, status: { in: BLOCKING_STATUSES }, endDate: { gte: new Date() } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, endDate: true, status: true }
    });

    const from = parseDay(req.query.from);
    const to = parseDay(req.query.to);
    let available: boolean | null = null;
    if (from && to && to >= from) {
      available = !bookings.some((b) => from <= b.endDate && to >= b.startDate);
    }

    return res.status(200).json({
      productId,
      isRentable: product.isRentable,
      rentalDailyPrice: product.rentalDailyPrice,
      rentalDeposit: product.rentalDeposit,
      bookedRanges: bookings.map((b) => ({ startDate: b.startDate, endDate: b.endDate })),
      available
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error checking availability', error: error.message });
  }
};

// POST /api/rentals  (BUYER)  { productId, startDate, endDate, note? }
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { productId, startDate, endDate, note } = req.body;

    const start = parseDay(startDate);
    const end = parseDay(endDate);
    if (!start || !end) return res.status(400).json({ message: 'Valid startDate and endDate are required' });
    if (end < start) return res.status(400).json({ message: 'endDate must be on or after startDate' });
    if (start < new Date(Date.now() - DAY_MS)) {
      return res.status(400).json({ message: 'startDate cannot be in the past' });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { shop: { select: { id: true, shopName: true, userId: true, vacationMode: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (!product.isRentable || !product.rentalDailyPrice) {
      return res.status(400).json({ message: 'This product is not available for rent' });
    }
    if (product.shop.vacationMode) {
      return res.status(400).json({ message: `Мағозаи «${product.shop.shopName}» ҳоло дар таътил аст` });
    }

    // Overlap check against blocking bookings.
    const clash = await prisma.rentalBooking.findFirst({
      where: {
        productId,
        status: { in: BLOCKING_STATUSES },
        startDate: { lte: end },
        endDate: { gte: start }
      }
    });
    if (clash) {
      return res.status(409).json({ message: 'Ин сана банд аст — санаи дигарро интихоб кунед' });
    }

    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
    const dailyPrice = product.rentalDailyPrice;
    const deposit = product.rentalDeposit ?? 0;
    const totalPrice = +(days * dailyPrice).toFixed(2);

    const booking = await prisma.rentalBooking.create({
      data: {
        productId,
        userId: req.user.id,
        startDate: start,
        endDate: end,
        days,
        dailyPrice,
        deposit,
        totalPrice,
        note: note ? String(note).slice(0, 300) : null
      },
      include: bookingInclude
    });

    // Tell the seller a new rental request came in.
    await createNotification(
      product.shop.userId,
      'Дархости иҷораи нав 🗓️',
      `«${product.name}» — ${days} рӯз, аз ${start.toISOString().slice(0, 10)} то ${end.toISOString().slice(0, 10)} (${totalPrice} сомонӣ).`,
      { type: 'RENTAL_REQUEST', bookingId: booking.id, productId }
    );

    return res.status(201).json({ message: 'Дархости иҷора фиристода шуд', booking: shapeBooking(booking) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating booking', error: error.message });
  }
};

// GET /api/rentals/mine  (BUYER) — my rentals
export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const bookings = await prisma.rentalBooking.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: bookingInclude
    });
    return res.status(200).json({ bookings: bookings.map(shapeBooking) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving bookings', error: error.message });
  }
};

// GET /api/rentals/shop  (SELLER) — bookings for my products
export const getShopBookings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });
    const bookings = await prisma.rentalBooking.findMany({
      where: { product: { shopId: shop.id } },
      orderBy: { createdAt: 'desc' },
      include: bookingInclude
    });
    return res.status(200).json({ bookings: bookings.map(shapeBooking) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving bookings', error: error.message });
  }
};

// PATCH /api/rentals/:id/status  (SELLER)  { status }  → CONFIRMED | ACTIVE | RETURNED | CANCELLED
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const next = String(req.body.status || '').toUpperCase();
    const allowed = ['CONFIRMED', 'ACTIVE', 'RETURNED', 'CANCELLED'];
    if (!allowed.includes(next)) {
      return res.status(400).json({ message: `status must be one of ${allowed.join(', ')}` });
    }

    const booking = await prisma.rentalBooking.findUnique({
      where: { id },
      include: { product: { include: { shop: { select: { userId: true } } } } }
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not manage this rental' });
    }

    const updated = await prisma.rentalBooking.update({
      where: { id },
      data: { status: next },
      include: bookingInclude
    });

    const labels: Record<string, string> = {
      CONFIRMED: 'Дархости иҷораи шумо тасдиқ шуд ✅',
      ACTIVE: 'Иҷораи шумо оғоз ёфт 🔑',
      RETURNED: 'Иҷора анҷом ёфт — гарав баргардонида мешавад',
      CANCELLED: 'Дархости иҷора бекор карда шуд'
    };
    await createNotification(booking.userId, labels[next], `«${booking.product.name}»`, {
      type: 'RENTAL_STATUS',
      bookingId: id,
      status: next
    });

    return res.status(200).json({ message: 'Booking updated', booking: shapeBooking(updated) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating booking', error: error.message });
  }
};

// PATCH /api/rentals/:id/cancel  (BUYER) — cancel own pending/confirmed booking
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const booking = await prisma.rentalBooking.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { shop: { select: { userId: true } } } } }
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.userId !== req.user.id) return res.status(403).json({ message: 'You do not own this booking' });
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Only a pending or confirmed rental can be cancelled' });
    }

    const updated = await prisma.rentalBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: bookingInclude
    });

    await createNotification(
      booking.product.shop.userId,
      'Дархости иҷора бекор шуд',
      `«${booking.product.name}» — харидор дархостро бекор кард.`,
      { type: 'RENTAL_CANCELLED', bookingId: booking.id }
    );

    return res.status(200).json({ message: 'Дархост бекор шуд', booking: shapeBooking(updated) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error cancelling booking', error: error.message });
  }
};
