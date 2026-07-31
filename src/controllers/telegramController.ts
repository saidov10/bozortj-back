import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { isTelegramConfigured, createTelegramLink } from '../services/telegramService';

// GET /api/telegram/link — get a deep link the user opens to connect Telegram.
export const getTelegramLink = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: 'Telegram bot is not configured', configured: false });
    }

    const { code, url, botUsername } = await createTelegramLink(req.user.id);
    return res.status(200).json({ configured: true, code, url, botUsername });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating Telegram link', error: error.message });
  }
};

// GET /api/telegram/status — is this user's Telegram linked?
export const getTelegramStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { telegramChatId: true }
    });
    return res.status(200).json({ configured: isTelegramConfigured(), linked: Boolean(user?.telegramChatId) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error checking Telegram status', error: error.message });
  }
};

// DELETE /api/telegram/link — disconnect Telegram.
export const unlinkTelegram = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { telegramChatId: null, telegramLinkCode: null }
    });
    return res.status(200).json({ message: 'Telegram disconnected' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error disconnecting Telegram', error: error.message });
  }
};
