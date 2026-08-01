import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Helper to ensure directory exists
const ensureDirExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = 'uploads/';
    if (file.fieldname === 'avatar') {
      dest = 'uploads/avatars/';
    } else if (file.fieldname === 'banner') {
      dest = 'uploads/banners/';
    } else if (file.fieldname === 'images' || file.fieldname === 'photos') {
      dest = 'uploads/products/';
    } else if (file.fieldname === 'reviewImages') {
      dest = 'uploads/reviews/';
    } else if (file.fieldname === 'refundImages') {
      dest = 'uploads/refunds/';
    } else if (file.fieldname === 'video') {
      dest = 'uploads/videos/';
    }
    ensureDirExists(dest);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// File filter (only images)
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype);

  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed!'));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max limit per file
  }
});

// Single avatar upload handler
export const uploadAvatar = upload.single('avatar');

// Single shop banner upload handler (storefront customization)
export const uploadBanner = upload.single('banner');

// Multiple product images upload handler (up to 10 photos)
export const uploadProductImages = upload.array('images', 10);

// Multiple review images upload handler (up to 5 photos)
export const uploadReviewImages = upload.array('reviewImages', 5);

// Multiple refund proof images upload handler (up to 5 photos)
export const uploadRefundImages = upload.array('refundImages', 5);

// ---- Short product video (TikTok-style feed) ----
const videoFilter = (req: any, file: any, cb: any) => {
  const allowed = /mp4|mov|webm|quicktime/;
  const ext = /mp4|mov|webm/.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext || mime) return cb(null, true);
  cb(new Error('Only video files (mp4, mov, webm) are allowed!'));
};

const videoUpload = multer({
  storage,
  fileFilter: videoFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per short video
});

export const uploadProductVideo = videoUpload.single('video');

// ---- CSV upload for bulk product import (kept in memory for parsing) ----
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

export const uploadCsv = csvUpload.single('file');
