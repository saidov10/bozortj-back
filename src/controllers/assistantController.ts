import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  chatWithAssistant,
  chatWithAssistantPhoto,
  generateProductDescription,
  translateProduct,
  suggestSellerReply,
  recommendSize,
  transcribeAudio,
  isAssistantConfigured,
  ImageMediaType
} from '../services/assistantService';
import prisma from '../config/prisma';

const notConfigured = (res: Response) =>
  res.status(503).json({ message: 'AI assistant is not configured. Set GROQ_API_KEY on the server.' });

const ALLOWED_MEDIA: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// POST /api/assistant/chat  (public — guests can use it too)
// Body: { message: string, history?: [{ role: 'user' | 'assistant', content: string }] }
export const assistantChat = async (req: Request, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);

    const { message, history } = req.body as {
      message?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ message: 'Message text is required' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ message: 'Message is too long (max 1000 characters)' });
    }

    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const result = await chatWithAssistant(message.trim(), safeHistory);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Assistant chat error:', error);
    return res.status(500).json({ message: 'Assistant failed to respond', error: error?.message });
  }
};

// POST /api/assistant/photo  (public) — visual search.
// multipart form field "photo" (image), plus optional "note". Or JSON body
// { imageBase64, mediaType, note }.
export const assistantPhoto = async (req: Request, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);

    let imageBase64: string | undefined;
    let mediaType: string | undefined;
    const note: string | undefined = req.body?.note;

    const file = (req as any).file as Express.Multer.File | undefined;
    if (file && file.buffer) {
      imageBase64 = file.buffer.toString('base64');
      mediaType = file.mimetype;
    } else if (req.body?.imageBase64) {
      // Accept a raw base64 string or a data URL
      const raw: string = req.body.imageBase64;
      const dataUrlMatch = raw.match(/^data:(image\/[a-zA-Z+]+);base64,(.*)$/);
      if (dataUrlMatch) {
        mediaType = dataUrlMatch[1];
        imageBase64 = dataUrlMatch[2];
      } else {
        imageBase64 = raw;
        mediaType = req.body.mediaType;
      }
    }

    if (!imageBase64) {
      return res.status(400).json({ message: 'An image is required (multipart "photo" or "imageBase64")' });
    }
    if (!mediaType || !ALLOWED_MEDIA.includes(mediaType as ImageMediaType)) {
      return res.status(400).json({ message: 'Unsupported image type. Use JPEG, PNG, GIF or WebP.' });
    }
    if (note && note.length > 500) {
      return res.status(400).json({ message: 'Note is too long (max 500 characters)' });
    }

    const result = await chatWithAssistantPhoto(imageBase64, mediaType as ImageMediaType, note);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Assistant photo error:', error);
    return res.status(500).json({ message: 'Assistant failed to analyze the photo', error: error?.message });
  }
};

// POST /api/assistant/generate-description  (seller only)
// Body: { name: string, category?: string, brand?: string, keywords?: string }
export const assistantGenerateDescription = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);

    const { name, category, brand, keywords } = req.body as {
      name?: string;
      category?: string;
      brand?: string;
      keywords?: string;
    };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const result = await generateProductDescription({
      name: name.trim(),
      category: category?.trim(),
      brand: brand?.trim(),
      keywords: keywords?.trim()
    });

    if (!result.description) {
      return res.status(502).json({ message: 'Could not generate a description. Try again.' });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Assistant description error:', error);
    return res.status(500).json({ message: 'Failed to generate description', error: error?.message });
  }
};

// POST /api/assistant/translate  (seller only)
// Body: { name, description, target: 'ru' | 'tj' }  →  { name, description }
export const assistantTranslate = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);
    const { name, description, target } = req.body as { name?: string; description?: string; target?: string };
    if (!name && !description) {
      return res.status(400).json({ message: 'Provide name and/or description to translate' });
    }
    const tgt = target === 'tj' ? 'tj' : 'ru';
    const result = await translateProduct({
      name: (name || '').trim(),
      description: (description || '').trim(),
      target: tgt
    });
    if (!result.name && !result.description) {
      return res.status(502).json({ message: 'Could not translate. Try again.' });
    }
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Assistant translate error:', error);
    return res.status(500).json({ message: 'Failed to translate', error: error?.message });
  }
};

// POST /api/assistant/suggest-reply  (seller only)
// Body: { questionId } OR { reviewId } OR { kind, productName, text, rating }
// Returns a ready-to-send draft reply for the seller.
export const assistantSuggestReply = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);

    let kind: 'question' | 'review' | undefined;
    let productName = '';
    let text = '';
    let rating: number | undefined;

    if (req.body.questionId) {
      const q = await prisma.productQuestion.findUnique({
        where: { id: req.body.questionId },
        include: { product: { select: { name: true } } }
      });
      if (!q) return res.status(404).json({ message: 'Question not found' });
      kind = 'question';
      productName = q.product.name;
      text = q.question;
    } else if (req.body.reviewId) {
      const rv = await prisma.review.findUnique({
        where: { id: req.body.reviewId },
        include: { product: { select: { name: true } } }
      });
      if (!rv) return res.status(404).json({ message: 'Review not found' });
      kind = 'review';
      productName = rv.product.name;
      text = rv.comment || '';
      rating = rv.rating;
    } else {
      kind = req.body.kind === 'review' ? 'review' : 'question';
      productName = (req.body.productName || '').trim();
      text = (req.body.text || '').trim();
      rating = req.body.rating ? parseInt(req.body.rating) : undefined;
    }

    if (!text) return res.status(400).json({ message: 'Nothing to reply to' });

    const result = await suggestSellerReply({ kind: kind!, productName, text, rating });
    if (!result.reply) return res.status(502).json({ message: 'Could not draft a reply. Try again.' });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Assistant suggest-reply error:', error);
    return res.status(500).json({ message: 'Failed to draft reply', error: error?.message });
  }
};

// POST /api/assistant/size-advice  (public)
// Body: { productId, heightCm?, weightKg?, notes? } → { advice }
export const assistantSizeAdvice = async (req: Request, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);
    const { productId, heightCm, weightKg, notes } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, variants: { select: { size: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const availableSizes = Array.from(new Set(product.variants.map((v) => v.size).filter(Boolean)));
    const result = await recommendSize({
      productName: product.name,
      category: product.category?.name,
      availableSizes,
      attributes: (product.attributes as Record<string, any>) || null,
      heightCm: heightCm ? parseFloat(heightCm) : undefined,
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      notes: notes ? String(notes).slice(0, 300) : undefined
    });
    if (!result.advice) return res.status(502).json({ message: 'Could not produce size advice. Try again.' });
    return res.status(200).json({ ...result, availableSizes });
  } catch (error: any) {
    console.error('Assistant size-advice error:', error);
    return res.status(500).json({ message: 'Failed to advise size', error: error?.message });
  }
};

// POST /api/assistant/voice  (public) — multipart "audio"
// Transcribes the voice message (Whisper) and runs the shopping assistant on it.
export const assistantVoice = async (req: Request, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: 'An audio file is required (field "audio")' });
    }

    const transcript = await transcribeAudio(file.buffer, file.originalname);
    if (!transcript) {
      return res.status(502).json({ message: 'Could not transcribe the audio. Try again.' });
    }

    const result = await chatWithAssistant(transcript);
    return res.status(200).json({ transcript, ...result });
  } catch (error: any) {
    console.error('Assistant voice error:', error);
    return res.status(500).json({ message: 'Failed to process voice message', error: error?.message });
  }
};

// POST /api/assistant/price-advice  (seller only)
// Body: { name?, categoryId?, brandId? } → data-driven suggested price range from
// comparable products already on the platform.
export const assistantPriceAdvice = async (req: AuthRequest, res: Response) => {
  try {
    const { name, categoryId, brandId } = req.body;

    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (name && typeof name === 'string' && name.trim()) {
      const terms = name.trim().split(/\s+/).filter((w: string) => w.length >= 3).slice(0, 4);
      if (terms.length) {
        where.OR = terms.map((t: string) => ({ name: { contains: t, mode: 'insensitive' } }));
      }
    }
    if (!where.categoryId && !where.brandId && !where.OR) {
      return res.status(400).json({ message: 'Provide at least name, categoryId or brandId' });
    }

    const similar = await prisma.product.findMany({
      where,
      select: { price: true },
      take: 200
    });
    if (similar.length === 0) {
      return res.status(200).json({ count: 0, message: 'Ҳоло моли монанд нест — нархро озод гузоред.' });
    }

    const prices = similar.map((p) => p.price).sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    const avg = +(prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2);
    const median = prices[Math.floor(prices.length / 2)];
    // Suggest a competitive band around the median.
    const suggestedLow = +(median * 0.92).toFixed(2);
    const suggestedHigh = +(median * 1.05).toFixed(2);

    return res.status(200).json({
      count: similar.length,
      min,
      max,
      avg,
      median,
      suggestedRange: { low: suggestedLow, high: suggestedHigh },
      message: `Молҳои монанд ${min}–${max} сомонӣ (миёна ${median}). Нархи рақобатпазир: ${suggestedLow}–${suggestedHigh} сомонӣ.`
    });
  } catch (error: any) {
    console.error('Assistant price-advice error:', error);
    return res.status(500).json({ message: 'Failed to advise price', error: error?.message });
  }
};
