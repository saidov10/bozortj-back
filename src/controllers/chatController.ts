import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

// 1. Get List of Conversations (contacts who have messaged with current user)
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.id;

    // Fetch all messages involving the user
    const messages = await prisma.message.findMany({
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
    const partnerIds = new Set<string>();
    messages.forEach((msg) => {
      if (msg.senderId !== userId) partnerIds.add(msg.senderId);
      if (msg.receiverId !== userId) partnerIds.add(msg.receiverId);
    });

    // Fetch details for each conversation partner
    const conversations = [];
    for (const partnerId of partnerIds) {
      const partner = await prisma.user.findUnique({
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

      if (!partner) continue;

      // Find the last message between user and partner
      const lastMessage = messages.find(
        (msg) =>
          (msg.senderId === userId && msg.receiverId === partnerId) ||
          (msg.senderId === partnerId && msg.receiverId === userId)
      );

      // Count unread messages sent by the partner to the user
      const unreadCount = await prisma.message.count({
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
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving conversations', error: error.message });
  }
};

// 2. Get Message History with a Specific User
export const getMessageHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.id;
    const { partnerId } = req.params;

    // Check if partner exists
    const partnerExists = await prisma.user.findUnique({ where: { id: partnerId } });
    if (!partnerExists) {
      return res.status(404).json({ message: 'Conversation partner not found' });
    }

    // Mark messages from partner as read
    await prisma.message.updateMany({
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
    const messages = await prisma.message.findMany({
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
  } catch (error: any) {
    return res.status(500).json({ message: 'Error fetching message history', error: error.message });
  }
};
