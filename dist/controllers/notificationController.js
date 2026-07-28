"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsRead = exports.getNotifications = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get user notifications
const getNotifications = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const notifications = await prisma_1.default.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json({ notifications });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving notifications', error: error.message });
    }
};
exports.getNotifications = getNotifications;
// 2. Mark notification as read
const markAsRead = async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const { id } = req.params;
        const notification = await prisma_1.default.notification.findUnique({
            where: { id }
        });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        if (notification.userId !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: Access denied' });
        }
        const updated = await prisma_1.default.notification.update({
            where: { id },
            data: { isRead: true }
        });
        return res.status(200).json({ message: 'Notification marked as read', notification: updated });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating notification', error: error.message });
    }
};
exports.markAsRead = markAsRead;
