import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// 1. Create Report (Buyer Only)
export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'BUYER') return res.status(403).json({ message: 'Only buyers can submit complaints' });

    const { productId, shopId, reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Reason for report is required' });
    }

    if (!productId && !shopId) {
      return res.status(400).json({ message: 'Either a productId or shopId must be specified' });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: req.user.id,
        productId: productId || null,
        shopId: shopId || null,
        reason
      }
    });

    return res.status(201).json({
      message: 'Report submitted successfully. The Administrator will review it.',
      report
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error submitting report', error: error.message });
  }
};

// 2. Get All Reports (Admin Only)
export const getReports = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const reports = await prisma.report.findMany({
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true } },
        shop: { select: { id: true, shopName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ reports });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving reports', error: error.message });
  }
};

// 3. Resolve or Dismiss Report (Admin Only)
export const updateReportStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { status } = req.body; // "RESOLVED" or "DISMISSED"

    if (!status || (status !== 'RESOLVED' && status !== 'DISMISSED')) {
      return res.status(400).json({ message: 'Status must be RESOLVED or DISMISSED' });
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) return res.status(404).json({ message: 'Report not found' });

    const updated = await prisma.report.update({
      where: { id },
      data: { status }
    });

    return res.status(200).json({ message: 'Report status updated successfully', report: updated });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating report status', error: error.message });
  }
};

// 4. Toggle User Block Status (Admin Only)
export const toggleUserBlock = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { userId } = req.params;
    const { block } = req.body; // boolean

    if (block === undefined) {
      return res.status(400).json({ message: 'block boolean value is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'ADMIN') {
      return res.status(400).json({ message: 'Cannot block/unblock an Administrator' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: block }
    });

    // Create Notification
    await prisma.notification.create({
      data: {
        userId: userId,
        title: block ? 'Account Blocked' : 'Account Unblocked',
        content: block
          ? 'Your account has been suspended by the Administrator due to violation of policies.'
          : 'Your account has been reactivated by the Administrator.'
      }
    }).catch(() => {});

    return res.status(200).json({
      message: `User account has been successfully ${block ? 'blocked' : 'unblocked'}`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isBlocked: updatedUser.isBlocked
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating user block status', error: error.message });
  }
};

// 5. Get All Users (Admin Only)
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Only admins can retrieve all users' });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        shopProfile: {
          select: {
            id: true,
            shopName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ users });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving users', error: error.message });
  }
};
