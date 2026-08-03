import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { UserPayload } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';

interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}

let ioInstance: Server | null = null;

// Live presence: how many active socket connections each user has. A user is
// "online" while this count is > 0. Used to show a green dot on a seller's shop
// so buyers know they'll get a fast reply.
const connectionCounts = new Map<string, number>();

export const isUserOnline = (userId: string): boolean => (connectionCounts.get(userId) || 0) > 0;

export const getOnlineUserIds = (): string[] => Array.from(connectionCounts.keys());

export const initChatSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for testing
      methods: ['GET', 'POST']
    }
  });

  ioInstance = io;

  // Socket authentication middleware.
  // Token is required for chat/notifications, but anonymous visitors are still
  // allowed to connect so public real-time features (live viewer count, live
  // stock) work for shoppers who are not logged in.
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as UserPayload;
      socket.user = decoded;
      next();
    } catch (err) {
      // Invalid token: still let them connect as an anonymous visitor
      next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Track which product rooms this socket is viewing, so we can broadcast
    // an updated viewer count to everyone else when it disconnects.
    const viewedProducts = new Set<string>();

    const productRoom = (productId: string) => `product:${productId}`;

    const broadcastViewerCount = (productId: string) => {
      const room = productRoom(productId);
      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('viewer_count', { productId, count });
    };

    // ---- Public: live "N people viewing this" on a product page ----
    socket.on('view_product', (productId: string) => {
      if (!productId) return;
      socket.join(productRoom(productId));
      viewedProducts.add(productId);
      broadcastViewerCount(productId);
    });

    socket.on('leave_product', (productId: string) => {
      if (!productId) return;
      socket.leave(productRoom(productId));
      viewedProducts.delete(productId);
      broadcastViewerCount(productId);
    });

    if (!socket.user) {
      socket.on('disconnect', () => {
        viewedProducts.forEach((productId) => {
          socket.leave(productRoom(productId));
          broadcastViewerCount(productId);
        });
      });
      return;
    }

    const userId = socket.user.id;
    console.log(`User connected to Chat WebSocket: ${socket.user.name} (${userId})`);

    // Track presence and let others know this user just came online.
    connectionCounts.set(userId, (connectionCounts.get(userId) || 0) + 1);
    if (connectionCounts.get(userId) === 1) {
      io.emit('presence_update', { userId, online: true });
    }

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

        // While on vacation, always auto-reply with the vacation message so
        // buyers know not to expect a quick response.
        const onVacation = receiverShop && receiverShop.vacationMode && receiverShop.vacationMessage;
        const autoReplyActive = receiverShop && receiverShop.autoReplyEnabled && receiverShop.autoReplyText;

        if (receiverShop && (onVacation || autoReplyActive)) {
          const replyText = onVacation
            ? (receiverShop.vacationMessage as string)
            : (receiverShop.autoReplyText as string);
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
                    text: replyText || 'Hello! Thanks for writing. We will respond shortly.'
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
      // Update presence; announce offline only when the last connection closes.
      const remaining = (connectionCounts.get(userId) || 1) - 1;
      if (remaining <= 0) {
        connectionCounts.delete(userId);
        io.emit('presence_update', { userId, online: false });
      } else {
        connectionCounts.set(userId, remaining);
      }
      viewedProducts.forEach((productId) => {
        socket.leave(productRoom(productId));
        broadcastViewerCount(productId);
      });
    });
  });

  return io;
};

export const sendLiveNotification = (
  userId: string,
  title: string,
  content: string,
  meta?: Record<string, any>
) => {
  if (ioInstance) {
    ioInstance.to(userId).emit('new_notification', {
      title,
      content,
      createdAt: new Date(),
      ...meta
    });
  }
};

// Live stock update, broadcast to everyone currently viewing a product page
// (e.g. right after checkout decrements stock) so the "Faqat N to monad!"
// urgency indicator updates without a page refresh.
export const broadcastStockUpdate = (
  productId: string,
  data: { variantId: string; stockQuantity: number; productStockQuantity: number }
) => {
  if (ioInstance) {
    ioInstance.to(`product:${productId}`).emit('stock_update', {
      productId,
      ...data
    });
  }
};

// Live order status push for the buyer's order-tracking timeline page
export const broadcastOrderStatus = (
  userId: string,
  data: { orderId: string; status: string; note?: string | null }
) => {
  if (ioInstance) {
    ioInstance.to(userId).emit('order_status_changed', data);
  }
};

// Live flash-sale "sold count" broadcast to everyone (homepage banner, product
// page) so the urgency counter ticks up in real time as others buy.
export const broadcastFlashSaleUpdate = (data: {
  flashSaleId: string;
  productId: string;
  soldCount: number;
  stockLimit: number | null;
}) => {
  if (ioInstance) {
    ioInstance.emit('flash_sale_update', data);
  }
};

// Live auction update (a new bid, or the auction closing) broadcast to everyone
// so all watchers see the current price / winner tick in real time.
export const broadcastAuctionUpdate = (data: {
  auctionId: string;
  productId: string;
  currentPrice: number;
  currentBidderId: string | null;
  status: string;
}) => {
  if (ioInstance) {
    ioInstance.emit('auction_update', data);
  }
};

// Live courier tracking — the assigned courier's latest GPS position, pushed to
// the buyer's room so their delivery map marker moves in real time.
export const broadcastCourierLocation = (
  userId: string,
  data: { orderId: string; lat: number; lng: number; at: Date }
) => {
  if (ioInstance) {
    ioInstance.to(userId).emit('courier_location', data);
  }
};

// Live shopping (live-фурӯш) update — a stream going live/ending, or the seller
// pinning a new product / changing its live price. Broadcast to everyone so the
// live-shopping screen updates in real time.
export const broadcastLiveUpdate = (data: {
  streamId: string;
  status: string;
  event: 'STARTED' | 'ENDED' | 'FEATURE' | 'ITEMS';
  featuredProductId?: string | null;
  livePrice?: number | null;
}) => {
  if (ioInstance) {
    ioInstance.emit('live_update', data);
  }
};
