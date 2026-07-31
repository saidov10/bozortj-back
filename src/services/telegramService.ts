import crypto from 'crypto';
import prisma from '../config/prisma';
import { ServiceError } from '../utils/serviceError';
import { acceptOffer, rejectOffer } from './offerService';
import { sellerAdvanceOrderStatus, getSellerDailySummary, getBuyerRecentOrders } from './orderService';

// Telegram bot integration — mirrors in-app notifications to Telegram AND lets
// users act straight from the chat: sellers accept/reject price offers and
// advance order status with inline buttons, and run /today (daily summary) or
// /orders. Optional: everything no-ops safely when TELEGRAM_BOT_TOKEN is unset.
//
// Linking: buyer/seller opens https://t.me/<bot>?start=<code> (from the site),
// presses Start; we store their chat id and from then on push to Telegram.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${TOKEN}`;

export const isTelegramConfigured = (): boolean => Boolean(TOKEN);

// Inline keyboard types + helpers used by notification callers.
export interface InlineButton {
  text: string;
  callback_data: string;
}
export type InlineKeyboard = InlineButton[][];

export const buildOfferButtons = (offerId: string): InlineKeyboard => [
  [
    { text: '✅ Қабул', callback_data: `offer:accept:${offerId}` },
    { text: '❌ Рад', callback_data: `offer:reject:${offerId}` }
  ]
];

export const buildOrderButtons = (orderId: string): InlineKeyboard => [
  [
    { text: '✅ Қабул кардам', callback_data: `order:accept:${orderId}` },
    { text: '🚚 Фиристодам', callback_data: `order:ship:${orderId}` }
  ]
];

let cachedBotUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;

export const getBotUsername = async (): Promise<string | null> => {
  if (cachedBotUsername) return cachedBotUsername;
  if (!isTelegramConfigured()) return null;
  try {
    const res = await fetch(`${API}/getMe`);
    const data: any = await res.json();
    if (data.ok && data.result?.username) cachedBotUsername = data.result.username;
  } catch (err) {
    console.error('Telegram getMe failed:', err);
  }
  return cachedBotUsername;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Low-level send, optionally with an inline keyboard.
export const sendTelegramMessage = async (
  chatId: string,
  title: string,
  content: string,
  buttons?: InlineKeyboard
): Promise<boolean> => {
  if (!isTelegramConfigured()) return false;
  try {
    const text = `<b>${escapeHtml(title)}</b>\n${escapeHtml(content)}`;
    const body: any = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (buttons && buttons.length) body.reply_markup = { inline_keyboard: buttons };
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data: any = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error('Telegram sendMessage failed:', err);
    return false;
  }
};

// Deliver a notification to a user's linked Telegram, if any (fire-and-forget).
export const notifyTelegram = async (
  userId: string,
  title: string,
  content: string,
  buttons?: InlineKeyboard
): Promise<void> => {
  if (!isTelegramConfigured()) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true }
    });
    if (user?.telegramChatId) await sendTelegramMessage(user.telegramChatId, title, content, buttons);
  } catch (err) {
    console.error('notifyTelegram failed:', err);
  }
};

export const createTelegramLink = async (
  userId: string
): Promise<{ code: string; url: string | null; botUsername: string | null }> => {
  const code = crypto.randomBytes(4).toString('hex');
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
  const botUsername = await getBotUsername();
  const url = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  return { code, url, botUsername };
};

// ---- Telegram API helpers for interactive replies ----
const answerCallback = async (callbackQueryId: string, text: string): Promise<void> => {
  try {
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (err) {
    console.error('answerCallbackQuery failed:', err);
  }
};

const removeKeyboard = async (chatId: string, messageId: number): Promise<void> => {
  try {
    await fetch(`${API}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
    });
  } catch {
    /* best-effort */
  }
};

// Resolve the linked user for an incoming Telegram chat.
const findUserByChat = (chatId: string) =>
  prisma.user.findUnique({ where: { telegramChatId: chatId } });

// ---- Command handlers ----
const handleStart = async (chatId: string, code: string | undefined): Promise<void> => {
  if (!code) {
    await sendTelegramMessage(
      chatId,
      'Салом! 👋',
      'Барои пайваст кардани ҳисоби Bozor TJ, дар профили худ дар сайт тугмаи «Пайваст ба Telegram»-ро зер кунед.\n\nБаъд аз пайваст: /orders — фармоишҳо, /today — ҳисоботи имрӯз (фурӯшанда).'
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
    `Салом, ${user.name}! Акнун ҳамаи огоҳиномаҳои Bozor TJ ба ин ҷо мерасанд. Фармоишҳо ва пешниҳодҳои нархро аз ҳамин ҷо идора карда метавонед. 🛒`
  );
};

const handleOrdersCommand = async (chatId: string): Promise<void> => {
  const user = await findUserByChat(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'Пайваст нашудаед', 'Аввал ҳисобатонро дар сайт пайваст кунед.');
    return;
  }
  const orders = await getBuyerRecentOrders(user.id);
  if (orders.length === 0) {
    await sendTelegramMessage(chatId, 'Фармоишҳо', 'Шумо ҳоло фармоише надоред.');
    return;
  }
  const lines = orders
    .map((o) => `#${o.id.substring(0, 8)} — ${o.status} — ${o.totalPrice} с.`)
    .join('\n');
  await sendTelegramMessage(chatId, '🧾 Фармоишҳои охирини шумо', lines);
};

const handleTodayCommand = async (chatId: string): Promise<void> => {
  const user = await findUserByChat(chatId);
  if (!user) {
    await sendTelegramMessage(chatId, 'Пайваст нашудаед', 'Аввал ҳисобатонро дар сайт пайваст кунед.');
    return;
  }
  try {
    const s = await getSellerDailySummary(user.id);
    await sendTelegramMessage(
      chatId,
      `📊 Ҳисоботи имрӯз — ${s.shopName}`,
      `🛒 Молҳои фурӯхта: ${s.ordersItemsToday}\n💰 Даромад: ${s.revenueToday} с.\n🤝 Пешниҳодҳои нав: ${s.pendingOffers}\n❓ Саволҳои беҷавоб: ${s.pendingQuestions}`
    );
  } catch (err) {
    if (err instanceof ServiceError && err.status === 403) {
      await sendTelegramMessage(chatId, 'Танҳо барои фурӯшандагон', 'Ин фармон танҳо барои фурӯшандагон дастрас аст.');
    } else {
      await sendTelegramMessage(chatId, 'Хатогӣ', 'Ҳисоботро гирифта нашуд. Баъдтар кӯшиш кунед.');
    }
  }
};

// ---- Callback (button press) handler ----
const handleCallback = async (cq: any): Promise<void> => {
  const chatId = String(cq.message?.chat?.id ?? '');
  const messageId = cq.message?.message_id;
  const data: string = cq.data || '';
  const [domain, action, id] = data.split(':');

  const user = chatId ? await findUserByChat(chatId) : null;
  if (!user) {
    await answerCallback(cq.id, 'Аввал ҳисобатонро дар сайт пайваст кунед.');
    return;
  }

  try {
    if (domain === 'offer' && action === 'accept') {
      const code = await acceptOffer(id, user.id);
      await answerCallback(cq.id, `Қабул шуд ✅ Купон: ${code}`);
      if (messageId) await removeKeyboard(chatId, messageId);
      await sendTelegramMessage(chatId, '✅ Пешниҳод қабул шуд', `Ба харидор коди «${code}» фиристода шуд.`);
    } else if (domain === 'offer' && action === 'reject') {
      await rejectOffer(id, user.id);
      await answerCallback(cq.id, 'Рад шуд');
      if (messageId) await removeKeyboard(chatId, messageId);
    } else if (domain === 'order' && (action === 'accept' || action === 'ship')) {
      const target = action === 'accept' ? 'PROCESSING' : 'SHIPPED';
      const r = await sellerAdvanceOrderStatus(id, user.id, target);
      await answerCallback(cq.id, `Ҳолат: ${r.status} ✅`);
      if (messageId) await removeKeyboard(chatId, messageId);
      await sendTelegramMessage(chatId, '📦 Фармоиш навсозӣ шуд', `#${r.shortId} → ${r.status}`);
    } else {
      await answerCallback(cq.id, 'Амали номаълум');
    }
  } catch (err) {
    const msg = err instanceof ServiceError ? err.message : 'Хатогӣ рӯй дод';
    await answerCallback(cq.id, msg);
  }
};

// Handle a single incoming update (message command or callback query).
const handleUpdate = async (update: any): Promise<void> => {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message || !message.text || !message.chat) return;
  const chatId = String(message.chat.id);
  const text: string = message.text.trim();

  if (text.startsWith('/start')) {
    await handleStart(chatId, text.split(/\s+/)[1]);
  } else if (text.startsWith('/orders')) {
    await handleOrdersCommand(chatId);
  } else if (text.startsWith('/today')) {
    await handleTodayCommand(chatId);
  }
};

// Long-poll getUpdates. Works on Render's free tier (advances while awake).
export const startTelegramBot = (): void => {
  if (!isTelegramConfigured()) {
    console.log('ℹ️  Telegram bot disabled (TELEGRAM_BOT_TOKEN not set)');
    return;
  }

  let offset = 0;
  const poll = async (): Promise<void> => {
    for (;;) {
      try {
        const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            await handleUpdate(update).catch((e) => console.error('Telegram update error:', e));
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  void getBotUsername().then((u) =>
    console.log(u ? `🤖 Telegram bot @${u} started (long polling)` : '🤖 Telegram bot started (long polling)')
  );
  void poll();
};
