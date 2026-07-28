import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// 1. Submit Refund Request (Buyer Only)
export const createRefundRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'BUYER') return res.status(403).json({ message: 'Only buyers can request refunds' });

    const { id: orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Reason for return is required' });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this order' });
    }

    if (order.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Cannot request refund for a cancelled order' });
    }

    // Check if refund request already exists
    const existingRequest = await prisma.refundRequest.findUnique({
      where: { orderId }
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Refund request already submitted for this order' });
    }

    const files = req.files as Express.Multer.File[];

    const refundRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.refundRequest.create({
        data: {
          orderId,
          reason,
          status: 'PENDING'
        }
      });

      if (files && files.length > 0) {
        const imageRecords = files.map((file) => ({
          refundRequestId: request.id,
          url: `/uploads/refunds/${file.filename}`
        }));
        await tx.refundImage.createMany({ data: imageRecords });
      }

      return tx.refundRequest.findUnique({
        where: { id: request.id },
        include: { images: true }
      });
    });

    // Notify sellers
    const uniqueShopIds = Array.from(new Set(order.items.map((item) => item.shopId)));
    for (const shopId of uniqueShopIds) {
      const shop = await prisma.shopProfile.findUnique({
        where: { id: shopId }
      });
      if (shop) {
        await createNotification(
          shop.userId,
          'Return & Refund Requested',
          `A return has been requested for Order #${order.id.substring(0, 8)}. Reason: ${reason}`
        );
      }
    }

    return res.status(201).json({
      message: 'Refund request submitted successfully',
      refundRequest
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error requesting refund', error: error.message });
  }
};

// 2. Process Refund Request (Seller Only)
export const processRefundRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'SELLER') return res.status(403).json({ message: 'Only sellers can process refunds' });

    const { id: orderId } = req.params;
    const { status, explanation } = req.body;

    if (!['APPROVED', 'REJECTED', 'DISPUTED'].includes(status)) {
      return res.status(400).json({ message: 'Status must be APPROVED, REJECTED, or DISPUTED' });
    }

    const shop = await prisma.shopProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop profile not found' });
    }

    const refundRequest = await prisma.refundRequest.findUnique({
      where: { orderId },
      include: {
        order: {
          include: { items: true }
        }
      }
    });

    if (!refundRequest) {
      return res.status(404).json({ message: 'Refund request not found' });
    }

    // Verify seller sells items in this order
    const sellerOwnsItems = refundRequest.order.items.some((item) => item.shopId === shop.id);
    if (!sellerOwnsItems) {
      return res.status(403).json({ message: 'You do not have items in this order to process' });
    }

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.refundRequest.update({
        where: { orderId },
        data: {
          status,
          explanation: explanation || null
        }
      });

      // If approved, restock products
      if (status === 'APPROVED') {
        for (const item of refundRequest.order.items) {
          // Increment variant stock
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              stockQuantity: {
                increment: item.quantity
              }
            }
          });

          // Fetch variant to get productId
          const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          if (v) {
            await tx.product.update({
              where: { id: v.productId },
              data: {
                stockQuantity: {
                  increment: item.quantity
                }
              }
            });
          }
        }

        // Set order status to CANCELLED/REFUNDED
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' }
        });
      }

      return request;
    });

    // Notify buyer
    await createNotification(
      refundRequest.order.userId,
      `Refund Request ${status}`,
      `Your refund request for Order #${orderId.substring(0, 8)} has been updated to ${status}. Note: ${explanation || 'None'}`
    );

    return res.status(200).json({
      message: `Refund request updated to ${status}`,
      refundRequest: updatedRequest
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error processing refund', error: error.message });
  }
};

// 3. Admin Dispute Resolution (Admin Only)
export const resolveRefundDispute = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Only admins can resolve disputes' });

    const { id: orderId } = req.params;
    const { status, explanation } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ message: 'Resolution status must be APPROVED or REJECTED' });
    }

    const refundRequest = await prisma.refundRequest.findUnique({
      where: { orderId },
      include: {
        order: {
          include: { items: true }
        }
      }
    });

    if (!refundRequest) {
      return res.status(404).json({ message: 'Refund request not found' });
    }

    const resolvedRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.refundRequest.update({
        where: { orderId },
        data: {
          status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          explanation: `Dispute Resolved by Admin: ${explanation || 'No detail'}`
        }
      });

      if (status === 'APPROVED') {
        for (const item of refundRequest.order.items) {
          // Increment stock
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              stockQuantity: {
                increment: item.quantity
              }
            }
          });

          const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          if (v) {
            await tx.product.update({
              where: { id: v.productId },
              data: {
                stockQuantity: {
                  increment: item.quantity
                }
              }
            });
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' }
        });
      }

      return request;
    });

    // Notify buyer
    await createNotification(
      refundRequest.order.userId,
      'Refund Dispute Resolved',
      `Admin resolved the dispute for Order #${orderId.substring(0, 8)} as ${status}.`
    );

    return res.status(200).json({
      message: 'Dispute resolved successfully',
      refundRequest: resolvedRequest
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error resolving dispute', error: error.message });
  }
};
