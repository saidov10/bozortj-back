import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// Product Q&A ("Савол-ҷавоб") — public questions on a product page. A Tajik
// buyer always asks before buying ("аслӣ аст?", "ба Хуҷанд мерасонед?"); keeping
// answers public turns one reply into many future sales.

const shapeQuestion = (q: any) => ({
  id: q.id,
  productId: q.productId,
  question: q.question,
  answer: q.answer,
  answeredAt: q.answeredAt,
  createdAt: q.createdAt,
  isAnswered: Boolean(q.answer),
  askedBy: q.user ? { id: q.user.id, name: q.user.name?.split(' ')[0] ?? q.user.name } : null
});

// GET /api/products/:id/questions — public list (answered first, newest first).
export const getProductQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const questions = await prisma.productQuestion.findMany({
      where: { productId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ answeredAt: 'desc' }, { createdAt: 'desc' }]
    });
    return res.status(200).json({ questions: questions.map(shapeQuestion) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving questions', error: error.message });
  }
};

// POST /api/products/:id/questions — a buyer asks a question.
export const askQuestion = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id } = req.params;
    const question = (req.body.question || '').toString().trim();
    if (!question) return res.status(400).json({ message: 'Савол холӣ буда наметавонад' });

    const product = await prisma.product.findUnique({
      where: { id },
      include: { shop: { select: { userId: true } } }
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const created = await prisma.productQuestion.create({
      data: { productId: id, userId: req.user.id, question: question.slice(0, 500) },
      include: { user: { select: { id: true, name: true } } }
    });

    // Notify the seller (in-app + Telegram + Web Push).
    await createNotification(
      product.shop.userId,
      '❓ Саволи нав дар бораи мол',
      `Барои "${product.name}": «${question.slice(0, 120)}»`,
      { type: 'PRODUCT_QUESTION', productId: id, questionId: created.id }
    );

    return res.status(201).json({ message: 'Савол фиристода шуд', question: shapeQuestion(created) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error asking question', error: error.message });
  }
};

// POST /api/products/questions/:qid/answer — the seller answers.
export const answerQuestion = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { qid } = req.params;
    const answer = (req.body.answer || '').toString().trim();
    if (!answer) return res.status(400).json({ message: 'Ҷавоб холӣ буда наметавонад' });

    const question = await prisma.productQuestion.findUnique({
      where: { id: qid },
      include: { product: { select: { name: true, shop: { select: { userId: true } } } } }
    });
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.product.shop.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only answer questions on your own products' });
    }

    const updated = await prisma.productQuestion.update({
      where: { id: qid },
      data: { answer: answer.slice(0, 1000), answeredAt: new Date() },
      include: { user: { select: { id: true, name: true } } }
    });

    // Notify the buyer who asked.
    await createNotification(
      question.userId,
      '💬 Ба саволи шумо ҷавоб доданд',
      `Барои "${question.product.name}": «${answer.slice(0, 120)}»`,
      { type: 'QUESTION_ANSWERED', productId: question.productId, questionId: qid }
    );

    return res.status(200).json({ message: 'Ҷавоб сабт шуд', question: shapeQuestion(updated) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error answering question', error: error.message });
  }
};

// GET /api/products/questions/pending — seller: unanswered questions on my products.
export const getPendingQuestions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });

    const questions = await prisma.productQuestion.findMany({
      where: { product: { shopId: shop.id }, answer: null },
      include: {
        user: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, images: { take: 1 } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      questions: questions.map((q) => ({
        ...shapeQuestion(q),
        product: { id: q.product.id, name: q.product.name, image: q.product.images?.[0]?.url ?? null }
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving pending questions', error: error.message });
  }
};
