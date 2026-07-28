"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageHistory = exports.getConversations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get List of Conversations (contacts who have messaged with current user)
const getConversations = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user.id;
        // Fetch all messages involving the user
        const messages = await prisma_1.default.message.findMany({
            where: {
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        // Extract unique partner IDs
        const partnerIds = new Set();
        messages.forEach((msg) => {
            if (msg.senderId !== userId)
                partnerIds.add(msg.senderId);
            if (msg.receiverId !== userId)
                partnerIds.add(msg.receiverId);
        });
        // Fetch details for each conversation partner
        const conversations = [];
        for (const partnerId of partnerIds) {
            const partner = await prisma_1.default.user.findUnique({
                where: { id: partnerId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    avatarUrl: true,
                    shopProfile: {
                        select: {
                            id: true,
                            shopName: true
                        }
                    }
                }
            });
            if (!partner)
                continue;
            // Find the last message between user and partner
            const lastMessage = messages.find((msg) => (msg.senderId === userId && msg.receiverId === partnerId) ||
                (msg.senderId === partnerId && msg.receiverId === userId));
            // Count unread messages sent by the partner to the user
            const unreadCount = await prisma_1.default.message.count({
                where: {
                    senderId: partnerId,
                    receiverId: userId,
                    isRead: false
                }
            });
            conversations.push({
                partner,
                lastMessage: lastMessage ? {
                    id: lastMessage.id,
                    text: lastMessage.text,
                    createdAt: lastMessage.createdAt,
                    isRead: lastMessage.isRead,
                    senderId: lastMessage.senderId
                } : null,
                unreadCount
            });
        }
        // Sort conversations by last message timestamp (most recent first)
        conversations.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return timeB - timeA;
        });
        return res.status(200).json({ conversations });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving conversations', error: error.message });
    }
};
exports.getConversations = getConversations;
// 2. Get Message History with a Specific User
const getMessageHistory = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user.id;
        const { partnerId } = req.params;
        // Check if partner exists
        const partnerExists = await prisma_1.default.user.findUnique({ where: { id: partnerId } });
        if (!partnerExists) {
            return res.status(404).json({ message: 'Conversation partner not found' });
        }
        // Mark messages from partner as read
        await prisma_1.default.message.updateMany({
            where: {
                senderId: partnerId,
                receiverId: userId,
                isRead: false
            },
            data: {
                isRead: true
            }
        });
        // Fetch messages sorted ascending by time
        const messages = await prisma_1.default.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: partnerId },
                    { senderId: partnerId, receiverId: userId }
                ]
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        return res.status(200).json({ messages });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error fetching message history', error: error.message });
    }
};
exports.getMessageHistory = getMessageHistory;
