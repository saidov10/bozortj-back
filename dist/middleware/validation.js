"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewValidator = exports.productValidator = exports.loginValidator = exports.registerSellerValidator = exports.registerBuyerValidator = exports.isValidTajikPhone = exports.validate = void 0;
const express_validator_1 = require("express-validator");
// Standard validator runner
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};
exports.validate = validate;
// Validate phone number format for +992 (Tajikistan code followed by 9 digits)
const isValidTajikPhone = (phone) => {
    // Matches +992 followed by exactly 9 digits (total 12 chars)
    const regex = /^\+992\d{9}$/;
    return regex.test(phone);
};
exports.isValidTajikPhone = isValidTajikPhone;
// Registration validations
exports.registerBuyerValidator = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Enter a valid email address'),
    (0, express_validator_1.body)('phone')
        .trim()
        .custom((value) => {
        if (!(0, exports.isValidTajikPhone)(value)) {
            throw new Error('Phone number must start with country code +992 followed by 9 digits (e.g., +992900123456)');
        }
        return true;
    }),
    (0, express_validator_1.body)('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    exports.validate
];
exports.registerSellerValidator = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Seller name is required'),
    (0, express_validator_1.body)('shopName').trim().notEmpty().withMessage('Shop name is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Shop description is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Enter a valid email address'),
    (0, express_validator_1.body)('phone')
        .trim()
        .custom((value) => {
        if (!(0, exports.isValidTajikPhone)(value)) {
            throw new Error('Phone number must start with country code +992 followed by 9 digits (e.g., +992900123456)');
        }
        return true;
    }),
    (0, express_validator_1.body)('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    exports.validate
];
// Login validation
exports.loginValidator = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Enter a valid email address'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required'),
    exports.validate
];
// Product creation validation
exports.productValidator = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Product name is required'),
    (0, express_validator_1.body)('description').trim().notEmpty().withMessage('Product description is required'),
    (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    (0, express_validator_1.body)('isOnDiscount')
        .optional()
        .customSanitizer((val) => val === 'true' || val === true)
        .isBoolean()
        .withMessage('isOnDiscount must be a boolean'),
    (0, express_validator_1.body)('discountPrice')
        .optional()
        .custom((val, { req }) => {
        if (val === '' || val === null || val === undefined)
            return true;
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
    (0, express_validator_1.body)('colorId').trim().notEmpty().withMessage('Color ID is required'),
    (0, express_validator_1.body)('size').trim().notEmpty().withMessage('Size is required'),
    (0, express_validator_1.body)('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer'),
    (0, express_validator_1.body)('categoryId').trim().notEmpty().withMessage('Category ID is required'),
    (0, express_validator_1.body)('subcategoryId').optional().trim(),
    (0, express_validator_1.body)('brandId').trim().notEmpty().withMessage('Brand ID is required'),
    (0, express_validator_1.body)('variants')
        .optional()
        .custom((val) => {
        if (val === '' || val === null || val === undefined)
            return true;
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
        }
        catch (err) {
            throw new Error(err.message || 'Variants is not a valid JSON string');
        }
    }),
    exports.validate
];
// Review validation
exports.reviewValidator = [
    (0, express_validator_1.body)('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be an integer between 1 and 5'),
    (0, express_validator_1.body)('comment').optional().trim(),
    exports.validate
];
