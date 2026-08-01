import http from 'http';
import app from './app';
import { initChatSocket } from './services/chatSocket';
import { startAbandonedCartJob } from './services/abandonedCartJob';
import { startTelegramBot } from './services/telegramService';
import { startDailySummaryJob } from './services/dailySummaryJob';
import { startAuctionJob } from './services/auctionJob';

const PORT = process.env.PORT || 5000;

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io chat server
initChatSocket(server);

// Start the abandoned-cart reminder background job
startAbandonedCartJob();

// Start the Telegram notification bot (no-op if TELEGRAM_BOT_TOKEN is unset)
startTelegramBot();

// Start the daily seller summary push (no-op if Telegram is unset)
startDailySummaryJob();

// Start the auction closing job (finalizes ended auctions, notifies winners)
startAuctionJob();

// Start listening
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💬 WebSockets initialized on ws://localhost:${PORT}`);
  console.log(`========================================`);
});
