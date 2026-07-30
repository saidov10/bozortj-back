# 🆕 Промт — ТАНҲО функсияи нав (🤖 Ёрдамчии AI-и харид)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **як функсияи навро** ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend навсозӣ шуд. Як фичаи нав илова шуд: **Ёрдамчии AI-и харид** — фурӯшандаи виртуалӣ, ки бо забони одӣ бо харидор сӯҳбат мекунад, худаш аз базаи маҳсулот мекобад ва вариантҳои мушаххасро бо акс ва нарх пешниҳод мекунад.

## Endpoint-и ягона

```
POST https://bozortj-back.onrender.com/api/assistant/chat
Content-Type: application/json
```

**Аутентификатсия лозим НЕСТ** — ҳам меҳмон, ҳам корбари login-шуда истифода бурда метавонад (токен нафирист).

### Дархост (request body)

```json
{
  "message": "телефони арзон то 1500 сомонӣ барои модарам",
  "history": [
    { "role": "user", "content": "салом" },
    { "role": "assistant", "content": "Салом! Чӣ ҷустуҷӯ доред?" }
  ]
}
```

- `message` (ҳатмӣ) — паёми ҷории харидор. Ҳадди аксар 1000 ҳарф.
- `history` (ихтиёрӣ) — таърихи сӯҳбат барои контекст. **Танҳо `role` ва `content`-ро фирист** (объектҳои маҳсулотро дар history нафирист). Backend танҳо 10 паёми охирро истифода мебарад.

Харидорон метавонанд тоҷикӣ, русӣ ё транслит («krossovka», «кросовки») нависанд — AI мақсадро мефаҳмад.

### Ҷавоб (response 200)

```json
{
  "reply": "Ана чанд телефони арзонро барои шумо ёфтам, ҳамааш то 1500 сомонӣ:",
  "products": [
    {
      "id": "uuid",
      "name": "Redmi A3",
      "price": 1400,
      "discountPrice": 1200,
      "isOnDiscount": true,
      "effectivePrice": 1200,
      "brand": "Xiaomi",
      "category": "Телефонҳо",
      "image": "1712345678-phone.jpg",
      "stockQuantity": 8,
      "shopName": "TechStore"
    }
  ]
}
```

- `reply` — матни ҷавоби AI (бо ҳамон забони харидор). Инро дар пуфаки чат нишон деҳ.
- `products` — рӯйхати кортҳои маҳсулот барои рендер кардан (метавонад холӣ бошад).
  - `image` — танҳо номи файл аст. URL-и пурра: `https://bozortj-back.onrender.com/uploads/{image}`. Агар `image` = `null` бошад, расми placeholder нишон деҳ.
  - `effectivePrice` — нархе, ки бояд калон нишон дода шавад. Агар `isOnDiscount` = true бошад, нархи кӯҳна (`price`)-ро хатзада ва `discountPrice`-ро сурх нишон деҳ.
  - `stockQuantity` — агар `0` бошад, «Тамом шуд» нишон деҳ ва тугмаи харидро ғайрифаъол кун.

### Хатоҳо

- `400` — `message` холӣ ё дароз аст.
- `503` — `{ "message": "AI assistant is not configured..." }` — калиди AI дар сервер ҳоло гузошта нашудааст. Дар ин ҳолат ба корбар мулоим бигӯ: «Ёрдамчии AI ҳоло дастрас нест» ва тугмаро пинҳон/ғайрифаъол кун.
- `500` — хатои дохилӣ, паёми умумӣ нишон деҳ.

---

## Чӣ бояд созӣ (UI)

### 1. Тугмаи шинокунандаи чат (floating button)
- Дар кунҷи поёни рости ҳамаи саҳифаҳо як тугмаи мудаввар бо иконаи 🤖 ё чат.
- Матни хурд: «Ёрдамчии AI» ё «Кӯмак мехоҳед?».
- Бо клик — равзанаи чат кушода мешавад (modal ё drawer).

### 2. Равзанаи чат
- **Ҳошияи паёмҳо:** пуфакҳои корбар (рост) ва AI (чап).
- Паёми хушомадии аввал аз AI: «Салом! 👋 Ман ёрдамчии хариди шумо ҳастам. Чӣ ҷустуҷӯ доред? Масалан: "куртаи сиёҳ размери M" ё "телефон то 2000 сомонӣ".»
- **Майдони вуруд** + тугмаи фиристодан. Enter низ мефиристад.
- Ҳангоми интизории ҷавоб — индикатори «навишта истодааст…» (typing / loader).

### 3. Кортҳои маҳсулот дар чат
- Баъди ҳар паёми AI, агар `products` холӣ набошад, дар зери матн кортҳои маҳсулотро horizontal scroll ё grid нишон деҳ:
  - расм, ном, нарх (бо тахфиф агар бошад), бренд.
  - тугмаи **«Дидан»** → корбарро ба саҳифаи ҳамон маҳсулот (`/product/{id}`) мебарад.
  - ихтиёрӣ: тугмаи **«Ба сабад»** (агар корбар login карда бошад, аз API-и мавҷудаи сабад истифода бар).

### 4. Мантиқи фиристодан
- Ҳангоми фиристодан:
  1. Паёми корбарро фавран дар чат нишон деҳ.
  2. Дархостро бо `message` + `history` (таърихи то ин лаҳза, танҳо `role`+`content`) фирист.
  3. Ҷавобро гир, `reply`-ро ҳамчун паёми AI ва `products`-ро ҳамчун корт нишон деҳ.
  4. Ҳам паёми корбар ва ҳам паёми AI-ро ба `history`-и локалӣ илова кун, то дархости оянда контекст дошта бошад.
- Хатоҳоро мулоим коркард кун (масалан 503 → «Ёрдамчии AI ҳоло дастрас нест»).

### Мисоли дархост (fetch)

```ts
async function askAssistant(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
) {
  const res = await fetch('https://bozortj-back.onrender.com/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });
  if (res.status === 503) throw new Error('assistant_unavailable');
  if (!res.ok) throw new Error('assistant_error');
  return res.json(); // { reply, products }
}
```

## Типҳои TypeScript (илова кун)

```ts
type AssistantProduct = {
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
};

type AssistantReply = { reply: string; products: AssistantProduct[] };
type AssistantMessage = { role: 'user' | 'assistant'; content: string };
```

Дизайн бояд ба стили умумии сайт (рангҳо, шрифт, кунҷҳо) мувофиқ бошад. Чат бояд дар мобилӣ низ хуб кор кунад (responsive, full-screen дар экрани хурд).

---

## ⚙️ Ёддошт барои backend deploy (муҳим)
Ин фича як калиди API-и Anthropic-ро талаб мекунад. Дар **Render → Environment** тағйирёбандаи муҳитро илова кун:

```
ANTHROPIC_API_KEY = sk-ant-...
```

Ихтиёрӣ: `ASSISTANT_MODEL` (пешфарз `claude-opus-4-8`). Барои арзонтар/тезтар кардан метавон ба `claude-haiku-4-5` иваз кард.

Push ба `main` кофист — Render худкор деплой мекунад ва `prisma generate`-ро иҷро мекунад. Ҳеҷ тағйироти база лозим нест.
