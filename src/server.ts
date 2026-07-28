import http from 'http';
import app from './app';
import { initChatSocket } from './services/chatSocket';

const PORT = process.env.PORT || 5000;

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize Socket.io chat server
initChatSocket(server);

// Start listening
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`💬 WebSockets initialized on ws://localhost:${PORT}`);
  console.log(`========================================`);
});
