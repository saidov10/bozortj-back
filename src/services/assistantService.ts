import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

// AI Shopping Assistant ("Yordamchii AI") — a virtual seller that reads the
// buyer's request in plain language (Tajik / Russian / transliteration),
// searches the real product catalogue via tool use, and recommends concrete
// products with prices in Somoni.

const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-4-8';

// A single shared client. The SDK reads ANTHROPIC_API_KEY from the environment.
const anthropic = new Anthropic();

export const isAssistantConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

// The shape of a product card we return to the frontend to render.
export interface ProductCard {
  id: string;
  name: string;
  price: number;
  discountPrice: number | null;
  isOnDiscount: boolean;
  effectivePrice: number;
  brand: string | null;
  category: string | null;
  image: string | null;
  stockQuantity: number;
  shopName: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Ту "Ёрдамчии Bozor TJ" ҳастӣ — фурӯшандаи виртуалии як бозори онлайни Тоҷикистон.

Вазифаи ту: ба харидор кӯмак кунӣ, ки маҳсулоти мувофиқро зуд ёбад.

Қоидаҳо:
- Бо ҳамон забоне ҷавоб деҳ, ки харидор навиштааст (тоҷикӣ, русӣ ё транслит). Пешфарз — тоҷикӣ.
- Харидорон аксар вақт омехта ва транслит менависанд (масалан "krossovka", "кросовки", "пойафзоли варзишӣ" — ҳамааш як чиз). Мақсади харидорро фаҳм ва калимаи дурустро барои ҷустуҷӯ истифода бар.
- Барои ёфтани маҳсулот ҲАТМАН асбоби "search_products"-ро истифода бар. Ҳеҷ гоҳ маҳсулотро аз худ насоз — танҳо аз натиҷаи ҷустуҷӯ пешниҳод кун.
- Агар бо як калима чизе наёфтӣ, бо калимаи дигар ё муродиф боз ҷустуҷӯ кун.
- Нархҳо бо сомонӣ. Агар маҳсулот тахфиф дошта бошад, нархи тахфифро зикр кун.
- Ҷавоб кӯтоҳ, дӯстона ва фоиданок бошад. 3-4 варианти беҳтаринро пешниҳод кун ва бипурс, ки кадомаш маъқул шуд.
- Агар ҳеҷ маҳсулоти мувофиқ набошад, ростқавлона бигӯ ва пешниҳод кун, ки харидор калимаи дигарро санҷад.
- Дар матни ҷавобат рӯйхати дарози маҳсулотро такрор накун — корти маҳсулот ба таври алоҳида нишон дода мешавад. Танҳо кӯтоҳ шарҳ деҳ, ки чаро инҳоро пешниҳод кардӣ.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description:
      "Маҳсулотро дар базаи бозор ҷустуҷӯ мекунад. Аз рӯи ном, тавсиф, бренд, категория ва ранг мувофиқат меёбад. Барои ҳар дархости харидор истифода бар. Метавонӣ бо нархи ҳадди ақал/аксар ва категория маҳдуд кунӣ.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Калима ё калимаҳои ҷустуҷӯ (ном, навъ ё бренди маҳсулот). Метавонад холӣ бошад, агар танҳо аз рӯи нарх/категория филтр карда шавад.'
        },
        maxPrice: { type: 'number', description: 'Нархи ҳадди аксар бо сомонӣ (ихтиёрӣ).' },
        minPrice: { type: 'number', description: 'Нархи ҳадди ақал бо сомонӣ (ихтиёрӣ).' },
        category: { type: 'string', description: 'Номи категория барои маҳдуд кардан (ихтиёрӣ).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_product_details',
    description:
      'Маълумоти пурраи як маҳсулотро аз рӯи ID бармегардонад (тавсиф, вариантҳо, андозаҳо, рангҳо, захира).',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'ID-и маҳсулот.' }
      },
      required: ['productId']
    }
  }
];

const productInclude = {
  images: { take: 1 },
  brand: true,
  category: true,
  color: true,
  shop: { select: { shopName: true } },
  variants: { include: { color: true } }
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const toCard = (p: ProductWithRelations): ProductCard => {
  const isOnDiscount = p.isOnDiscount && p.discountPrice != null && p.discountPrice < p.price;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    discountPrice: p.discountPrice,
    isOnDiscount,
    effectivePrice: isOnDiscount && p.discountPrice != null ? p.discountPrice : p.price,
    brand: p.brand?.name ?? null,
    category: p.category?.name ?? null,
    image: p.images[0]?.url ?? null,
    stockQuantity: p.stockQuantity,
    shopName: p.shop?.shopName ?? null
  };
};

// Runs the actual DB search. Splits the query into words and matches ANY word
// against name/description/brand/category/color so that mixed-language and
// partial queries still find products.
const runSearchProducts = async (input: {
  query?: string;
  maxPrice?: number;
  minPrice?: number;
  category?: string;
}): Promise<ProductWithRelations[]> => {
  const priceFilter: Prisma.ProductWhereInput = {};
  if (typeof input.maxPrice === 'number' || typeof input.minPrice === 'number') {
    priceFilter.price = {};
    if (typeof input.minPrice === 'number') (priceFilter.price as any).gte = input.minPrice;
    if (typeof input.maxPrice === 'number') (priceFilter.price as any).lte = input.maxPrice;
  }

  const words = (input.query || '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 6);

  const wordConditions: Prisma.ProductWhereInput[] = words.map((word) => ({
    OR: [
      { name: { contains: word, mode: 'insensitive' } },
      { description: { contains: word, mode: 'insensitive' } },
      { brand: { name: { contains: word, mode: 'insensitive' } } },
      { category: { name: { contains: word, mode: 'insensitive' } } },
      { color: { name: { contains: word, mode: 'insensitive' } } }
    ]
  }));

  const where: Prisma.ProductWhereInput = { ...priceFilter };
  const andConditions: Prisma.ProductWhereInput[] = [];

  if (wordConditions.length > 0) {
    // Match any of the query words (broad recall — the model narrows down).
    andConditions.push({ OR: wordConditions.flatMap((c) => c.OR!) });
  }
  if (input.category) {
    andConditions.push({ category: { name: { contains: input.category, mode: 'insensitive' } } });
  }
  if (andConditions.length > 0) where.AND = andConditions;

  const products = await prisma.product.findMany({
    where,
    include: productInclude,
    take: 10,
    orderBy: [{ isOnDiscount: 'desc' }, { createdAt: 'desc' }]
  });

  // In-stock first
  return products.sort((a, b) => (b.stockQuantity > 0 ? 1 : 0) - (a.stockQuantity > 0 ? 1 : 0));
};

const runGetProductDetails = async (productId: string): Promise<ProductWithRelations | null> => {
  return prisma.product.findUnique({ where: { id: productId }, include: productInclude });
};

// Compact JSON we hand back to the model as a tool_result (keeps token use low).
const cardForModel = (p: ProductWithRelations) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  discountPrice: p.discountPrice,
  isOnDiscount: p.isOnDiscount && p.discountPrice != null && p.discountPrice < p.price,
  category: p.category?.name ?? null,
  brand: p.brand?.name ?? null,
  color: p.color?.name ?? null,
  size: p.size,
  inStock: p.stockQuantity > 0,
  stockQuantity: p.stockQuantity,
  description: p.description?.slice(0, 200) ?? ''
});

export interface AssistantResult {
  reply: string;
  products: ProductCard[];
}

// Drives the agentic loop: the model calls search/detail tools until it has an
// answer, and we collect every product it surfaced so the frontend can render
// rich cards alongside the text reply.
const runAssistantLoop = async (
  userContent: string | Anthropic.ContentBlockParam[],
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  const collected = new Map<string, ProductCard>();

  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => m && typeof m.content === 'string' && m.content.trim() !== '')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
    { role: 'user', content: userContent }
  ];

  let reply = '';

  for (let step = 0; step < 6; step++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools,
      messages
    });

    if (response.stop_reason === 'refusal') {
      return {
        reply: 'Бубахшед, ба ин дархост ҷавоб дода наметавонам. Метавонед чизи дигарро пурсед.',
        products: []
      };
    }

    if (response.stop_reason !== 'tool_use') {
      reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      try {
        if (block.name === 'search_products') {
          const found = await runSearchProducts(block.input as any);
          found.forEach((p) => collected.set(p.id, toCard(p)));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ count: found.length, products: found.map(cardForModel) })
          });
        } else if (block.name === 'get_product_details') {
          const { productId } = block.input as { productId: string };
          const p = await runGetProductDetails(productId);
          if (p) collected.set(p.id, toCard(p));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: p ? JSON.stringify(cardForModel(p)) : JSON.stringify({ error: 'not_found' })
          });
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: 'unknown_tool' }),
            is_error: true
          });
        }
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: err?.message || 'tool_failed' }),
          is_error: true
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (!reply) {
    reply = collected.size
      ? 'Ана чанд варианти мувофиқро ёфтам:'
      : 'Мутаассифона чизи мувофиқ наёфтам. Метавонед бо калимаи дигар пурсед?';
  }

  return { reply, products: Array.from(collected.values()) };
};

// Text chat entry point.
export const chatWithAssistant = (message: string, history: ChatMessage[] = []): Promise<AssistantResult> =>
  runAssistantLoop(message, history);

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// 📸 Visual search: the buyer sends a photo; the assistant sees it, works out
// what the product is, then searches the catalogue for matches.
export const chatWithAssistantPhoto = (
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  const instruction = note && note.trim()
    ? `Харидор ин аксро фиристод ва навишт: "${note.trim()}". Аксро бодиққат бубин, бифаҳм чӣ маҳсулот аст (навъ, ранг, бренд агар намоён бошад) ва бо асбоби search_products монанди онро дар база ёб ва пешниҳод кун.`
    : 'Харидор ин аксро фиристод. Аксро бодиққат бубин, бифаҳм чӣ маҳсулот аст (навъ, ранг, бренд агар намоён бошад) ва бо асбоби search_products монанди онро дар база ёб ва пешниҳод кун.';

  const content: Anthropic.ContentBlockParam[] = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: instruction }
  ];
  return runAssistantLoop(content, history);
};

// ✍️ AI writes a product description for a seller from a few basic fields.
export const generateProductDescription = async (input: {
  name: string;
  category?: string;
  brand?: string;
  keywords?: string;
}): Promise<{ description: string }> => {
  const parts = [`Ном: ${input.name}`];
  if (input.category) parts.push(`Категория: ${input.category}`);
  if (input.brand) parts.push(`Бренд: ${input.brand}`);
  if (input.keywords) parts.push(`Калидвожаҳо/шарҳи кӯтоҳи фурӯшанда: ${input.keywords}`);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    system:
      'Ту копирайтери e-commerce ҳастӣ. Барои маҳсулоти зерин як тавсифи ҷолиб, дақиқ ва фурӯшандаи 2-4 ҷумлаӣ бо забони тоҷикӣ навис. Танҳо матни тавсифро баргардон — бе сарлавҳа, бе рӯйхат, бе эмодзӣ. Хусусиятҳои асосиро зикр кун ва харидорро ба харид ташвиқ кун. Аз даъвоҳои бардурӯғ худдорӣ кун.',
    messages: [{ role: 'user', content: parts.join('\n') }]
  });

  if (response.stop_reason === 'refusal') return { description: '' };

  const description = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

  return { description };
};

export interface ReviewSummary {
  pros: string[];
  cons: string[];
  verdict: string;
}

const REVIEW_SUMMARY_SCHEMA = {
  type: 'object' as const,
  properties: {
    pros: { type: 'array', items: { type: 'string' } },
    cons: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' }
  },
  required: ['pros', 'cons', 'verdict'],
  additionalProperties: false
};

// ⭐ AI condenses many reviews into pros / cons / a one-line verdict.
export const summarizeReviews = async (
  productName: string,
  reviews: { rating: number; comment: string }[]
): Promise<ReviewSummary> => {
  const reviewsText = reviews
    .map((r, i) => `Тақризи ${i + 1} (${r.rating}/5): ${r.comment}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: REVIEW_SUMMARY_SCHEMA } },
    system: `Ту тақризҳои харидоронро оид ба маҳсулоти "${productName}" таҳлил мекунӣ. Нуктаҳои асосии мусбат (pros) ва манфиро (cons) бо забони тоҷикӣ, кӯтоҳ ва дақиқ ҷамъбаст кун — ҳар нукта 3-6 калима. "verdict" як ҷумлаи хулосавӣ бошад. Танҳо аз рӯи худи тақризҳо навис, чизе аз худ илова накун.`,
    messages: [{ role: 'user', content: reviewsText }]
  });

  if (response.stop_reason === 'refusal') return { pros: [], cons: [], verdict: '' };

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  try {
    const parsed = JSON.parse(text);
    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons : [],
      verdict: typeof parsed.verdict === 'string' ? parsed.verdict : ''
    };
  } catch {
    return { pros: [], cons: [], verdict: text.slice(0, 200) };
  }
};
