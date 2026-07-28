import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

// Standard validator runner
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validate phone number format for +992 (Tajikistan code followed by 9 digits)
export const isValidTajikPhone = (phone: string): boolean => {
  // Matches +992 followed by exactly 9 digits (total 12 chars)
  const regex = /^\+992\d{9}$/;
  return regex.test(phone);
};

// Registration validations
export const registerBuyerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('phone')
    .trim()
    .custom((value) => {
      if (!isValidTajikPhone(value)) {
        throw new Error('Phone number must start with country code +992 followed by 9 digits (e.g., +992900123456)');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validate
];

export const registerSellerValidator = [
  body('name').trim().notEmpty().withMessage('Seller name is required'),
  body('shopName').trim().notEmpty().withMessage('Shop name is required'),
  body('description').trim().notEmpty().withMessage('Shop description is required'),
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('phone')
    .trim()
    .custom((value) => {
      if (!isValidTajikPhone(value)) {
        throw new Error('Phone number must start with country code +992 followed by 9 digits (e.g., +992900123456)');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  validate
];

// Login validation
export const loginValidator = [
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

// Product creation validation
export const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('description').trim().notEmpty().withMessage('Product description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('isOnDiscount')
    .optional()
    .customSanitizer((val) => val === 'true' || val === true)
    .isBoolean()
    .withMessage('isOnDiscount must be a boolean'),
  body('discountPrice')
    .optional()
    .custom((val, { req }) => {
      if (val === '' || val === null || val === undefined) return true;
      const dPrice = parseFloat(val);
      if (isNaN(dPrice) || dPrice < 0) {
        throw new Error('Discount price must be a non-negative number');
      }
      const price = parseFloat(req.body.price);
      if (req.body.isOnDiscount && dPrice >= price) {
        throw new Error('Discount price must be less than the original price');
      }
      return true;
    }),
  body('colorId').trim().notEmpty().withMessage('Color ID is required'),
  body('size').trim().notEmpty().withMessage('Size is required'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer'),
  body('categoryId').trim().notEmpty().withMessage('Category ID is required'),
  body('subcategoryId').optional().trim(),
  body('brandId').trim().notEmpty().withMessage('Brand ID is required'),
  body('variants')
    .optional()
    .custom((val) => {
      if (val === '' || val === null || val === undefined) return true;
      try {
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (!Array.isArray(parsed)) {
          throw new Error('Variants must be a valid array');
        }
        for (const item of parsed) {
          if (!item.colorId || typeof item.size !== 'string' || item.stockQuantity === undefined) {
            throw new Error('Each variant must have colorId, size, and stockQuantity');
          }
          const stock = parseInt(item.stockQuantity);
          if (isNaN(stock) || stock < 0) {
            throw new Error('Stock quantity must be a non-negative integer');
          }
        }
        return true;
      } catch (err: any) {
        throw new Error(err.message || 'Variants is not a valid JSON string');
      }
    }),
  validate
];

// Review validation
export const reviewValidator = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),
  body('comment').optional().trim(),
  validate
];
