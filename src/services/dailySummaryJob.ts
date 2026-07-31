import prisma from '../config/prisma';
import { isTelegramConfigured, sendTelegramMessage } from './telegramService';
import { getSellerDailySummary } from './orderService';

// Once a day, push each Telegram-linked seller a short summary of their day —
// orders, revenue, new price offers, unanswered questions. Brings sellers back
// every evening. Best-effort on Render's free tier (fires on the next tick
// after the app is awake).
//
// SUMMARY_HOUR_UTC (default 15 = ~20:00 in Tajikistan, UTC+5).

const TARGET_HOUR = Number(process.env.SUMMARY_HOUR_UTC ?? 15);
const CHECK_EVERY_MS = 30 * 60 * 1000; // every 30 min
let lastSentDay = ''; // YYYY-MM-DD guard so we send at most once per day

const runIfDue = async (): Promise<void> => {
  if (!isTelegramConfigured()) return;
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < TARGET_HOUR || lastSentDay === dayKey) return;
  lastSentDay = dayKey;

  try {
    const sellers = await prisma.user.findMany({
      where: { role: 'SELLER', telegramChatId: { not: null }, shopProfile: { isNot: null } },
      select: { id: true, telegramChatId: true }
    });

    for (const seller of sellers) {
      try {
        const s = await getSellerDailySummary(seller.id);
        // Skip totally-quiet days to avoid noise.
        if (s.ordersItemsToday === 0 && s.pendingOffers === 0 && s.pendingQuestions === 0) continue;
        await sendTelegramMessage(
          seller.telegramChatId as string,
          `📊 Ҳисоботи имрӯз — ${s.shopName}`,
          `🛒 Молҳои фурӯхта: ${s.ordersItemsToday}\n💰 Даромад: ${s.revenueToday} с.\n🤝 Пешниҳодҳои нав: ${s.pendingOffers}\n❓ Саволҳои беҷавоб: ${s.pendingQuestions}`
        );
      } catch (e) {
        console.error('Daily summary for seller failed:', seller.id, e);
      }
    }
    console.log(`Daily summary sent to ${sellers.length} seller(s).`);
  } catch (err) {
    console.error('Daily summary job failed:', err);
  }
};

export const startDailySummaryJob = (): void => {
  if (!isTelegramConfigured()) return;
  setInterval(() => void runIfDue(), CHECK_EVERY_MS);
};
