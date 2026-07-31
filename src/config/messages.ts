// Lightweight i18n for user-facing notifications and bot replies.
// The platform serves Tajikistan, so Tajik ("tj") is the default and Russian
// ("ru") is fully supported. Each message is a function of its parameters so we
// can interpolate order ids, product names, prices, etc.
//
// Usage:  t(user.language, 'order.placed', { shortId, total })
// Falls back to Tajik if a language or key is missing.

export type Lang = 'tj' | 'ru';

export const SUPPORTED_LANGS: Lang[] = ['tj', 'ru'];

export const normalizeLang = (value?: string | null): Lang =>
  value === 'ru' ? 'ru' : 'tj';

// Human-readable order status per language (used in status-change notifications).
const ORDER_STATUS: Record<Lang, Record<string, string>> = {
  tj: {
    PENDING: 'Интизори тасдиқ',
    PROCESSING: 'Дар ҳоли омодасозӣ',
    SHIPPED: 'Фиристода шуд',
    DELIVERED: 'Расонида шуд',
    CANCELLED: 'Бекор карда шуд'
  },
  ru: {
    PENDING: 'Ожидает подтверждения',
    PROCESSING: 'Готовится',
    SHIPPED: 'Отправлен',
    DELIVERED: 'Доставлен',
    CANCELLED: 'Отменён'
  }
};

export const orderStatusLabel = (lang: string | null | undefined, status: string): string =>
  ORDER_STATUS[normalizeLang(lang)][status] ?? status;

type MsgFn = (p: Record<string, any>) => { title: string; content: string };

// Message catalog. Each entry returns a { title, content } pair.
const MESSAGES: Record<string, Record<Lang, MsgFn>> = {
  'order.placed': {
    tj: (p) => ({
      title: 'Фармоиш қабул шуд ✅',
      content: `Фармоиши шумо #${p.shortId} қабул шуд. Маблағи умумӣ: ${p.total} сомонӣ.`
    }),
    ru: (p) => ({
      title: 'Заказ принят ✅',
      content: `Ваш заказ #${p.shortId} принят. Итого: ${p.total} сомони.`
    })
  },
  'order.newForSeller': {
    tj: (p) => ({
      title: 'Фармоиши нав 🛒',
      content: `Ба мағозаи «${p.shopName}» фармоиши нав ворид шуд.`
    }),
    ru: (p) => ({
      title: 'Новый заказ 🛒',
      content: `В магазин «${p.shopName}» поступил новый заказ.`
    })
  },
  'order.statusChanged': {
    tj: (p) => ({
      title: 'Ҳолати фармоиш тағйир ёфт 📦',
      content: `Фармоиши шумо #${p.shortId} акнун: ${p.statusLabel}.`
    }),
    ru: (p) => ({
      title: 'Статус заказа изменён 📦',
      content: `Ваш заказ #${p.shortId} теперь: ${p.statusLabel}.`
    })
  },
  'priceDrop': {
    tj: (p) => ({
      title: 'Нарх паст шуд! 🔻',
      content: `«${p.productName}» аз рӯйхати дилхоҳи шумо арзон шуд: ${p.oldPrice} → ${p.newPrice} сомонӣ. Онро аз даст надиҳед!`
    }),
    ru: (p) => ({
      title: 'Цена снижена! 🔻',
      content: `«${p.productName}» из вашего списка желаний подешевел: ${p.oldPrice} → ${p.newPrice} сомони. Успейте купить!`
    })
  },
  'lowStock': {
    tj: (p) => ({
      title: 'Мол кам монд ⚠️',
      content: `«${p.productName}» дар анбор кам монд — ${p.stock} дона. Захираро пур кунед, то фурӯшро аз даст надиҳед.`
    }),
    ru: (p) => ({
      title: 'Товар заканчивается ⚠️',
      content: `«${p.productName}» на складе осталось мало — ${p.stock} шт. Пополните запас, чтобы не терять продажи.`
    })
  }
};

export const t = (
  lang: string | null | undefined,
  key: string,
  params: Record<string, any> = {}
): { title: string; content: string } => {
  const entry = MESSAGES[key];
  if (!entry) return { title: key, content: '' };
  const fn = entry[normalizeLang(lang)] ?? entry.tj;
  return fn(params);
};
