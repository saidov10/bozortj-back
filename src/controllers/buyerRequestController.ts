import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notificationService';

// Reverse auction (аукциони баръакс): a buyer posts what they want plus a budget
// ("ин чизро мехоҳам, буҷаам 500 сомонӣ"); sellers submit competing proposals and
// the buyer accepts the best one. Sellers compete → the buyer wins on price.

const MAX_EXPIRY_DAYS = 30;

const proposalInclude = {
  shop: { select: { id: true, shopName: true, brandColor: true } },
  product: { include: { images: { take: 1 } } }
};

const shapeProposal = (p: any) => ({
  id: p.id,
  requestId: p.requestId,
  price: p.price,
  message: p.message ?? null,
  status: p.status,
  createdAt: p.createdAt,
  shop: p.shop ?? null,
  product: p.product
    ? { id: p.product.id, name: p.product.name, image: p.product.images?.[0]?.url ?? null, price: p.product.price }
    : null
});

const shapeRequest = (r: any, opts: { includeProposals?: boolean } = {}) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  budget: r.budget,
  categoryId: r.categoryId ?? null,
  category: r.category?.name ?? null,
  status: r.status,
  isOpen: r.status === 'OPEN' && new Date(r.expiresAt) > new Date(),
  acceptedProposalId: r.acceptedProposalId ?? null,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
  buyer: r.buyer ? { id: r.buyer.id, name: r.buyer.name } : undefined,
  proposalCount: r._count?.proposals ?? r.proposals?.length ?? undefined,
  proposals: opts.includeProposals && r.proposals ? r.proposals.map(shapeProposal) : undefined
});

// POST /api/buyer-requests  (BUYER)  { title, description, budget, categoryId?, expiresInDays? }
export const createRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { title, description, budget, categoryId } = req.body;

    if (!title || String(title).trim() === '') return res.status(400).json({ message: 'title is required' });
    if (!description || String(description).trim() === '') {
      return res.status(400).json({ message: 'description is required' });
    }
    const budgetNum = parseFloat(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) return res.status(400).json({ message: 'budget must be a positive number' });

    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat) return res.status(400).json({ message: 'Invalid category ID' });
    }

    const days = Math.min(Math.max(parseInt(req.body.expiresInDays) || 7, 1), MAX_EXPIRY_DAYS);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const request = await prisma.buyerRequest.create({
      data: {
        buyerId: req.user.id,
        title: String(title).trim(),
        description: String(description).trim(),
        budget: budgetNum,
        categoryId: categoryId || null,
        expiresAt
      },
      include: { category: true, _count: { select: { proposals: true } } }
    });
    return res.status(201).json({ message: 'Дархост нашр шуд', request: shapeRequest(request) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating request', error: error.message });
  }
};

// GET /api/buyer-requests?categoryId=&status=  (public) — open requests for sellers to browse
export const getOpenRequests = async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    const status = String(req.query.status || 'OPEN').toUpperCase();
    if (status === 'OPEN') {
      where.status = 'OPEN';
      where.expiresAt = { gt: new Date() };
    } else if (['FULFILLED', 'CLOSED', 'EXPIRED'].includes(status)) {
      where.status = status;
    }
    if (req.query.categoryId) where.categoryId = String(req.query.categoryId);

    const requests = await prisma.buyerRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { category: true, buyer: { select: { id: true, name: true } }, _count: { select: { proposals: true } } }
    });
    return res.status(200).json({ requests: requests.map((r) => shapeRequest(r)) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving requests', error: error.message });
  }
};

// GET /api/buyer-requests/mine  (BUYER) — my requests with full proposals
export const getMyRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const requests = await prisma.buyerRequest.findMany({
      where: { buyerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        proposals: { include: proposalInclude, orderBy: { price: 'asc' } }
      }
    });
    return res.status(200).json({ requests: requests.map((r) => shapeRequest(r, { includeProposals: true })) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving requests', error: error.message });
  }
};

// GET /api/buyer-requests/:id  (public, optional auth) — request detail. The owner
// sees every proposal; others only see the count (competitors' prices stay hidden).
export const getRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const request = await prisma.buyerRequest.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        buyer: { select: { id: true, name: true } },
        proposals: { include: proposalInclude, orderBy: { price: 'asc' } },
        _count: { select: { proposals: true } }
      }
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const isOwner = req.user?.id === request.buyerId;
    return res.status(200).json({ request: shapeRequest(request, { includeProposals: isOwner }) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving request', error: error.message });
  }
};

// POST /api/buyer-requests/:id/proposals  (SELLER)  { price, message?, productId? }
export const createProposal = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Only sellers with a shop can propose' });

    const request = await prisma.buyerRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'OPEN' || new Date(request.expiresAt) <= new Date()) {
      return res.status(400).json({ message: 'This request is no longer open' });
    }

    const price = parseFloat(req.body.price);
    if (isNaN(price) || price <= 0) return res.status(400).json({ message: 'price must be a positive number' });

    let productId: string | null = null;
    if (req.body.productId) {
      const product = await prisma.product.findUnique({ where: { id: req.body.productId } });
      if (!product || product.shopId !== shop.id) {
        return res.status(400).json({ message: 'productId must be one of your own products' });
      }
      productId = product.id;
    }

    const proposal = await prisma.sellerProposal.upsert({
      where: { requestId_shopId: { requestId: request.id, shopId: shop.id } },
      update: { price, message: req.body.message ? String(req.body.message).slice(0, 500) : null, productId, status: 'PENDING' },
      create: {
        requestId: request.id,
        shopId: shop.id,
        price,
        message: req.body.message ? String(req.body.message).slice(0, 500) : null,
        productId
      },
      include: proposalInclude
    });

    // Tell the buyer a seller responded.
    await createNotification(
      request.buyerId,
      'Пешниҳоди нав ба дархости шумо 💬',
      `Мағозаи «${shop.shopName}» барои «${request.title}» ${price} сомонӣ пешниҳод кард.`,
      { type: 'REVERSE_PROPOSAL', requestId: request.id, proposalId: proposal.id }
    );

    return res.status(201).json({ message: 'Пешниҳод фиристода шуд', proposal: shapeProposal(proposal) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error creating proposal', error: error.message });
  }
};

// GET /api/buyer-requests/proposals/mine  (SELLER) — my proposals
export const getMyProposals = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const shop = await prisma.shopProfile.findUnique({ where: { userId: req.user.id } });
    if (!shop) return res.status(403).json({ message: 'Shop profile not found' });

    const proposals = await prisma.sellerProposal.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      include: { ...proposalInclude, request: { include: { category: true } } }
    });
    return res.status(200).json({
      proposals: proposals.map((p) => ({
        ...shapeProposal(p),
        request: shapeRequest(p.request)
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error retrieving proposals', error: error.message });
  }
};

// POST /api/buyer-requests/:id/accept/:proposalId  (BUYER) — accept a proposal
export const acceptProposal = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { id, proposalId } = req.params;

    const request = await prisma.buyerRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.buyerId !== req.user.id) return res.status(403).json({ message: 'You do not own this request' });
    if (request.status !== 'OPEN') return res.status(400).json({ message: 'This request is already resolved' });

    const proposal = await prisma.sellerProposal.findFirst({
      where: { id: proposalId, requestId: id },
      include: { shop: { select: { userId: true, shopName: true } } }
    });
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });

    // Accept the winner, reject the rest, mark the request fulfilled.
    await prisma.$transaction([
      prisma.sellerProposal.update({ where: { id: proposalId }, data: { status: 'ACCEPTED' } }),
      prisma.sellerProposal.updateMany({
        where: { requestId: id, id: { not: proposalId } },
        data: { status: 'REJECTED' }
      }),
      prisma.buyerRequest.update({
        where: { id },
        data: { status: 'FULFILLED', acceptedProposalId: proposalId }
      })
    ]);

    // Notify the winning seller.
    await createNotification(
      proposal.shop.userId,
      '🎉 Пешниҳоди шумо қабул шуд!',
      `Харидор пешниҳоди шуморо барои «${request.title}» (${proposal.price} сомонӣ) қабул кард. Бо харидор дар тамос шавед.`,
      { type: 'REVERSE_ACCEPTED', requestId: id, proposalId }
    );

    // Notify the losing sellers.
    const losers = await prisma.sellerProposal.findMany({
      where: { requestId: id, id: { not: proposalId } },
      include: { shop: { select: { userId: true } } }
    });
    for (const l of losers) {
      await createNotification(
        l.shop.userId,
        'Дархост баста шуд',
        `Харидор барои «${request.title}» пешниҳоди дигарро интихоб кард.`,
        { type: 'REVERSE_REJECTED', requestId: id }
      );
    }

    const updated = await prisma.buyerRequest.findUnique({
      where: { id },
      include: { category: true, proposals: { include: proposalInclude, orderBy: { price: 'asc' } } }
    });
    return res.status(200).json({ message: 'Пешниҳод қабул шуд', request: shapeRequest(updated, { includeProposals: true }) });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error accepting proposal', error: error.message });
  }
};

// PATCH /api/buyer-requests/:id/close  (BUYER) — close without accepting
export const closeRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const request = await prisma.buyerRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.buyerId !== req.user.id) return res.status(403).json({ message: 'You do not own this request' });
    if (request.status !== 'OPEN') return res.status(400).json({ message: 'This request is already resolved' });

    await prisma.buyerRequest.update({ where: { id: request.id }, data: { status: 'CLOSED' } });
    return res.status(200).json({ message: 'Дархост баста шуд' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Error closing request', error: error.message });
  }
};
