"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const chatSocket_1 = require("./services/chatSocket");
const PORT = process.env.PORT || 5000;
// Create HTTP server from Express app
const server = http_1.default.createServer(app_1.default);
// Initialize Socket.io chat server
(0, chatSocket_1.initChatSocket)(server);
// Start listening
server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`💬 WebSockets initialized on ws://localhost:${PORT}`);
    console.log(`========================================`);
});
