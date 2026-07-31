import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLocalizedNotification } from '../services/notificationService';
import { broadcastOrderStatus } from '../services/chatSocket';
import { orderStatusLabel } from '../config/messages';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';

// Courier module (модули курер): a new COURIER role. Sellers assign orders to a
// courier; the courier moves the order through SHIPPED → DELIVERED (from the app
// or the Telegram bot), and the buyer sees each step live.

// POST /api/couriers/register  (public) — a delivery person signs up
export const registerCourier = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'name, email, phone and password are required' });
    }
    if (!/^\+992\d{9}$/.test(phone)) {
      return res.status(400).json({ message: 'Phone must start with +992 followed by 9 digits' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (exists) return res.status(400).json({ message: 'User with this email or phone already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, phone, password: hashed, role: 'COURIER' }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.status(201).json({
      message: 'Courier registered',
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error registering courier', error: error.message });
  }
};

// GET /api/couriers  (SELLER/ADMIN) — pick-list of couriers to assign
export const listCouriers = async (req: AuthRequest, res: Response) => {
  try {
    const couriers = await prisma.user.findMany({
      where: { role: 'COURIER', isBlocked: false },
      select: { id: true, name: true, phone: true }
    });
    return res.status(200).json({ couriers });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error listing couriers', error: error.message });
  }
};

// POST /api/orders/:id/assign-courier  (SELLER/ADMIN)  { courierId }
export const assignCourier = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const { courierId } = req.body;

    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // A seller may only assign orders that include their products.
    if (req.user.role === 'SELLER') {
      const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
      if (!shop || !order.items.some((i) => i.shopId === shop.id)) {
        return res.status(403).json({ message: 'This order has no items from your shop' });
      }
    }

    const courier = await prisma.user.findFirst({ where: { id: courierId, role: 'COURIER' } });
    if (!courier) return res.status(400).json({ message: 'Invalid courier' });

    await prisma.order.update({ where: { id }, data: { courierId } });

    await createLocalizedNotification(
      courierId,
      'order.newForSeller',
      { shopName: 'Bozor TJ' },
      { type: 'COURIER_ASSIGNED', orderId: id }
    );

    return res.status(200).json({ message: 'Courier assigned', courier: { id: courier.id, name: courier.name } });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error assigning courier', error: error.message });
  }
};

// GET /api/courier/deliveries  (COURIER) — orders assigned to me
export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const orders = await prisma.order.findMany({
      where: { courierId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        address: true,
        user: { select: { name: true, phone: true } },
        items: { include: { variant: { include: { product: { select: { name: true } } } } } }
      }
    });
    return res.status(200).json({ deliveries: orders });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving deliveries', error: error.message });
  }
};

// PUT /api/courier/deliveries/:id/status  (COURIER)  { status }
// Courier can move an assigned order to SHIPPED (picked up) or DELIVERED.
export const updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['SHIPPED', 'DELIVERED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Courier can only set SHIPPED or DELIVERED' });
    }

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.courierId !== req.user.id) {
      return res.status(403).json({ message: 'This delivery is not assigned to you' });
    }

    await prisma.order.update({ where: { id }, data: { status } });
    await prisma.orderStatusHistory.create({
      data: { orderId: id, status, note: 'Updated by courier' }
    });

    const buyer = await prisma.user.findUnique({ where: { id: order.userId }, select: { language: true } });
    await createLocalizedNotification(
      order.userId,
      'order.statusChanged',
      { shortId: id.substring(0, 8), statusLabel: orderStatusLabel(buyer?.language, status) },
      { type: 'ORDER_STATUS', orderId: id, status }
    );
    broadcastOrderStatus(order.userId, { orderId: id, status, note: 'Updated by courier' });

    return res.status(200).json({ message: 'Delivery status updated', status });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating delivery status', error: error.message });
  }
};
