import { Request, Response } from 'express';
import { chatWithAssistant, isAssistantConfigured } from '../services/assistantService';

// POST /api/assistant/chat  (public — guests can use it too)
// Body: { message: string, history?: [{ role: 'user' | 'assistant', content: string }] }
export const assistantChat = async (req: Request, res: Response) => {
  try {
    if (!isAssistantConfigured()) {
      return res
        .status(503)
        .json({ message: 'AI assistant is not configured. Set ANTHROPIC_API_KEY on the server.' });
    }

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
    return res
      .status(500)
      .json({ message: 'Assistant failed to respond', error: error?.message });
  }
};
