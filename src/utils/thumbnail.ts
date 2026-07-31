import sharp from 'sharp';
import path from 'path';

// Generate a small thumbnail next to an uploaded product image. Thumbnails keep
// product lists light on Tajikistan's slow connections. Best-effort: if sharp
// fails, we return null and the caller falls back to the full-size url.
export const generateThumbnail = async (file: Express.Multer.File): Promise<string | null> => {
  try {
    const dir = path.dirname(file.path);
    const thumbName = `thumb-${file.filename}`;
    const thumbPath = path.join(dir, thumbName);
    await sharp(file.path)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .toFile(thumbPath);
    return `/uploads/products/${thumbName}`;
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    return null;
  }
};

// Build productImage records (url + thumbnailUrl) for a set of uploaded files.
export const buildProductImageRecords = async (
  files: Express.Multer.File[],
  productId: string
): Promise<{ productId: string; url: string; thumbnailUrl: string | null }[]> => {
  return Promise.all(
    files.map(async (file) => ({
      productId,
      url: `/uploads/products/${file.filename}`,
      thumbnailUrl: await generateThumbnail(file)
    }))
  );
};
