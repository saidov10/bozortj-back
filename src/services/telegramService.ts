import crypto from 'crypto';
import prisma from '../config/prisma';

// Telegram bot integration — mirrors in-app notifications to Telegram, where
// Tajik users actually are. The bot is optional: everything here no-ops safely
// when TELEGRAM_BOT_TOKEN is not set, so the app runs fine without it.
//
// Linking flow:
//   1. Logged-in user calls GET /api/telegram/link → gets a deep link
//      (https://t.me/<bot>?start=<code>).
//   2. User opens it and presses Start; Telegram sends us "/start <code>".
//   3. We match the code to the user and store their chat id. From then on,
//      every createNotification() is also delivered to Telegram.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export const isTelegramConfigured = (): boolean => Boolean(TOKEN);

// Cached bot username (for building the ?start= deep link), fetched via getMe.
let cachedBotUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;

export const getBotUsername = async (): Promise<string | null> => {
  if (cachedBotUsername) return cachedBotUsername;
  if (!isTelegramConfigured()) return null;
  try {
    const res = await fetch(`${API}/getMe`);
    const data: any = await res.json();
    if (data.ok && data.result?.username) {
      cachedBotUsername = data.result.username;
    }
  } catch (err) {
    console.error('Telegram getMe failed:', err);
  }
  return cachedBotUsername;
};

// Low-level send. Returns true on success. Telegram uses HTML parse mode so we
// can bold titles; callers should pass plain text (we escape it).
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sendTelegramMessage = async (chatId: string, title: string, content: string): Promise<boolean> => {
  if (!isTelegramConfigured()) return false;
  try {
    const text = `<b>${escapeHtml(title)}</b>\n${escapeHtml(content)}`;
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data: any = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error('Telegram sendMessage failed:', err);
    return false;
  }
};

// Deliver a notification to a user's linked Telegram, if any. Fire-and-forget:
// callers should not await this on the critical path.
export const notifyTelegram = async (userId: string, title: string, content: string): Promise<void> => {
  if (!isTelegramConfigured()) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true }
    });
    if (user?.telegramChatId) {
      await sendTelegramMessage(user.telegramChatId, title, content);
    }
  } catch (err) {
    console.error('notifyTelegram failed:', err);
  }
};

// Create (or refresh) a link code for a user and return the deep link they open.
export const createTelegramLink = async (
  userId: string
): Promise<{ code: string; url: string | null; botUsername: string | null }> => {
  const code = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
  const botUsername = await getBotUsername();
  const url = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  return { code, url, botUsername };
};

// Handle a single incoming Telegram update (from long polling). We only care
// about "/start <code>" messages used for account linking.
const handleUpdate = async (update: any): Promise<void> => {
  const message = update.message;
  if (!message || !message.text || !message.chat) return;

  const chatId = String(message.chat.id);
  const text: string = message.text.trim();

  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const code = parts[1];

    if (!code) {
      await sendTelegramMessage(
        chatId,
        'Салом! 👋',
        'Барои пайваст кардани ҳисоби Bozor TJ, дар профили худ дар сайт тугмаи «Пайваст ба Telegram»-ро зер кунед.'
      );
      return;
    }

    const user = await prisma.user.findUnique({ where: { telegramLinkCode: code } });
    if (!user) {
      await sendTelegramMessage(chatId, 'Код нодуруст ❌', 'Ин код нодуруст ё кӯҳна аст. Лутфан аз сайт коди навро гиред.');
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkCode: null }
    });

    await sendTelegramMessage(
      chatId,
      'Пайваст шуд! ✅',
      `Салом, ${user.name}! Акнун ҳамаи огоҳиномаҳои Bozor TJ ба ин ҷо мерасанд — фармоишҳо, паёмҳо, флеш-фурӯшҳо ва пешниҳодҳои нарх. 🛒`
    );
  }
};

// Start long-polling the Telegram getUpdates endpoint. Chosen over webhooks
// because it needs no public URL config and works fine on Render's free tier
// (polling simply advances while the app is awake).
export const startTelegramBot = (): void => {
  if (!isTelegramConfigured()) {
    console.log('ℹ️  Telegram bot disabled (TELEGRAM_BOT_TOKEN not set)');
    return;
  }

  let offset = 0;
  let stopped = false;

  const poll = async (): Promise<void> => {
    while (!stopped) {
      try {
        const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            await handleUpdate(update).catch((e) => console.error('Telegram update error:', e));
          }
        }
      } catch (err) {
        // Network hiccup / app waking up: back off briefly and retry.
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  void getBotUsername().then((u) =>
    console.log(u ? `🤖 Telegram bot @${u} started (long polling)` : '🤖 Telegram bot started (long polling)')
  );
  void poll();
};
