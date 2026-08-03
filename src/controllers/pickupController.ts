import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// Pickup points (нуқтаҳои гирифтан / ПВЗ): partner locations where buyers collect
// their orders instead of paying for courier delivery. Admins manage the network;
// buyers list active points and pick one at checkout (deliveryType=PICKUP_POINT).

// GET /api/pickup-points?city=  (public) — active points, optionally by city
export const getPickupPoints = async (req: AuthRequest, res: Response) => {
  try {
    const where: any = { isActive: true };
    if (req.query.city) where.city = { equals: String(req.query.city), mode: 'insensitive' };

    const points = await prisma.pickupPoint.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }]
    });
    return res.status(200).json({ points });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving pickup points', error: error.message });
  }
};

// GET /api/pickup-points/cities  (public) — distinct cities that have active points
export const getPickupCities = async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.pickupPoint.findMany({
      where: { isActive: true },
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' }
    });
    return res.status(200).json({ cities: rows.map((r) => r.city) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving cities', error: error.message });
  }
};

// GET /api/pickup-points/all  (ADMIN) — including inactive
export const getAllPickupPoints = async (_req: AuthRequest, res: Response) => {
  try {
    const points = await prisma.pickupPoint.findMany({ orderBy: { createdAt: 'desc' } });
    return res.status(200).json({ points });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving pickup points', error: error.message });
  }
};

// POST /api/pickup-points  (ADMIN)
export const createPickupPoint = async (req: AuthRequest, res: Response) => {
  try {
    const { name, city, address, landmark, phone, workingHours, lat, lng } = req.body;
    if (!name || !city || !address) {
      return res.status(400).json({ message: 'name, city and address are required' });
    }
    const point = await prisma.pickupPoint.create({
      data: {
        name: String(name).trim(),
        city: String(city).trim(),
        address: String(address).trim(),
        landmark: landmark ? String(landmark).trim() : null,
        phone: phone ? String(phone).trim() : null,
        workingHours: workingHours ? String(workingHours).trim() : null,
        lat: lat !== undefined && lat !== '' ? parseFloat(lat) : null,
        lng: lng !== undefined && lng !== '' ? parseFloat(lng) : null
      }
    });
    return res.status(201).json({ message: 'Нуқтаи гирифтан сохта шуд', point });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating pickup point', error: error.message });
  }
};

// PUT /api/pickup-points/:id  (ADMIN)
export const updatePickupPoint = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.pickupPoint.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Pickup point not found' });

    const data: any = {};
    const b = req.body;
    if (b.name !== undefined) data.name = String(b.name).trim();
    if (b.city !== undefined) data.city = String(b.city).trim();
    if (b.address !== undefined) data.address = String(b.address).trim();
    if (b.landmark !== undefined) data.landmark = b.landmark ? String(b.landmark).trim() : null;
    if (b.phone !== undefined) data.phone = b.phone ? String(b.phone).trim() : null;
    if (b.workingHours !== undefined) data.workingHours = b.workingHours ? String(b.workingHours).trim() : null;
    if (b.lat !== undefined) data.lat = b.lat === '' ? null : parseFloat(b.lat);
    if (b.lng !== undefined) data.lng = b.lng === '' ? null : parseFloat(b.lng);
    if (b.isActive !== undefined) data.isActive = b.isActive === true || b.isActive === 'true';

    const point = await prisma.pickupPoint.update({ where: { id }, data });
    return res.status(200).json({ message: 'Нуқтаи гирифтан навсозӣ шуд', point });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating pickup point', error: error.message });
  }
};

// DELETE /api/pickup-points/:id  (ADMIN) — soft delete (deactivate) so past orders keep the link
export const deletePickupPoint = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.pickupPoint.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Pickup point not found' });
    await prisma.pickupPoint.update({ where: { id }, data: { isActive: false } });
    return res.status(200).json({ message: 'Нуқтаи гирифтан ғайрифаъол шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error deleting pickup point', error: error.message });
  }
};
