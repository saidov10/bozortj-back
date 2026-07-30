import prisma from '../config/prisma';
import { sendLiveNotification } from './chatSocket';

// Helper to create notifications in database and broadcast live.
// `meta` is not persisted (Notification table stays simple) — it's extra
// real-time-only data (e.g. { type: 'NEW_ORDER', orderId }) so the frontend
// can react instantly (play a sound, deep-link) without waiting for a refetch.
export const createNotification = async (
  userId: string,
  title: string,
  content: string,
  meta?: Record<string, any>
) => {
  try {
    await prisma.notification.create({
      data: { userId, title, content }
    });
    // Broadcast live to socket room
    sendLiveNotification(userId, title, content, meta);
  } catch (err) {
    console.error('Failed to create notification record:', err);
  }
};
