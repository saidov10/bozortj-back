import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type Part,
  type FunctionDeclaration
} from '@google/generative-ai';
import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

// AI Shopping Assistant ("Yordamchii AI") — a virtual seller that reads the
// buyer's request in plain language (Tajik / Russian / transliteration),
// searches the real product catalogue via function calling, and recommends
// concrete products with prices in Somoni. Powered by Google Gemini (free tier).

const MODEL = process.env.ASSISTANT_MODEL || 'gemini-2.0-flash';

// Lazily-constructed client so importing this module never crashes when the
// key is missing (all endpoints gate on isAssistantConfigured first).
let _client: GoogleGenerativeAI | null = null;
const getClient = (): GoogleGenerativeAI => {
  if (!_client) _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  return _client;
};

export const isAssistantConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);

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

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_products',
    description:
      "Маҳсулотро дар базаи бозор ҷустуҷӯ мекунад. Аз рӯи ном, тавсиф, бренд, категория ва ранг мувофиқат меёбад. Барои ҳар дархости харидор истифода бар. Метавонӣ бо нархи ҳадди ақал/аксар ва категория маҳдуд кунӣ.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Калима ё калимаҳои ҷустуҷӯ (ном, навъ ё бренди маҳсулот).'
        },
        maxPrice: { type: SchemaType.NUMBER, description: 'Нархи ҳадди аксар бо сомонӣ (ихтиёрӣ).' },
        minPrice: { type: SchemaType.NUMBER, description: 'Нархи ҳадди ақал бо сомонӣ (ихтиёрӣ).' },
        category: { type: SchemaType.STRING, description: 'Номи категория барои маҳдуд кардан (ихтиёрӣ).' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_product_details',
    description:
      'Маълумоти пурраи як маҳсулотро аз рӯи ID бармегардонад (тавсиф, андоза, ранг, захира).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING, description: 'ID-и маҳсулот.' }
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

// Convert stored chat history to Gemini's Content[] format. Gemini requires the
// first turn to be 'user' and the history not to end on an unanswered 'user'.
const toGeminiHistory = (history: ChatMessage[]): Content[] => {
  const items: Content[] = history
    .filter((m) => m && typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-10)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  while (items.length && items[0].role !== 'user') items.shift();
  if (items.length && items[items.length - 1].role === 'user') items.pop();
  return items;
};

const safeText = (response: { text: () => string }): string => {
  try {
    return (response.text() || '').trim();
  } catch {
    return '';
  }
};

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
  userContent: string | Part[],
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  const collected = new Map<string, ProductCard>();

  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations }],
    generationConfig: { maxOutputTokens: 2048 }
  });

  const chat = model.startChat({ history: toGeminiHistory(history) });

  let reply = '';
  let result = await chat.sendMessage(userContent as string | Array<string | Part>);

  for (let step = 0; step < 6; step++) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0) {
      reply = safeText(result.response);
      break;
    }

    const responseParts: Part[] = [];
    for (const call of calls) {
      const out = await runToolCall(call.name, call.args, collected);
      responseParts.push({ functionResponse: { name: call.name, response: out } });
    }

    result = await chat.sendMessage(responseParts);
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

// 📸 Visual search: the buyer sends a photo; the assistant sees it, works out
// what the product is, then searches the catalogue for matches.
export const chatWithAssistantPhoto = (
  imageBase64: string,
  mediaType: ImageMediaType,
  note?: string,
  history: ChatMessage[] = []
): Promise<AssistantResult> => {
  const instruction = note && note.trim()
    ? `Харидор ин аксро фиристод ва навишт: "${note.trim()}". Аксро бодиққат бубин, бифаҳм чӣ маҳсулот аст (навъ, ранг, бренд агар намоён бошад) ва бо функсияи search_products монанди онро дар база ёб ва пешниҳод кун.`
    : 'Харидор ин аксро фиристод. Аксро бодиққат бубин, бифаҳм чӣ маҳсулот аст (навъ, ранг, бренд агар намоён бошад) ва бо функсияи search_products монанди онро дар база ёб ва пешниҳод кун.';

  const parts: Part[] = [
    { inlineData: { data: imageBase64, mimeType: mediaType } },
    { text: instruction }
  ];
  return runAssistantLoop(parts, history);
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

  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      'Ту копирайтери e-commerce ҳастӣ. Барои маҳсулоти зерин як тавсифи ҷолиб, дақиқ ва фурӯшандаи 2-4 ҷумлаӣ бо забони тоҷикӣ навис. Танҳо матни тавсифро баргардон — бе сарлавҳа, бе рӯйхат, бе эмодзӣ. Хусусиятҳои асосиро зикр кун ва харидорро ба харид ташвиқ кун. Аз даъвоҳои бардурӯғ худдорӣ кун.',
    generationConfig: { maxOutputTokens: 1024 }
  });

  try {
    const result = await model.generateContent(parts.join('\n'));
    return { description: safeText(result.response) };
  } catch (err) {
    console.error('generateProductDescription failed:', err);
    return { description: '' };
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

  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction: `Ту тақризҳои харидоронро оид ба маҳсулоти "${productName}" таҳлил мекунӣ. Нуктаҳои асосии мусбат (pros) ва манфиро (cons) бо забони тоҷикӣ, кӯтоҳ ва дақиқ ҷамъбаст кун — ҳар нукта 3-6 калима. "verdict" як ҷумлаи хулосавӣ бошад. Танҳо аз рӯи худи тақризҳо навис, чизе аз худ илова накун.`,
    generationConfig: {
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          pros: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          cons: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          verdict: { type: SchemaType.STRING }
        },
        required: ['pros', 'cons', 'verdict']
      }
    }
  });

  try {
    const result = await model.generateContent(reviewsText);
    const parsed = JSON.parse(safeText(result.response));
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
