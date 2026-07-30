# 🆕 Промт — ТАНҲО функсияҳои нав (5 фичаи нав)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **5 функсияи навро** ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, `lib/socket.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend навсозӣ шуд. 5 фичаи нав илова шуд: **(1) Ҷустуҷӯи аксӣ**, **(2) Генератсияи тавсиф бо AI барои фурӯшанда**, **(3) Ёдоварии сабади партофта**, **(4) Флеш-фурӯш бо ҳисобкунаки зинда**, **(5) Хулосаи AI-и тақризҳо**.

`BASE = https://bozortj-back.onrender.com`. Расмҳо: `${BASE}/uploads/{image}`. Токен: `Authorization: Bearer <token>` барои endpoint-ҳои фурӯшанда.

---

## 1. 📸 Ҷустуҷӯи аксӣ (Visual Search)

Харидор акс мегирад (масалан молеро дар куҷое дидааст) → AI аксро мебинад, мефаҳмад чист ва монандашро аз база меёбад.

```
POST ${BASE}/api/assistant/photo        (аутентификатсия лозим НЕСТ)
```

Ду тарзи фиристодан:
- **multipart/form-data**: майдони `photo` (файли акс, то 8MB) + ихтиёрӣ `note` (матн).
- ё **JSON**: `{ "imageBase64": "data:image/jpeg;base64,...", "note": "..." }` (ё base64-и хом + `mediaType`).

Ҷавоб — **ҳамон формати ассистенти чат**:
```json
{ "reply": "Ин ба куртаи сиёҳ монанд аст. Ана вариантҳои монанд:", "products": [ ... ] }
```
`products` ҳамон сохтори `AssistantProduct` аст (id, name, price, discountPrice, effectivePrice, isOnDiscount, brand, category, image, stockQuantity, shopName).

**UI:** дар равзанаи ассистент (ё саҳифаи ҷустуҷӯ) тугмаи 📷 «Бо акс ҷустуҷӯ». Корбар аксро интихоб мекунад → loader → ҷавоб ва кортҳои маҳсулотро нишон деҳ (ҳамон компоненти кортҳои ассистент). Хатоҳо: `503` (AI танзим нашуда), `400` (акс нодуруст).

---

## 2. ✍️ Генератсияи тавсиф бо AI (барои фурӯшанда)

Дар формаи иловаи/таҳрири мол тугмаи «✨ Бо AI пур кун» — фурӯшанда танҳо ном (+ихтиёрӣ бренд/категория/калидвожа) медиҳад, AI тавсифи омодаро менависад.

```
POST ${BASE}/api/assistant/generate-description   (танҳо SELLER, токен лозим)
Body: { "name": "Redmi A3", "category": "Телефонҳо", "brand": "Xiaomi", "keywords": "128гб, ранги кабуд, батареяи калон" }
```
Ҷавоб:
```json
{ "description": "Смартфони Redmi A3 бо хотираи 128 ГБ..." }
```

**UI:** дар назди майдони «Тавсиф» тугмаи «✨ Бо AI пур кун». Ҳангоми клик — loader, баъд натиҷаро ба майдони тавсиф гузор (корбар метавонад таҳрир кунад). Хатоҳо: `503` (AI танзим нашуда — тугмаро пинҳон/ғайрифаъол кун), `400` (ном холӣ).

---

## 3. 🛒 Ёдоварии сабади партофта (Abandoned Cart)

Backend худкор (ҳар соат) агар моле зиёда аз **24 соат** дар сабад бимонад, ба харидор як **огоҳинома** мефиристад. Ин тавассути ҳамон системаи мавҷудаи notification меравад — фронтенд танҳо бояд навъи наверо коркард кунад.

Socket event-и мавҷудаи `new_notification` акнун метавонад `type: 'ABANDONED_CART'` дошта бошад:
```ts
socket.on('new_notification', (n) => {
  // n = { title, content, createdAt, type? }
  // type метавонад 'NEW_ORDER' | 'ORDER_STATUS' | 'ABANDONED_CART' бошад
  // ABANDONED_CART-ро мисли огоҳиномаи оддӣ нишон деҳ (тоаст + дар рӯйхати огоҳиномаҳо).
  // Бо клик → корбарро ба саҳифаи сабад бар.
});
```
**Чизи нав насоз** — танҳо мутмаин шав, ки огоҳиномаҳои `ABANDONED_CART` дар зангӯла/рӯйхати огоҳиномаҳо пайдо мешаванд ва клик ба `/cart` мебарад. (Backend inam ба база сабт мекунад, пас `GET /api/notifications`-и мавҷуда ҳам онро бармегардонад.)

---

## 4. ⚡ Флеш-фурӯш бо ҳисобкунаки зинда (Flash Sale)

Фурӯшанда тахфифи вақтдорро эълон мекунад; дар саҳифаи асосӣ банер бо countdown ва рақами «фурӯхта шуд» ки **зинда** боло меравад.

### Public
```
GET ${BASE}/api/flash-sales/active     → { flashSales: [ FlashSale ] }
GET ${BASE}/api/flash-sales/:id        → { flashSale: FlashSale }
```
`FlashSale`:
```json
{
  "id": "uuid",
  "productId": "uuid",
  "salePrice": 1200,
  "originalPrice": 1500,
  "startsAt": "2026-07-30T10:00:00Z",
  "endsAt": "2026-07-30T14:00:00Z",
  "soldCount": 7,
  "stockLimit": 50,
  "isActive": true,
  "isSoldOut": false,
  "secondsRemaining": 5400,
  "product": { "id","name","price","image","brand","category","shopName","stockQuantity" }
}
```

### Зинда (Socket) — ҳисобкунаки фурӯш
Ҳангоми ҳар харид, ба ҳамаи корбарон фиристода мешавад:
```ts
socket.on('flash_sale_update', ({ flashSaleId, productId, soldCount, stockLimit }) => {
  // Рақами "фурӯхта шуд: N"-ро дар банер/корти ҳамон флеш-фурӯш зинда нав кун
  // (агар stockLimit бошад: "N/stockLimit фурӯхта шуд" ё progress bar).
});
```
Ин пайвасти socket-и мавҷударо истифода мебарад (барои меҳмон ҳам кор мекунад).

### Фурӯшанда (токен лозим, SELLER)
```
POST   ${BASE}/api/flash-sales
  Body: { "productId", "salePrice", "endsAt", "startsAt"?, "stockLimit"? }
  (salePrice бояд аз нархи мол камтар; endsAt санаи ояндаи воқеӣ бошад)
GET    ${BASE}/api/flash-sales/mine   → { flashSales: [...] }
DELETE ${BASE}/api/flash-sales/:id    → бекор кардани флеш-фурӯши худ
```

**UI:**
- Дар **саҳифаи асосӣ** секцияи «⚡ Флеш-фурӯш» — кортҳо бо нархи кӯҳна (хатзада) + `salePrice`, countdown аз `secondsRemaining` (таймерро локалӣ ҳар сония кам кун), ва «🔥 {soldCount} фурӯхта шуд». `flash_sale_update`-ро гӯш кун ва зинда нав кун.
- Дар **панели фурӯшанда** формаи сохтани флеш-фурӯш (интихоби мол + нархи тахфиф + вақти анҷом) ва рӯйхати флеш-фурӯшҳои фаъол бо тугмаи бекоркунӣ.
- Агар `isSoldOut` ё `secondsRemaining === 0` шавад — «Тамом шуд» нишон деҳ.

---

## 5. ⭐ Хулосаи AI-и тақризҳо (Review Summary)

Дар саҳифаи мол, болои тақризҳо — ҷамъбасти AI: нуктаҳои мусбат, манфӣ ва хулоса.

```
GET ${BASE}/api/products/:id/review-summary     (public)
```
Агар тақризҳои кофӣ (≥3 бо матн) набошад:
```json
{ "available": false, "message": "Not enough reviews to summarize yet", "reviewCount": 1 }
```
Агар бошад:
```json
{
  "available": true,
  "summary": { "pros": ["Сифати хуб","Дастрасии тез"], "cons": ["Размераш каme хурд"], "verdict": "Аксари харидорон розӣ ҳастанд." },
  "basedOnReviews": 12,
  "generatedAt": "2026-07-30T12:00:00Z",
  "cached": true
}
```

**UI:** дар саҳифаи мол, боло аз рӯйхати тақризҳо як блоки «🤖 Ҷамъбасти тақризҳо»:
- `verdict` ҳамчун сарлавҳа,
- `pros` бо ✅, `cons` бо ⚠️.
- Агар `available: false` — блокро нишон надеҳ.
- Backend натиҷаро кеш мекунад ва танҳо ҳангоми зиёд шудани тақризҳо аз нав месозад — пас ин занг арзон аст. Хато: `503` (AI танзим нашуда — блокро нишон надеҳ).

---

## Типҳои TypeScript (илова кун)

```ts
type AssistantProduct = {
  id: string; name: string; price: number; discountPrice: number | null;
  isOnDiscount: boolean; effectivePrice: number; brand: string | null;
  category: string | null; image: string | null; stockQuantity: number; shopName: string | null;
};
type AssistantReply = { reply: string; products: AssistantProduct[] };

type FlashSale = {
  id: string; productId: string; salePrice: number; originalPrice: number | null;
  startsAt: string; endsAt: string; soldCount: number; stockLimit: number | null;
  isActive: boolean; isSoldOut: boolean; secondsRemaining: number;
  product: { id: string; name: string; price: number; image: string | null;
    brand: string | null; category: string | null; shopName: string | null; stockQuantity: number } | null;
};
type FlashSaleUpdate = { flashSaleId: string; productId: string; soldCount: number; stockLimit: number | null };

type ReviewSummary = { pros: string[]; cons: string[]; verdict: string };
type ReviewSummaryResponse =
  | { available: false; message: string; reviewCount: number }
  | { available: true; summary: ReviewSummary; basedOnReviews: number; generatedAt: string; cached: boolean };
```

Дизайн ба стили умумии сайт мувофиқ бошад ва дар мобилӣ хуб кор кунад.

---

## ⚙️ Ёддошт барои backend deploy (муҳим)
Фичаҳои AI (ҷустуҷӯи аксӣ, генератсияи тавсиф, хулосаи тақриз) калиди Anthropic мехоҳанд. Дар **Render → Environment** илова кун:
```
ANTHROPIC_API_KEY = sk-ant-...
```
Ихтиёрӣ: `ASSISTANT_MODEL` (пешфарз `claude-opus-4-8`; барои арзонтар `claude-haiku-4-5`). То гузоштани калид, ин 3 endpoint `503` бармегардонанд — сайт вайрон намешавад. Флеш-фурӯш ва ёдоварии сабад бе AI кор мекунанд.

Push ба `main` кофист — Render худкор `prisma db push`-ро иҷро мекунад, пас майдонҳо/ҷадвалҳои нав (FlashSale, `abandonedNotified`, кеши хулосаи тақриз) худкор татбиқ мешаванд. Ёдоварии сабад дар free tier-и Render (хоб пас аз ~15 дақиқа) best-effort аст — пас аз бедор шудани сервер кор мекунад.
