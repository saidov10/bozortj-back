"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = exports.login = exports.registerSeller = exports.registerBuyer = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';
// Helper to generate JWT Token
const generateToken = (user) => {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
};
// 1. Register Buyer
const registerBuyer = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        // Check if email or phone already exists
        const existingUser = await prisma_1.default.user.findFirst({
            where: {
                OR: [{ email }, { phone }]
            }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email or phone already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;
        const user = await prisma_1.default.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                role: 'BUYER',
                avatarUrl
            }
        });
        const token = generateToken(user);
        return res.status(201).json({
            message: 'Buyer registered successfully',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatarUrl: user.avatarUrl
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error registering buyer', error: error.message });
    }
};
exports.registerBuyer = registerBuyer;
// 2. Register Seller (Shop)
const registerSeller = async (req, res) => {
    try {
        const { name, shopName, description, email, phone, password } = req.body;
        // Check if email or phone already exists
        const existingUser = await prisma_1.default.user.findFirst({
            where: {
                OR: [{ email }, { phone }]
            }
        });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email or phone already exists' });
        }
        // Check if shopName is already taken
        const existingShop = await prisma_1.default.shopProfile.findUnique({
            where: { shopName }
        });
        if (existingShop) {
            return res.status(400).json({ message: 'Shop name is already taken' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;
        // Create user and shop profile in a transaction
        const result = await prisma_1.default.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    name, // contact person
                    email,
                    phone,
                    password: hashedPassword,
                    role: 'SELLER',
                    avatarUrl
                }
            });
            const shop = await tx.shopProfile.create({
                data: {
                    userId: user.id,
                    shopName,
                    description
                }
            });
            return { user, shop };
        });
        const token = generateToken(result.user);
        return res.status(201).json({
            message: 'Seller and Shop registered successfully',
            token,
            user: {
                id: result.user.id,
                name: result.user.name,
                email: result.user.email,
                phone: result.user.phone,
                role: result.user.role,
                avatarUrl: result.user.avatarUrl,
                shop: {
                    id: result.shop.id,
                    shopName: result.shop.shopName,
                    description: result.shop.description
                }
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error registering seller', error: error.message });
    }
};
exports.registerSeller = registerSeller;
// 3. Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma_1.default.user.findUnique({
            where: { email },
            include: {
                shopProfile: true
            }
        });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        const token = generateToken(user);
        return res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatarUrl: user.avatarUrl,
                shop: user.shopProfile ? {
                    id: user.shopProfile.id,
                    shopName: user.shopProfile.shopName,
                    description: user.shopProfile.description
                } : null
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error logging in', error: error.message });
    }
};
exports.login = login;
// 4. Get Current User Profile
const getProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            include: {
                shopProfile: true
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.status(200).json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatarUrl: user.avatarUrl,
                shop: user.shopProfile ? {
                    id: user.shopProfile.id,
                    shopName: user.shopProfile.shopName,
                    description: user.shopProfile.description
                } : null
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error retrieving profile', error: error.message });
    }
};
exports.getProfile = getProfile;
// 5. Update User Profile Avatar or Info
const updateProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { name, phone } = req.body;
        const dataToUpdate = {};
        if (name)
            dataToUpdate.name = name;
        if (phone) {
            // Validate Tajik format
            const isValid = /^\+992\d{9}$/.test(phone);
            if (!isValid) {
                return res.status(400).json({ message: 'Phone number must start with +992 followed by 9 digits' });
            }
            dataToUpdate.phone = phone;
        }
        if (req.file) {
            dataToUpdate.avatarUrl = `/uploads/avatars/${req.file.filename}`;
        }
        const updatedUser = await prisma_1.default.user.update({
            where: { id: req.user.id },
            data: dataToUpdate,
            include: {
                shopProfile: true
            }
        });
        return res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                role: updatedUser.role,
                avatarUrl: updatedUser.avatarUrl,
                shop: updatedUser.shopProfile ? {
                    id: updatedUser.shopProfile.id,
                    shopName: updatedUser.shopProfile.shopName,
                    description: updatedUser.shopProfile.description
                } : null
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};
exports.updateProfile = updateProfile;
