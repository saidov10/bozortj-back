import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { UserPayload } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';

interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}

let ioInstance: Server | null = null;

export const initChatSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for testing
      methods: ['GET', 'POST']
    }
  });

  ioInstance = io;

  // Socket authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as UserPayload;
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) return;

    const userId = socket.user.id;
    console.log(`User connected to Chat WebSocket: ${socket.user.name} (${userId})`);

    // Join room named after user's ID to handle multiple connections
    socket.join(userId);

    // Listen for direct messages
    socket.on('send_message', async (data: { receiverId: string; text: string }) => {
      try {
        const { receiverId, text } = data;

        if (!receiverId || !text || text.trim() === '') {
          socket.emit('error_message', { message: 'Receiver ID and text are required' });
          return;
        }

        // Verify receiver exists
        const receiverExists = await prisma.user.findUnique({
          where: { id: receiverId }
        });

        if (!receiverExists) {
          socket.emit('error_message', { message: 'Receiver not found' });
          return;
        }

        // Save message to database
        const message = await prisma.message.create({
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
        const receiverShop = await prisma.shopProfile.findUnique({
          where: { userId: receiverId }
        });

        if (receiverShop && receiverShop.autoReplyEnabled && receiverShop.autoReplyText) {
          // Check if seller already sent a message to this user in the last 5 minutes to avoid loops
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const recentMessage = await prisma.message.findFirst({
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
                const autoMessage = await prisma.message.create({
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
              } catch (e) {
                console.error('Failed to trigger auto-reply:', e);
              }
            }, 500);
          }
        }
      } catch (err: any) {
        console.error('Socket messaging error:', err);
        socket.emit('error_message', { message: 'Failed to send message', error: err.message });
      }
    });

    // Handle typing status
    socket.on('typing', (data: { receiverId: string; isTyping: boolean }) => {
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

export const sendLiveNotification = (userId: string, title: string, content: string) => {
  if (ioInstance) {
    ioInstance.to(userId).emit('new_notification', {
      title,
      content,
      createdAt: new Date()
    });
  }
};
