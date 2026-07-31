import prisma from '../config/prisma';
import { sendLiveNotification } from './chatSocket';
import { notifyTelegram, InlineKeyboard } from './telegramService';
import { notifyWebPush } from './webPushService';

// Options for extra per-channel behaviour that isn't persisted.
interface NotificationOptions {
  telegramButtons?: InlineKeyboard; // inline action buttons for the Telegram message
}

// Helper to create notifications in database and broadcast live.
// `meta` is not persisted (Notification table stays simple) — it's extra
// real-time-only data (e.g. { type: 'NEW_ORDER', orderId }) so the frontend
// can react instantly (play a sound, deep-link) without waiting for a refetch.
//
// The same notification is fanned out to every channel the user has connected:
//   • in-app socket (live)   • Telegram bot   • Web Push (PWA)
// Telegram/Web Push are fire-and-forget and no-op when unconfigured, so they
// never slow down or break the primary write.
export const createNotification = async (
  userId: string,
  title: string,
  content: string,
  meta?: Record<string, any>,
  options?: NotificationOptions
) => {
  try {
    await prisma.notification.create({
      data: { userId, title, content }
    });
    // Broadcast live to socket room
    sendLiveNotification(userId, title, content, meta);
    // Mirror to external push channels (do not await — best-effort).
    void notifyTelegram(userId, title, content, options?.telegramButtons);
    void notifyWebPush(userId, title, content, meta);
  } catch (err) {
    console.error('Failed to create notification record:', err);
  }
};
