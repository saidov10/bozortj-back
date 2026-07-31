import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { isTelegramConfigured, createTelegramLink, validateMiniAppInitData } from '../services/telegramService';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';

// POST /api/telegram/miniapp-auth  (public)
// The Telegram Mini App sends window.Telegram.WebApp.initData; we verify it and,
// if that Telegram account is already linked to a Bozor TJ user, issue a JWT so
// the shop works fully inside Telegram. Unlinked users are told to link first
// on the website (buyer/seller accounts require an email & phone).
export const miniAppAuth = async (req: Request, res: Response) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: 'Telegram bot is not configured' });
    }
    const { initData } = req.body as { initData?: string };
    if (!initData) return res.status(400).json({ message: 'initData is required' });

    const tg = validateMiniAppInitData(initData);
    if (!tg) return res.status(401).json({ message: 'Invalid Telegram signature' });

    const user = await prisma.user.findUnique({ where: { telegramChatId: tg.telegramId } });
    if (!user) {
      return res.status(404).json({
        message: 'This Telegram account is not linked yet. Link it from your profile on the website first.',
        linked: false
      });
    }
    if (user.isBlocked) return res.status(403).json({ message: 'Your account has been blocked' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error authenticating via Telegram', error: error.message });
  }
};

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
