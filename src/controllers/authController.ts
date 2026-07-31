import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-auth';

// Helper to generate JWT Token
const generateToken = (user: { id: string; email: string; role: string; name: string }) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// 1. Register Buyer
export const registerBuyer = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if email or phone already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    const user = await prisma.user.create({
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
  } catch (error: any) {
    return res.status(500).json({ message: 'Error registering buyer', error: error.message });
  }
};

// 2. Register Seller (Shop)
export const registerSeller = async (req: AuthRequest, res: Response) => {
  try {
    const { name, shopName, description, email, phone, password, categoryId } = req.body;

    // Check if email or phone already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    // Check if shopName is already taken
    const existingShop = await prisma.shopProfile.findUnique({
      where: { shopName }
    });

    if (existingShop) {
      return res.status(400).json({ message: 'Shop name is already taken' });
    }

    // The seller must pick the single category their shop will sell in
    if (!categoryId) {
      return res.status(400).json({ message: 'Please choose the category your shop will sell in' });
    }
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    // Create user and shop profile in a transaction
    const result = await prisma.$transaction(async (tx) => {
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
          description,
          categoryId
        },
        include: { category: true }
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
          description: result.shop.description,
          category: result.shop.category
        }
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error registering seller', error: error.message });
  }
};

// 3. Login
export const login = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        shopProfile: { include: { category: true } }
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
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
        language: user.language,
        shop: user.shopProfile ? {
          id: user.shopProfile.id,
          shopName: user.shopProfile.shopName,
          description: user.shopProfile.description,
          category: user.shopProfile.category
        } : null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

// 4. Get Current User Profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        shopProfile: { include: { category: true } }
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
        language: user.language,
        shop: user.shopProfile ? {
          id: user.shopProfile.id,
          shopName: user.shopProfile.shopName,
          description: user.shopProfile.description,
          category: user.shopProfile.category
        } : null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving profile', error: error.message });
  }
};

// 5. Update User Profile Avatar or Info
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, phone, language } = req.body;

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;
    if (phone) {
      // Validate Tajik format
      const isValid = /^\+992\d{9}$/.test(phone);
      if (!isValid) {
        return res.status(400).json({ message: 'Phone number must start with +992 followed by 9 digits' });
      }
      dataToUpdate.phone = phone;
    }
    // Preferred language for notifications & bot ("tj" or "ru").
    if (language === 'tj' || language === 'ru') {
      dataToUpdate.language = language;
    }

    if (req.file) {
      dataToUpdate.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,
      include: {
        shopProfile: { include: { category: true } }
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
        language: updatedUser.language,
        shop: updatedUser.shopProfile ? {
          id: updatedUser.shopProfile.id,
          shopName: updatedUser.shopProfile.shopName,
          description: updatedUser.shopProfile.description,
          category: updatedUser.shopProfile.category
        } : null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};
