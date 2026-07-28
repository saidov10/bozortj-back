"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLiveNotification = exports.initChatSocket = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';
let ioInstance = null;
const initChatSocket = (server) => {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: '*', // Allow all origins for testing
            methods: ['GET', 'POST']
        }
    });
    ioInstance = io;
    // Socket authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication error: Token required'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            socket.user = decoded;
            next();
        }
        catch (err) {
            return next(new Error('Authentication error: Invalid token'));
        }
    });
    io.on('connection', (socket) => {
        if (!socket.user)
            return;
        const userId = socket.user.id;
        console.log(`User connected to Chat WebSocket: ${socket.user.name} (${userId})`);
        // Join room named after user's ID to handle multiple connections
        socket.join(userId);
        // Listen for direct messages
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, text } = data;
                if (!receiverId || !text || text.trim() === '') {
                    socket.emit('error_message', { message: 'Receiver ID and text are required' });
                    return;
                }
                // Verify receiver exists
                const receiverExists = await prisma_1.default.user.findUnique({
                    where: { id: receiverId }
                });
                if (!receiverExists) {
                    socket.emit('error_message', { message: 'Receiver not found' });
                    return;
                }
                // Save message to database
                const message = await prisma_1.default.message.create({
                    data: {
                        senderId: userId,
                        receiverId,
                        text
                    },
                    include: {
                        sender: {
                            select: {
                                id: true,
                                name: true,
                                avatarUrl: true
                            }
                        }
                    }
                });
                // Broadcast to receiver's room and sender's room
                io.to(receiverId).emit('new_message', message);
                io.to(userId).emit('message_sent', message);
                console.log(`Chat message sent from ${userId} to ${receiverId}`);
                // Seller Auto-Reply logic
                const receiverShop = await prisma_1.default.shopProfile.findUnique({
                    where: { userId: receiverId }
                });
                if (receiverShop && receiverShop.autoReplyEnabled && receiverShop.autoReplyText) {
                    // Check if seller already sent a message to this user in the last 5 minutes to avoid loops
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                    const recentMessage = await prisma_1.default.message.findFirst({
                        where: {
                            senderId: receiverId,
                            receiverId: userId,
                            createdAt: { gte: fiveMinutesAgo }
                        }
                    });
                    if (!recentMessage) {
                        // Delay auto-reply slightly (e.g. 500ms) for realistic feel
                        setTimeout(async () => {
                            try {
                                const autoMessage = await prisma_1.default.message.create({
                                    data: {
                                        senderId: receiverId,
                                        receiverId: userId,
                                        text: receiverShop.autoReplyText || 'Hello! Thanks for writing. We will respond shortly.'
                                    },
                                    include: {
                                        sender: {
                                            select: { id: true, name: true, avatarUrl: true }
                                        }
                                    }
                                });
                                io.to(userId).emit('new_message', autoMessage);
                                io.to(receiverId).emit('message_sent', autoMessage);
                            }
                            catch (e) {
                                console.error('Failed to trigger auto-reply:', e);
                            }
                        }, 500);
                    }
                }
            }
            catch (err) {
                console.error('Socket messaging error:', err);
                socket.emit('error_message', { message: 'Failed to send message', error: err.message });
            }
        });
        // Handle typing status
        socket.on('typing', (data) => {
            const { receiverId, isTyping } = data;
            if (receiverId) {
                socket.to(receiverId).emit('user_typing', {
                    senderId: userId,
                    isTyping
                });
            }
        });
        socket.on('disconnect', () => {
            console.log(`User disconnected from Chat WebSocket: ${socket.user?.name} (${userId})`);
            socket.leave(userId);
        });
    });
    return io;
};
exports.initChatSocket = initChatSocket;
const sendLiveNotification = (userId, title, content) => {
    if (ioInstance) {
        ioInstance.to(userId).emit('new_notification', {
            title,
            content,
            createdAt: new Date()
        });
    }
};
exports.sendLiveNotification = sendLiveNotification;
