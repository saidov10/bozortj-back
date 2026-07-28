import prisma from '../config/prisma';
import { sendLiveNotification } from './chatSocket';

// Helper to create notifications in database and broadcast live
export const createNotification = async (userId: string, title: string, content: string) => {
  try {
    await prisma.notification.create({
      data: { userId, title, content }
    });
    // Broadcast live to socket room
    sendLiveNotification(userId, title, content);
  } catch (err) {
    console.error('Failed to create notification record:', err);
  }
};
