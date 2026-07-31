# 🆕 Промт — маҷмӯаи нави функсияҳо (4 фичаи фронтенд + 2 таҳти капот)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин функсияҳои навро ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, `lib/socket.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend боз навсозӣ шуд. Ин дафъа:
**(1) Савол-ҷавоб дар саҳифаи мол**, **(2) Нархи расониш (фурӯшанда худаш мемонад)**, **(3) Молҳои монанд/тавсияҳо**, **(4) Расмҳои сабук (thumbnail)** — ва ду чизи «таҳти капот» (боти Telegram-и интерактивӣ ва ҳисоботи ҳаррӯза) ки frontend кор намехоҳанд.

`BASE = https://bozortj-back.onrender.com`. Расмҳо: `${BASE}{url}`. Токен: `Authorization: Bearer <token>`.

---

## 1. ❓ Савол-ҷавоб дар саҳифаи мол (Product Q&A)

Харидори тоҷик пеш аз харид ҳатман мепурсад («аслӣ аст?», «ба Хуҷанд мерасонед?»). Ҷавобҳо **оммавӣ** мемонанд — ҳар савол-ҷавоб фурӯши ояндаро меорад.

```
GET  ${BASE}/api/products/:id/questions          (public)        → { questions: [Q] }
POST ${BASE}/api/products/:id/questions          (BUYER)  { question }        → { question: Q }
POST ${BASE}/api/products/questions/:qid/answer  (SELLER) { answer }          → { question: Q }
GET  ${BASE}/api/products/questions/pending       (SELLER)        → { questions: [Q + product] }
```

`Q`:
```json
{
  "id": "uuid", "productId": "uuid",
  "question": "Аслӣ аст?", "answer": "Бале, 100% аслӣ" | null,
  "answeredAt": "..." | null, "createdAt": "...",
  "isAnswered": true,
  "askedBy": { "id": "uuid", "name": "Аҳмад" }
}
```
(Дар `/pending` ҳар савол `product: { id, name, image }` ҳам дорад.)

**UI:**
- **Саҳифаи мол** — блоки «❓ Савол-ҷавоб» (зери тавсиф/тақризҳо): рӯйхати саволҳои ҷавобдодашуда (савол + ҷавоби фурӯшанда + номи пурсанда). Барои харидори воридшуда — майдони «Саволатро нависед» + тугмаи «Фиристодан».
- **Панели фурӯшанда → «Саволҳо»**: рӯйхати `pending` (беҷавоб) бо тугмаи «Ҷавоб додан» → майдони матн → `POST .../answer`.
- Огоҳиномаҳо тавассути socket меоянд: `PRODUCT_QUESTION` (ба фурӯшанда), `QUESTION_ANSWERED` (ба харидор). Рӯйхатро аз нав бор кун.

---

## 2. 🚚 Нархи расониш — фурӯшанда худаш мемонад

Ҳоло **ҳар фурӯшанда** нархи расонишашро худаш муайян мекунад (бо ихтиёран «аз фалон маблағ боло — ройгон»). Дар checkout ин ба маблағи умумӣ илова мешавад.

### Фурӯшанда — танзимот
Ҳамон endpoint-и танзимоти мағоза акнун ин майдонҳоро ҳам қабул мекунад:
```
PUT ${BASE}/api/shops/settings/auto-reply   (SELLER, токен)
Body (ҳама ихтиёрӣ): {
  "autoReplyText"?, "autoReplyEnabled"?,
  "deliveryFee": 15,                 // сомонӣ; 0 = ройгон
  "freeDeliveryThreshold": 200        // аз 200 с. боло расониш ройгон; null/"" = хомӯш
}
→ { shop: { ..., deliveryFee, freeDeliveryThreshold } }
```
**UI:** дар танзимоти фурӯшанда ду майдон илова кун: «Нархи расониш (с.)» ва «Расониши ройгон аз (с.) — ихтиёрӣ».

### Харидор — checkout
Пеш аз тасдиқи фармоиш нархи расонишро нишон деҳ:
```
GET ${BASE}/api/orders/delivery-quote   (BUYER, токен)   // барои сабади ҷорӣ
→ {
  "productTotal": 350,
  "deliveryTotal": 15,
  "grandTotal": 365,
  "perShop": [
    { "shopId","shopName","subtotal": 350, "deliveryFee": 15,
      "isFreeDelivery": false, "freeDeliveryThreshold": 200 }
  ]
}
```
**UI:** дар саҳифаи сабад/checkout сатрҳо: «Молҳо: 350 с.», «Расониш: 15 с.» (ё «Ройгон 🎉» агар `isFreeDelivery`), «Ҳамагӣ: 365 с.». Агар чанд мағоза бошад — `perShop`-ро ҷудо нишон деҳ.

**Муҳим:** дар ҷавоби `POST /api/orders` акнун майдони `deliveryFee` ҳаст ва `totalPrice` аллакай расонишро дар бар мегирад — дар квитансия ҷудо нишон деҳ.

---

## 3. 🎯 Молҳои монанд / Тавсияҳо

Endpoint аллакай дар backend ҳаст — танҳо дар frontend истифода бар:
```
GET ${BASE}/api/products/:id/recommendations   (public)   → { recommendations: [Product] }
```
Мантиқ: аввал «якҷоя харида шудаанд» (аз фармоишҳо), баъд ҳамон категория. Ҳар `Product` ҳамон сохтори маъмулии мол (бо `images`, `brand`, `category`, баҳо).

**UI:** дар **поёни саҳифаи мол** секцияи «🎯 Молҳои монанд» ё «Инро ҳам гирифтанд» — карусели кортҳои мол. Агар холӣ бошад — секцияро нишон надеҳ.

---

## 4. 🖼️ Расмҳои сабук (Thumbnail)

Акнун ҳар расми мол як нусхаи хурд (`thumbnailUrl`) дорад — барои рӯйхатҳо дар интернети суст. Дар `ProductImage`:
```json
{ "id": "uuid", "url": "/uploads/products/...", "thumbnailUrl": "/uploads/products/thumb-..." | null }
```

**UI:** дар **рӯйхатҳо/гридҳо/карусель** `thumbnailUrl`-ро истифода бар, дар **саҳифаи мол** (расми калон) `url`-ро.
```ts
const src = `${BASE}${img.thumbnailUrl || img.url}`; // расмҳои кӯҳна thumbnailUrl надоранд → fallback
```
Ин рӯйхатҳоро якчанд маротиба сабуктар мекунад.

---

## 🔌 Socket — навъҳои нави огоҳинома

Ба `switch (n.type)`-и мавҷуд илова кун:
```ts
case 'PRODUCT_QUESTION':  break; // → фурӯшанда: панели «Саволҳо»
case 'QUESTION_ANSWERED': break; // → харидор: саҳифаи мол, блоки Q&A
// мавҷуда аз пеш: NEW_ORDER, ORDER_STATUS, ABANDONED_CART,
// PRICE_OFFER, OFFER_ACCEPTED/REJECTED/COUNTERED, COUNTER_ACCEPTED,
// PAYMENT_PAID, ORDER_PAID
```

---

## 🤖 Таҳти капот (frontend кор намехоҳад)

- **Боти Telegram акнун интерактивӣ**: фурӯшанда пешниҳоди нархро **[✅ Қабул]/[❌ Рад]** ва фармоишро **[✅ Қабул кардам]/[🚚 Фиристодам]** аз худи Telegram идора мекунад; фармонҳои `/orders` (харидор) ва `/today` (ҳисоботи фурӯшанда). Ин ҳамон системаи notification-и мавҷуда аст — frontend танҳо тугмаи «Пайваст ба Telegram»-ро дорад (аз промти пешина).
- **Ҳисоботи ҳаррӯза**: ҳар бегоҳ бот ба фурӯшандаи пайвастшуда ҷамъбасти рӯзро мефиристад. Худкор.

---

## Типҳои TypeScript (илова кун)

```ts
type ProductQuestion = {
  id: string; productId: string;
  question: string; answer: string | null;
  answeredAt: string | null; createdAt: string; isAnswered: boolean;
  askedBy: { id: string; name: string } | null;
  product?: { id: string; name: string; image: string | null }; // танҳо дар /pending
};

type DeliveryQuote = {
  productTotal: number; deliveryTotal: number; grandTotal: number;
  perShop: {
    shopId: string; shopName: string; subtotal: number;
    deliveryFee: number; isFreeDelivery: boolean; freeDeliveryThreshold: number | null;
  }[];
};

// ProductImage акнун thumbnailUrl дорад:
type ProductImage = { id: string; url: string; thumbnailUrl: string | null };
```

Дизайн ба стили умумии сайт мувофиқ бошад ва дар мобилӣ хуб кор кунад.

---

## ⚙️ Ёддошт барои backend / deploy

- **Тавсия — keep-alive (муҳим!):** Render дар free tier пас аз ~15 дақиқа хоб меравад ва боти Telegram қатъ мешавад. Дар [UptimeRobot](https://uptimerobot.com) (ройгон) як монитор соз, ки ҳар 5 дақиқа `https://bozortj-back.onrender.com/health`-ро занад — сервер бедор мемонад ва бот доимо кор мекунад.
- Ҳеҷ калиди нав барои ин 4 фича лозим нест — фавран кор мекунанд.
- Ихтиёрӣ: `SUMMARY_HOUR_UTC` (пешфарз 15 = ~20:00 дар Тоҷикистон) — вақти ҳисоботи ҳаррӯзаи Telegram.
- Push ба `main` кофист — Render `prisma db push`-ро худкор иҷро мекунад, пас майдонҳои нав (`ShopProfile.deliveryFee/freeDeliveryThreshold`, `Order.deliveryFee`, `ProductImage.thumbnailUrl`, ҷадвали `ProductQuestion`) татбиқ мешаванд.
