import Groq from 'groq-sdk';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'groq-sdk/resources/chat/completions';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

// AI Shopping Assistant ("Yordamchii AI") — a virtual seller that reads the
// buyer's request in plain language (Tajik / Russian / transliteration),
// searches the real product catalogue via function calling, and recommends
// concrete products with prices in Somoni. Powered by Groq (free tier).

const MODEL = process.env.ASSISTANT_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.ASSISTANT_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

// Lazily-constructed client so importing this module never crashes when the
// key is missing (all endpoints gate on isAssistantConfigured first).
let _client: Groq | null = null;
const getClient = (): Groq => {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
  return _client;
};

export const isAssistantConfigured = (): boolean => Boolean(process.env.GROQ_API_KEY);

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

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const SYSTEM_PROMPT = `Ту "Ёрдамчии Bozor TJ" ҳастӣ — фурӯшандаи виртуалии як бозори онлайни Тоҷикистон.

Вазифаи ту: ба харидор кӯмак кунӣ, ки маҳсулоти мувофиқро зуд ёбад.

Қоидаҳо:
- Бо ҳамон забоне ҷавоб деҳ, ки харидор навиштааст (тоҷикӣ, русӣ ё транслит). Пешфарз — тоҷикӣ.
- Харидорон аксар вақт омехта ва транслит менависанд (масалан "krossovka", "кросовки", "пойафзоли варзишӣ" — ҳамааш як чиз). Мақсади харидорро фаҳм ва калимаи дурустро барои ҷустуҷӯ истифода бар.
- Барои ёфтани маҳсулот ҲАТМАН функсияи "search_products"-ро истифода бар. Ҳеҷ гоҳ маҳсулотро аз худ насоз — танҳо аз натиҷаи ҷустуҷӯ пешниҳод кун.
- Агар бо як калима чизе наёфтӣ, бо калимаи дигар ё муродиф боз ҷустуҷӯ кун.
- Нархҳо бо сомонӣ. Агар маҳсулот тахфиф дошта бошад, нархи тахфифро зикр кун.
- Ҷавоб кӯтоҳ, дӯстона ва фоиданок бошад. 3-4 варианти беҳтаринро пешниҳод кун ва бипурс, ки кадомаш маъқул шуд.
- Агар ҳеҷ маҳсулоти мувофиқ набошад, ростқавлона бигӯ ва пешниҳод кун, ки харидор калимаи дигарро санҷад.
- Дар матни ҷавобат рӯйхати дарози маҳсулотро такрор накун — корти маҳсулот ба таври алоҳида нишон дода мешавад. Танҳо кӯтоҳ шарҳ деҳ, ки чаро инҳоро пешниҳод кардӣ.`;

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description:
        "Маҳсулотро дар базаи бозор ҷустуҷӯ мекунад. Аз рӯи ном, тавсиф, бренд, категория ва ранг мувофиқат меёбад. Барои ҳар дархости харидор истифода бар. Метавонӣ бо нархи ҳадди ақал/аксар ва категория маҳдуд кунӣ.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Калима ё калимаҳои ҷустуҷӯ (ном, навъ ё бренди маҳсулот).'
          },
          maxPrice: { type: 'number', description: 'Нархи ҳадди аксар бо сомонӣ (ихтиёрӣ).' },
          minPrice: { type: 'number', description: 'Нархи ҳадди ақал бо сомонӣ (ихтиёрӣ).' },
          category: { type: 'string', description: 'Номи категория барои маҳдуд кардан (ихтиёрӣ).' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description:
        'Маълумоти пурраи як маҳсулотро аз рӯи ID бармегардонад (тавсиф, андоза, ранг, захира).',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID-и маҳсулот.' }
        },
        required: ['productId']
      }
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

  return products.sort((a, b) => (b.stockQuantity > 0 ? 1 : 0) - (a.stockQuantity > 0 ? 1 : 0));
};

const runGetProductDetails = async (productId: string): Promise<ProductWithRelations | null> => {
  if (!productId) return null;
  return prisma.product.findUnique({ where: { id: productId }, include: productInclude });
};

// Compact JSON we hand back to the model as a function result (keeps tokens low).
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

// Execute a function the model asked for; returns a plain object result.
const runToolCall = async (
  name: string,
  args: any,
  collected: Map<string, ProductCard>
): Promise<object> => {
  try {
    if (name === 'search_products') {
      const found = await runSearchProducts(args || {});
      found.forEach((p) => collected.set(p.id, toCard(p)));
      return { count: found.length, products: found.map(cardForModel) };
    }
    if (name === 'get_product_details') {
      const p = await runGetProductDetails(args?.productId);
      if (p) collected.set(p.id, toCard(p));
      return p ? cardForModel(p) : { error: 'not_found' };
    }
    return { error: 'unknown_tool' };
  } catch (err: any) {
    return { error: err?.message || 'tool_failed' };
  }
};

// Drives the function-calling loop: the model calls search/detail functions
// until it has an answer, and we collect every product it surfaced so the
// frontend can render rich cards alongside the text reply.
const runAssistantLoop = async (
  userMessage: string,
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  const collected = new Map<string, ProductCard>();
  const client = getClient();

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
      .filter((m) => m && typeof m.content === 'string' && m.content.trim() !== '')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam)),
    { role: 'user', content: userMessage }
  ];

  let reply = '';

  for (let step = 0; step < 6; step++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      tools,
      tool_choice: 'auto',
      messages
    });

    const msg = completion.choices[0]?.message;
    const toolCalls = msg?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      reply = (msg?.content || '').trim();
      break;
    }

    // Echo the assistant's tool-call turn back into the conversation.
    messages.push({
      role: 'assistant',
      content: msg?.content ?? '',
      tool_calls: toolCalls
    });

    for (const call of toolCalls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const out = await runToolCall(call.function.name, args, collected);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(out)
      });
    }
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

// Ask a vision model to describe the product in a photo (kept separate from the
// tool loop so vision capability and tool-calling capability stay decoupled).
const describeImage = async (imageBase64: string, mediaType: ImageMediaType): Promise<string> => {
  const dataUrl = `data:${mediaType};base64,${imageBase64}`;
  const completion = await getClient().chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Ин чӣ маҳсулот аст? Навъ, ранг ва бренд (агар намоён бошад)-ро кӯтоҳ бо тоҷикӣ навис — 1-2 ҷумла, танҳо тавсиф.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  });
  return (completion.choices[0]?.message?.content || '').trim();
};

// 📸 Visual search: describe the photo, then run the normal text tool loop on
// that description so it finds matching catalogue products.
export const chatWithAssistantPhoto = async (
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  let description = '';
  try {
    description = await describeImage(imageBase64, mediaType);
  } catch (err) {
    console.error('describeImage failed:', err);
  }

  const notePart = note && note.trim() ? ` Харидор инчунин навишт: "${note.trim()}".` : '';
  const query = description
    ? `Харидор аксеро фиристод. Дар акс ин маҳсулот дида мешавад: "${description}".${notePart} Бо функсияи search_products монанди онро дар база ёб ва пешниҳод кун.`
    : note && note.trim()
      ? note.trim()
      : 'Харидор аксеро фиристод, вале онро таҳлил карда натавонистам. Бо эҳтиром бипурс, ки маҳсулотро бо матн тавсиф кунад.';

  return runAssistantLoop(query, history);
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

  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content:
            'Ту копирайтери e-commerce ҳастӣ. Барои маҳсулоти зерин як тавсифи ҷолиб, дақиқ ва фурӯшандаи 2-4 ҷумлаӣ бо забони тоҷикӣ навис. Танҳо матни тавсифро баргардон — бе сарлавҳа, бе рӯйхат, бе эмодзӣ. Хусусиятҳои асосиро зикр кун ва харидорро ба харид ташвиқ кун. Аз даъвоҳои бардурӯғ худдорӣ кун.'
        },
        { role: 'user', content: parts.join('\n') }
      ]
    });
    return { description: (completion.choices[0]?.message?.content || '').trim() };
  } catch (err) {
    console.error('generateProductDescription failed:', err);
    return { description: '' };
  }
};

// 🌐 Translate a product's name + description between Tajik and Russian, so a
// seller writes once and the listing is instantly bilingual.
export const translateProduct = async (input: {
  name: string;
  description: string;
  target: 'ru' | 'tj';
}): Promise<{ name: string; description: string }> => {
  const targetName = input.target === 'ru' ? 'русӣ (Russian)' : 'тоҷикӣ (Tajik)';
  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Ту тарҷумони маҳсулоти онлайн-мағоза ҳастӣ. Матни зерро ба забони ${targetName} тарҷума кун. Табиӣ ва фурӯшанда тарҷума кун, на калима ба калима. Ном ва бренд/андозаро нигоҳ дор. Ҷавобро ҲАТМАН танҳо дар формати JSON баргардон: {"name": "...", "description": "..."}`
        },
        { role: 'user', content: `Ном: ${input.name}\nТавсиф: ${input.description}` }
      ]
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      description: typeof parsed.description === 'string' ? parsed.description : ''
    };
  } catch (err) {
    console.error('translateProduct failed:', err);
    return { name: '', description: '' };
  }
};

// 💬 Draft a polite, ready-to-send seller reply to a buyer's question or review.
// The seller reviews it and hits "send" — turning slow replies into instant ones.
export const suggestSellerReply = async (input: {
  kind: 'question' | 'review';
  productName: string;
  text: string;
  rating?: number;
}): Promise<{ reply: string }> => {
  const context =
    input.kind === 'review'
      ? `Харидор ба маҳсулоти "${input.productName}" тақриз навишт${input.rating ? ` (${input.rating}/5)` : ''}: "${input.text}"`
      : `Харидор дар бораи маҳсулоти "${input.productName}" пурсид: "${input.text}"`;
  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content:
            'Ту ба фурӯшанда кӯмак мекунӣ, ки ба харидор ботамкин ва дӯстона ҷавоб диҳад. Як ҷавоби кӯтоҳи 1-3 ҷумлагӣ бо забони тоҷикӣ навис. Агар тақризи манфӣ бошад, узр пурс ва роҳи ҳалро пешниҳод кун. Танҳо матни ҷавобро баргардон — бе сарлавҳа, бе эмодзии зиёд.'
        },
        { role: 'user', content: context }
      ]
    });
    return { reply: (completion.choices[0]?.message?.content || '').trim() };
  } catch (err) {
    console.error('suggestSellerReply failed:', err);
    return { reply: '' };
  }
};

export interface ReviewSummary {
  pros: string[];
  cons: string[];
  verdict: string;
}

// ⭐ AI condenses many reviews into pros / cons / a one-line verdict.
export const summarizeReviews = async (
  productName: string,
  reviews: { rating: number; comment: string }[]
): Promise<ReviewSummary> => {
  const reviewsText = reviews
    .map((r, i) => `Тақризи ${i + 1} (${r.rating}/5): ${r.comment}`)
    .join('\n');

  try {
    const completion = await getClient().chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Ту тақризҳои харидоронро оид ба маҳсулоти "${productName}" таҳлил мекунӣ. Нуктаҳои асосии мусбат (pros) ва манфиро (cons) бо забони тоҷикӣ, кӯтоҳ ва дақиқ ҷамъбаст кун — ҳар нукта 3-6 калима. Танҳо аз рӯи худи тақризҳо навис. Ҷавобро ҲАТМАН танҳо дар формати JSON бо ин сохт баргардон: {"pros": ["..."], "cons": ["..."], "verdict": "як ҷумлаи хулосавӣ"}`
        },
        { role: 'user', content: reviewsText }
      ]
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return {
      pros: Array.isArray(parsed.pros) ? parsed.pros : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons : [],
      verdict: typeof parsed.verdict === 'string' ? parsed.verdict : ''
    };
  } catch (err) {
    console.error('summarizeReviews failed:', err);
    return { pros: [], cons: [], verdict: '' };
  }
};
