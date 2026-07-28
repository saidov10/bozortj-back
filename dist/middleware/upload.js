"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRefundImages = exports.uploadReviewImages = exports.uploadProductImages = exports.uploadAvatar = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Helper to ensure directory exists
const ensureDirExists = (dirPath) => {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
};
// Storage configuration
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        let dest = 'uploads/';
        if (file.fieldname === 'avatar') {
            dest = 'uploads/avatars/';
        }
        else if (file.fieldname === 'images' || file.fieldname === 'photos') {
            dest = 'uploads/products/';
        }
        else if (file.fieldname === 'reviewImages') {
            dest = 'uploads/reviews/';
        }
        else if (file.fieldname === 'refundImages') {
            dest = 'uploads/refunds/';
        }
        ensureDirExists(dest);
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    }
});
// File filter (only images)
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
        cb(null, true);
    }
    else {
        cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed!'));
    }
};
exports.upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max limit per file
    }
});
// Single avatar upload handler
exports.uploadAvatar = exports.upload.single('avatar');
// Multiple product images upload handler (up to 10 photos)
exports.uploadProductImages = exports.upload.array('images', 10);
// Multiple review images upload handler (up to 5 photos)
exports.uploadReviewImages = exports.upload.array('reviewImages', 5);
// Multiple refund proof images upload handler (up to 5 photos)
exports.uploadRefundImages = exports.upload.array('refundImages', 5);
