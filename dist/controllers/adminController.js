"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.toggleUserBlock = exports.updateReportStatus = exports.getReports = exports.createReport = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Create Report (Buyer Only)
const createReport = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        if (req.user.role !== 'BUYER')
            return res.status(403).json({ message: 'Only buyers can submit complaints' });
        const { productId, shopId, reason } = req.body;
        if (!reason || reason.trim() === '') {
            return res.status(400).json({ message: 'Reason for report is required' });
        }
        if (!productId && !shopId) {
            return res.status(400).json({ message: 'Either a productId or shopId must be specified' });
        }
        const report = await prisma_1.default.report.create({
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error submitting report', error: error.message });
    }
};
exports.createReport = createReport;
// 2. Get All Reports (Admin Only)
const getReports = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const reports = await prisma_1.default.report.findMany({
            include: {
                reporter: { select: { id: true, name: true, email: true } },
                product: { select: { id: true, name: true } },
                shop: { select: { id: true, shopName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json({ reports });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving reports', error: error.message });
    }
};
exports.getReports = getReports;
// 3. Resolve or Dismiss Report (Admin Only)
const updateReportStatus = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const { status } = req.body; // "RESOLVED" or "DISMISSED"
        if (!status || (status !== 'RESOLVED' && status !== 'DISMISSED')) {
            return res.status(400).json({ message: 'Status must be RESOLVED or DISMISSED' });
        }
        const report = await prisma_1.default.report.findUnique({ where: { id } });
        if (!report)
            return res.status(404).json({ message: 'Report not found' });
        const updated = await prisma_1.default.report.update({
            where: { id },
            data: { status }
        });
        return res.status(200).json({ message: 'Report status updated successfully', report: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating report status', error: error.message });
    }
};
exports.updateReportStatus = updateReportStatus;
// 4. Toggle User Block Status (Admin Only)
const toggleUserBlock = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { userId } = req.params;
        const { block } = req.body; // boolean
        if (block === undefined) {
            return res.status(400).json({ message: 'block boolean value is required' });
        }
        const user = await prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ message: 'User not found' });
        if (user.role === 'ADMIN') {
            return res.status(400).json({ message: 'Cannot block/unblock an Administrator' });
        }
        const updatedUser = await prisma_1.default.user.update({
            where: { id: userId },
            data: { isBlocked: block }
        });
        // Create Notification
        await prisma_1.default.notification.create({
            data: {
                userId: userId,
                title: block ? 'Account Blocked' : 'Account Unblocked',
                content: block
                    ? 'Your account has been suspended by the Administrator due to violation of policies.'
                    : 'Your account has been reactivated by the Administrator.'
            }
        }).catch(() => { });
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating user block status', error: error.message });
    }
};
exports.toggleUserBlock = toggleUserBlock;
// 5. Get All Users (Admin Only)
const getUsers = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        if (req.user.role !== 'ADMIN')
            return res.status(403).json({ message: 'Only admins can retrieve all users' });
        const users = await prisma_1.default.user.findMany({
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
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving users', error: error.message });
    }
};
exports.getUsers = getUsers;
