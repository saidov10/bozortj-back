import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { answerProductQuestion, isAssistantConfigured, ProductContext } from '../services/assistantService';

// AI seller chatbot: instantly answers buyer questions from a product's real data
// (public), and drafts a ready-to-send answer for a seller's pending question.

const notConfigured = (res: Response) =>
  res.status(503).json({ message: 'AI assistant is not configured. Set GROQ_API_KEY on the server.' });

const PRODUCT_CTX_INCLUDE = {
  category: true,
  brand: true,
  variants: { include: { color: true } },
  shop: { select: { shopName: true, deliveryFee: true, freeDeliveryThreshold: true, allowPickup: true } }
};

// Build the grounded context object handed to the AI from a product record.
const buildContext = (p: any): ProductContext => {
  const effectivePrice = p.isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price;
  return {
    name: p.name,
    description: p.description,
    price: p.price,
    effectivePrice,
    isOnDiscount: Boolean(p.isOnDiscount && p.discountPrice != null),
    category: p.category?.name ?? null,
    brand: p.brand?.name ?? null,
    sizes: Array.from(new Set((p.variants || []).map((v: any) => v.size).filter(Boolean))),
    colors: Array.from(new Set((p.variants || []).map((v: any) => v.color?.name).filter(Boolean))),
    inStock: p.stockQuantity > 0,
    stockQuantity: p.stockQuantity,
    warrantyMonths: p.warrantyMonths ?? 0,
    attributes: (p.attributes as Record<string, any>) || null,
    shopName: p.shop?.shopName ?? null,
    deliveryFee: p.shop?.deliveryFee ?? null,
    freeDeliveryThreshold: p.shop?.freeDeliveryThreshold ?? null,
    allowPickup: p.shop?.allowPickup ?? false
  };
};

// POST /api/products/:id/ai-question  (public) — instant grounded answer.
// Body: { question }
export const productInstantAnswer = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAssistantConfigured()) return notConfigured(res);
    const { id } = req.params;
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ message: 'Савол холӣ буда наметавонад' });
    if (question.length > 500) return res.status(400).json({ message: 'Савол хеле дароз аст (макс. 500)' });

    const product = await prisma.product.findUnique({ where: { id }, include: PRODUCT_CTX_INCLUDE });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { answer, confident } = await answerProductQuestion(buildContext(product), question);
    if (!answer) return res.status(502).json({ message: 'Ҳозир ҷавоб дода натавонистам. Дубора кӯшиш кунед.' });

    return res.status(200).json({ answer, confident });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error answering question', error: error.message });
  }
};

// POST /api/products/questions/:qid/ai-draft  (SELLER) — AI draft for a pending
// question so the seller can one-tap send it (or edit first). Not persisted.
export const suggestQuestionAnswer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!isAssistantConfigured()) return notConfigured(res);

    const question = await prisma.productQuestion.findUnique({
      where: { id: req.params.qid },
      include: { product: { include: { ...PRODUCT_CTX_INCLUDE, shop: { select: { userId: true, shopName: true, deliveryFee: true, freeDeliveryThreshold: true, allowPickup: true } } } } }
    });
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if ((question.product.shop as any).userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only draft answers for your own products' });
    }

    const { answer, confident } = await answerProductQuestion(buildContext(question.product), question.question);
    if (!answer) return res.status(502).json({ message: 'Ҷавоб тайёр карда натавонистам. Дубора кӯшиш кунед.' });

    return res.status(200).json({ draft: answer, confident });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error drafting answer', error: error.message });
  }
};
