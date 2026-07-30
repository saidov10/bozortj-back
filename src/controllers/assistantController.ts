import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  chatWithAssistant,
  chatWithAssistantPhoto,
  generateProductDescription,
  isAssistantConfigured,
  ImageMediaType
} from '../services/assistantService';

const notConfigured = (res: Response) =>
  res.status(503).json({ message: 'AI assistant is not configured. Set ANTHROPIC_API_KEY on the server.' });

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
