import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';
import { PROVIDERS, getProvider, startProviderPayment } from '../services/paymentService';

// GET /api/payments/providers — list of selectable payment methods for checkout.
export const getPaymentProviders = async (_req: AuthRequest, res: Response) => {
  const providers = PROVIDERS.filter((p) => p.enabled).map(({ id, label, online, description }) => ({
    id,
    label,
    online,
    description
  }));
  return res.status(200).json({ providers });
};

// POST /api/payments/initiate — body { orderId, provider }. Creates the Payment
// record and returns the next step (a redirect URL for online providers, or
// instructions for COD).
export const initiatePayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { orderId, provider: providerId } = req.body;
    if (!orderId || !providerId) {
      return res.status(400).json({ message: 'orderId and provider are required' });
    }

    const provider = getProvider(providerId);
    if (!provider) return res.status(400).json({ message: 'Unknown or disabled payment provider' });

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.userId !== req.user.id) return res.status(403).json({ message: 'This is not your order' });
    if (order.payment?.status === 'PAID') {
      return res.status(400).json({ message: 'This order is already paid' });
    }

    const payment = await prisma.payment.upsert({
      where: { orderId },
      update: { provider: provider.id, amount: order.totalPrice, status: 'PENDING' },
      create: { orderId, provider: provider.id, amount: order.totalPrice, status: 'PENDING' }
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: provider.online ? 'ONLINE' : 'COD' }
    });

    const next = startProviderPayment(provider, { id: payment.id, amount: payment.amount });

    return res.status(200).json({
      message: 'Payment initiated',
      payment: { id: payment.id, provider: payment.provider, amount: payment.amount, status: payment.status },
      paymentUrl: next.paymentUrl,
      instructions: next.instructions
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error initiating payment', error: error.message });
  }
};

// POST /api/payments/:id/confirm — marks a payment PAID.
// For MOCK this simulates the buyer completing checkout; for real providers this
// is where the (signature-verified) provider webhook would land.
export const confirmPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { order: { include: { items: { select: { shopId: true } } } } }
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    // Only the simulated provider can be confirmed via this open endpoint. Real
    // providers must confirm through their signed webhook (to be implemented).
    if (payment.provider !== 'MOCK') {
      return res.status(400).json({ message: 'This provider is confirmed via its own webhook' });
    }
    if (payment.status === 'PAID') {
      return res.status(200).json({ message: 'Already paid' });
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), reference: `MOCK-${Date.now()}` }
    });

    // Notify buyer.
    await createNotification(
      payment.order.userId,
      '💳 Пардохт қабул шуд',
      `Пардохти фармоиши #${payment.orderId.substring(0, 8)} ба маблағи ${payment.amount} с. бомуваффақият анҷом ёфт.`,
      { type: 'PAYMENT_PAID', orderId: payment.orderId }
    );

    // Notify each seller whose items are in the order.
    const shopIds = Array.from(new Set(payment.order.items.map((i) => i.shopId)));
    for (const sId of shopIds) {
      const shop = await prisma.shopProfile.findUnique({ where: { id: sId }, select: { userId: true } });
      if (shop) {
        await createNotification(
          shop.userId,
          '💳 Фармоиши пардохтшуда',
          `Фармоиши #${payment.orderId.substring(0, 8)} онлайн пардохт шуд.`,
          { type: 'ORDER_PAID', orderId: payment.orderId }
        );
      }
    }

    return res.status(200).json({ message: 'Пардохт тасдиқ шуд', payment: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error confirming payment', error: error.message });
  }
};

// GET /api/payments/order/:orderId — current payment status for an order.
export const getPaymentByOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied' });
    }

    return res.status(200).json({ payment: order.payment, paymentMethod: order.paymentMethod });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving payment', error: error.message });
  }
};
