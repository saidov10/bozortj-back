"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_json_1 = __importDefault(require("./swagger.json"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const shopRoutes_1 = __importDefault(require("./routes/shopRoutes"));
const cartRoutes_1 = __importDefault(require("./routes/cartRoutes"));
const wishlistRoutes_1 = __importDefault(require("./routes/wishlistRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const brandRoutes_1 = __importDefault(require("./routes/brandRoutes"));
const colorRoutes_1 = __importDefault(require("./routes/colorRoutes"));
const couponRoutes_1 = __importDefault(require("./routes/couponRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const addressRoutes_1 = __importDefault(require("./routes/addressRoutes"));
const refundRoutes_1 = __importDefault(require("./routes/refundRoutes"));
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve API documentation
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_json_1.default));
// Serve static uploaded files
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/products', productRoutes_1.default);
app.use('/api/shops', shopRoutes_1.default);
app.use('/api/cart', cartRoutes_1.default);
app.use('/api/wishlist', wishlistRoutes_1.default);
app.use('/api/chat', chatRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/brands', brandRoutes_1.default);
app.use('/api/colors', colorRoutes_1.default);
app.use('/api/coupons', couponRoutes_1.default);
app.use('/api/orders', orderRoutes_1.default);
app.use('/api/orders', refundRoutes_1.default);
app.use('/api/addresses', addressRoutes_1.default);
app.use('/api/analytics', analyticsRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'E-commerce API is running' });
});
// 404 Route Not Found Handler
app.use((req, res, next) => {
    res.status(404).json({ message: 'API Endpoint not found' });
});
// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ message });
});
exports.default = app;
