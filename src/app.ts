import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './swagger.json';

import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import shopRoutes from './routes/shopRoutes';
import cartRoutes from './routes/cartRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import chatRoutes from './routes/chatRoutes';
import categoryRoutes from './routes/categoryRoutes';
import brandRoutes from './routes/brandRoutes';
import colorRoutes from './routes/colorRoutes';
import couponRoutes from './routes/couponRoutes';
import orderRoutes from './routes/orderRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminRoutes from './routes/adminRoutes';
import addressRoutes from './routes/addressRoutes';
import refundRoutes from './routes/refundRoutes';
import assistantRoutes from './routes/assistantRoutes';
import flashSaleRoutes from './routes/flashSaleRoutes';
import telegramRoutes from './routes/telegramRoutes';
import pushRoutes from './routes/pushRoutes';
import offerRoutes from './routes/offerRoutes';
import paymentRoutes from './routes/paymentRoutes';
import bundleRoutes from './routes/bundleRoutes';
import registryRoutes from './routes/registryRoutes';
import courierRoutes from './routes/courierRoutes';
import sellerToolsRoutes from './routes/sellerToolsRoutes';
import videoRoutes from './routes/videoRoutes';




const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve API documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Serve static uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/colors', colorRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', refundRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/flash-sales', flashSaleRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bundles', bundleRoutes);
app.use('/api/registries', registryRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/seller', sellerToolsRoutes);
app.use('/api/videos', videoRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'E-commerce API is running' });
});

// 404 Route Not Found Handler
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: 'API Endpoint not found' });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ message });
});

export default app;
