# 🆕 Промт — маҷмӯаи нави функсияҳо (кашф, таблиғ, огоҳиҳо, i18n)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин функсияҳои навро ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, `lib/socket.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend боз навсозӣ шуд. Ин дафъа даҳ чиз илова шуд:
**(1) Огоҳӣ дар бораи пастшавии нарх** (wishlist), **(2) Ҷустуҷӯи беҳтар + autocomplete**, **(3) Охирин дидашудаҳо**, **(4) Муқоисаи молҳо**, **(5) Молҳои таблиғшаванда (promoted)**, **(6) Огоҳии камшавии анбор (фурӯшанда)**, **(7) Аналитикаи васеи фурӯшанда**, **(8) Тавсияҳо (аллакай буд)**, **(9) Забон — тоҷикӣ/русӣ дар огоҳиҳо**, **(10) Пайгирии фармоиш бо огоҳии ҳар қадам**.

`BASE = https://bozortj-back.onrender.com`. Расмҳо: `${BASE}{url}`. Токен: `Authorization: Bearer <token>`.
Ҳар мол дар ҷавобҳо `images[]`, `variants[]`, `brand`, `category`, `color`, `shop {id, shopName}`, `averageRating`, `reviewCount` дорад — ҳамон шакли мавҷуда.

---

## 1. 🔻 Огоҳӣ дар бораи пастшавии нарх

Вақте фурӯшанда нархи молеро паст мекунад, ҳар харидоре ки он мол дар **рӯйхати дилхоҳ (wishlist)**-и ӯст, худкор огоҳӣ мегирад (in-app + Telegram + web push). **Аз тарафи frontend кори иловагӣ лозим нест** — огоҳӣ ҳамчун notification-и оддӣ меояд.

Дар socket/notification-и live навъи нав:
```json
{ "type": "PRICE_DROP", "productId": "uuid" }
```
**UI:** дар зангӯлаи огоҳиҳо чунин огоҳиро бо иконаи 🔻 нишон деҳ; ҳангоми клик → саҳифаи мол (`/products/:productId`). Матн аллакай ба забони харидор омода аст.

---

## 2. 🔎 Ҷустуҷӯи беҳтар + Autocomplete

Ҷустуҷӯ ҳоло **бесаробаробарӣ ба ҳарф** (case-insensitive), **бисёркалима** (ҳар калима ҷудо ҷустуҷӯ мешавад) ва ба **ном, тавсиф, бренд, категория ва зеркатегория** нигоҳ мекунад. Мисол: `samsung telefon` → бо бренд + категория ҳам меёбад.

### Autocomplete (ҳангоми навиштан)
```
GET ${BASE}/api/products/search/suggestions?q=sam   (public)
→ {
    products:   [ { id, name } ],   // то 6-то
    brands:     [ { id, name } ],   // то 4-то
    categories: [ { id, name } ]    // то 4-то
  }
```
- Аз 2 ҳарф сар карда даъват кун (debounce ~250ms). Агар `q.length < 2` — рӯйхати холӣ бармегардад.
- **UI:** зери майдони ҷустуҷӯ dropdown бо се гурӯҳ: «Молҳо», «Брендҳо», «Категорияҳо». Клик ба мол → `/products/:id`; ба бренд → `/products?brandId=...`; ба категория → `/products?categoryId=...`.

### Ҷустуҷӯ + филтр + тартиб (саҳифаи рӯйхат)
```
GET ${BASE}/api/products?search=...&categoryId=...&brandId=...&colorId=...
    &minPrice=100&maxPrice=900&sort=price_asc&promoted=true
```
Параметрҳои нав:
- `sort` = `price_asc` | `price_desc` | `newest` | `popular` (аз рӯи дидан). Бе `sort` — молҳои таблиғшуда аввал, баъд навтарин.
- `minPrice`, `maxPrice` — филтри диапазони нарх.
- `promoted=true` — танҳо молҳои таблиғшудаи фаъол.
Ҳар мол акнун майдони `isPromotedActive: boolean` дорад (нишони «⭐ Таблиғ» гузор).

**UI:** ба саҳифаи каталог dropdown-и «Тартиб» ва slider/майдони диапазони нарх илова кун.

---

## 3. 🕘 Охирин дидашудаҳо (Recently Viewed)

Ҳар вақт харидори воридшуда саҳифаи молро мекушояд, он худкор ба таърих сабт мешавад (backend худаш ҳангоми `GET /api/products/:id` бо токен сабт мекунад — фақат мутмаин шав, ки ҳангоми кушодани саҳифаи мол **токен фиристода мешавад**).

```
GET ${BASE}/api/products/discovery/recently-viewed   (BUYER)
→ { products: [ Product + { viewedAt } ] }   // то 12-то, навтарин аввал
```
**UI:** дар саҳифаи асосӣ/профил блоки «🕘 Ба наздикӣ дидед» (карусели уфуқӣ). Танҳо барои харидори воридшуда нишон деҳ.

---

## 4. ⚖️ Муқоисаи молҳо (Compare)

```
GET ${BASE}/api/products/discovery/compare?ids=ID1,ID2,ID3   (public, 2–4 мол)
→ {
    attributeKeys: ["ram", "storage", ...],   // ҷамъи ҳамаи хусусиятҳо
    products: [ Product ]                       // бо тартиби дархостшуда
  }
```
**UI:**
- Дар корти мол/саҳифаи мол тугмаи «⚖️ Муқоиса» — ба рӯйхати муқоиса (дар store/localStorage, то 4-то) илова кунад.
- Саҳифаи `/compare` — ҷадвали уфуқӣ: сатр-сатр нарх, бренд, ранг, рейтинг ва ҳар калиди `attributeKeys` (агар моле он хусусиятро надошта бошад — «—»). Сутунҳо = молҳо бо расм ва тугмаи «Ба сабад».

---

## 5. ⭐ Молҳои таблиғшаванда (Promoted / Featured)

Фурӯшанда пул дода, молашро дар боло ҷой мекунад (ҳозир пардохт mock аст — фавран фаъол мешавад).

### Барои саҳифаи асосӣ (оммавӣ)
```
GET ${BASE}/api/products/discovery/promoted   (public)
→ { products: [ Product ] }   // то 12-то, таблиғи фаъол
```
**UI:** дар саҳифаи асосӣ боло блоки «⭐ Тавсияи мағозаҳо» (карусел). Дар каталог молҳои `isPromotedActive` бо нишони «⭐ Таблиғ».

### Барои фурӯшанда (таблиғ кардани мол)
```
POST ${BASE}/api/products/:id/promote   (SELLER, соҳиби мол)   { days: 7 }
→ { message, cost, dailyRate, promotedUntil, product: { id, isPromoted, promotedUntil } }
```
- `days` = 1..30 (агар зиёд/кам бошад, backend клип мекунад). Нарх = `days × dailyRate` (ҳозир 5 сомонӣ/рӯз).
- Агар мол аллакай таблиғи фаъол дошта бошад — муддат **дароз** мешавад.
**UI:** дар панели фурӯшанда назди ҳар мол тугмаи «⭐ Таблиғ кун» → модал: интихоби рӯзҳо + нишондоди нарх → тасдиқ. Баъди муваффақият «Таблиғ то {promotedUntil}» нишон деҳ.

---

## 6. ⚠️ Огоҳии камшавии анбор (фурӯшанда)

Вақте баъди фурӯш захираи мол ба ҳадди муайян (пешфарз 5) ё камтар мерасад, фурӯшанда огоҳӣ мегирад (як бор дар ҳар камшавӣ; баъди пур кардани анбор аз нав фаъол мешавад).

Навъи notification-и live:
```json
{ "type": "LOW_STOCK", "productId": "uuid" }
```
Фурӯшанда метавонад **ҳадди огоҳӣ**-ро худаш танзим кунад — ҳангоми навсозии мол майдони нав:
```
PUT ${BASE}/api/products/:id   (SELLER)   ... + lowStockThreshold: 3
```
**UI:** дар форми таҳрири мол майдони «Ҳадди огоҳии камшавии анбор» (рақам). Дар зангӯла огоҳиро бо иконаи ⚠️ ва линк ба таҳрири мол нишон деҳ.

---

## 7. 📊 Аналитикаи васеи фурӯшанда

`GET ${BASE}/api/analytics` (SELLER) акнун майдонҳои нав дорад (ба илова ба ҳамаи майдонҳои қаблӣ):
```json
{
  "analytics": {
    "...": "майдонҳои кӯҳна (totalRevenue, topProducts, monthlyBreakdown ...)",
    "totalViews": 1240,            // ҷамъи дидани ҳамаи молҳо
    "conversionRate": 3.5,          // % (фурӯш ÷ дидан)
    "productCount": 42,
    "activePromotions": 2,
    "lowStockProducts": [ { "id", "name", "stock", "threshold" } ],
    "viewedNotSold":    [ { "id", "name", "views" } ]   // то 5-то: дида мешаванд, вале харида намешаванд
  }
}
```
**UI (панели аналитикаи фурӯшанда):**
- Кортҳои нав: «Ҷамъи дидан», «Конверсия %», «Таблиғҳои фаъол».
- Блоки «⚠️ Мол кам монд» — рӯйхати `lowStockProducts` бо тугмаи таҳрир.
- Блоки «👀 Дида мешавад, вале харида намешавад» (`viewedNotSold`) — маслиҳат: нархро паст кун ё таблиғ кун.

---

## 8. 🧩 Тавсияҳо (аллакай буд — ёдоварӣ)

```
GET ${BASE}/api/products/:id/recommendations   (public)
→ { recommendations: [ Product ] }   // «якҷоя мехаранд» + ҳамон категория
```
**UI:** дар саҳифаи мол блоки «🧩 Молҳои монанд».

---

## 9. 🌐 Забон — тоҷикӣ / русӣ

Огоҳиҳо (фармоиш, пастшавии нарх, камшавии анбор, ҳолати фармоиш) акнун ба **забони интихобкардаи корбар** меоянд. Корбар забонро дар профил интихоб мекунад:
```
PUT ${BASE}/api/auth/me   (auth)   { language: "tj" | "ru" }
→ { user: { ..., language } }
```
`GET /api/auth/me`, `login` ва `PUT /api/auth/me` ҳама майдони `language`-ро бармегардонанд.
**UI:** дар танзимоти профил гузаришгари забон «Тоҷикӣ / Русский». (Ин танҳо забони огоҳиҳо/боти Telegram аст — тарҷумаи худи интерфейс дар ихтиёри frontend.)

---

## 10. 📦 Пайгирии фармоиш (огоҳии ҳар қадам)

Аллакай `GET /api/orders/:id/timeline` ҳаст. Ҳоло дар ҳар тағйири ҳолат харидор огоҳии **тарҷумашуда** мегирад (ном + иконаи 📦), ҳам in-app, ҳам Telegram, ҳам web push. Ҳолатҳо: `PENDING → PROCESSING → SHIPPED → DELIVERED` (ё `CANCELLED`).

Навъи notification: `{ "type": "ORDER_STATUS", "orderId": "uuid", "status": "SHIPPED" }` — ҳамчун пештар, вале матн тарҷумашуда.
**UI:** ба саҳифаи фармоиш timeline-и зинапоя (агар ҳанӯз нест) илова кун; live-навсозӣ тавассути socket (event-и мавҷуда) — бе refresh.

---

### Хулоса — чӣ илова кунӣ
1. Autocomplete-и ҷустуҷӯ + tartib/filtri narx.
2. Карусели «Ба наздикӣ дидед» ва «⭐ Тавсияи мағозаҳо».
3. Саҳифа/ҷадвали муқоиса `/compare`.
4. Тугма ва модали «Таблиғ кун» дар панели фурӯшанда.
5. Кортҳо ва блокҳои нави аналитика.
6. Майдони `lowStockThreshold` дар форми мол.
7. Гузаришгари забон дар профил.
8. Нишони «⭐ Таблиғ» дар кортҳои мол.

Огоҳиҳои нав (`PRICE_DROP`, `LOW_STOCK`) танҳо ба зангӯлаи мавҷуда илова мешаванд — сохтори notification яксон аст.

---
---

# 🆕🆕 Даста-2 — 22 функсияи нав (насия, тӯёна, оптом, курер, видео, AI ва ғ.)

> Ин илова ба болост. Ҳамон қоида: **аз нав насоз**, танҳо ба лоиҳаи мавҷуда илова кун. `BASE = https://bozortj-back.onrender.com`, токен `Authorization: Bearer <token>`, расмҳо `${BASE}{url}`.

Backend боз калон навсозӣ шуд. Инак ҳама:

## 1. 📱 Мағоза дар Telegram (Mini App)
Як Telegram Web App соз, ки ҳамон API-ро истифода мебарад. Барои ворид шудани корбар:
```
POST ${BASE}/api/telegram/miniapp-auth   { initData }   → { token, user }
```
`initData` = `window.Telegram.WebApp.initData`. Backend имзоро тафтиш мекунад ва токени JWT медиҳад (агар ҳисоб аллакай ба Telegram пайваст бошад). Агар пайваст набошад → 404 «аввал дар сайт пайваст кун».
**UI:** саҳифаи `/tg` — сабук, каталог + сабад + фармоиш. Токенро аз `miniapp-auth` гир ва ба ҳамон `lib/api.ts` деҳ.

## 2. 💳 Насия (пардохти бо қисмҳо)
Фурӯшанда фаъол мекунад:
```
PUT ${BASE}/api/shops/settings/auto-reply (SELLER)  { installmentEnabled: true, installmentMonths: "3,6,9" }
```
Харидор ҳангоми checkout:
```
POST ${BASE}/api/orders  { addressId, installmentMonths: 6, ... }
→ фармоиш бо paymentMethod=INSTALLMENT + ҷадвали пардохт
```
Насия танҳо вақте кор мекунад, ки **ҳамаи мағозаҳои сабад** онро дастгирӣ кунанд. Дар ҷавоби фармоиш `installment: { months, monthlyAmount, totalAmount, nextDueDate }`.
**UI:** дар checkout, агар мол насия дошта бошад, интихоби «3/6/9 моҳ» + нишондоди «≈ X сомонӣ/моҳ».

## 3. 🔔 «Хабар деҳ, вақте омад» (back-in-stock)
Вақте мол тамом шуд (`stockQuantity=0`), ба ҷои тугмаи хомӯш:
```
POST   ${BASE}/api/products/:id/notify-stock   (BUYER)  → обуна
DELETE ${BASE}/api/products/:id/notify-stock   (BUYER)
```
Мол ки аз нав омад → notification навъи `BACK_IN_STOCK` худкор меояд.
**UI:** дар саҳифаи моли тамомшуда тугмаи «🔔 Хабар деҳ вақте омад».

## 4. ➕ Обуна ба мағоза (follow)
```
POST   ${BASE}/api/shops/:shopId/follow    (BUYER)  → { following, followerCount }
DELETE ${BASE}/api/shops/:shopId/follow    (BUYER)
GET    ${BASE}/api/shops/following          (BUYER)  → { shops: [...] }
GET    ${BASE}/api/shops/:shopId/status     (public) → { online, followerCount, following }
```
Мағоза моли нав ё flash sale гузошт → обуначиён notification мегиранд (`NEW_PRODUCT`, `FLASH_SALE`).
**UI:** дар саҳифаи мағоза тугмаи «➕ Пайгирӣ» + шумораи пайгирон + нуқтаи 🟢/⚪ онлайн.

## 5. 📈 Таърихи нарх
```
GET ${BASE}/api/products/:id/price-history   (public)  → { history: [{ price, createdAt }] }
```
**UI:** дар саҳифаи мол графики хурди хаттӣ (нарх дар вақт). Агар <2 нуқта — нишон надеҳ.

## 6. 🎁 Харидани якҷоя (bundle)
```
GET    ${BASE}/api/bundles/product/:productId  (public)  → { bundles: [{ name, discountPercent, items[], pricing }] }
GET    ${BASE}/api/bundles/shop/:shopId        (public)
POST   ${BASE}/api/bundles   (SELLER)  { name, discountPercent, productIds: [id1, id2] }
DELETE ${BASE}/api/bundles/:id  (SELLER)
```
`pricing = { originalTotal, bundlePrice, savings }`.
**UI:** дар саҳифаи мол блоки «🎁 Якҷоя арзонтар» бо нархи маҷмӯа ва тугмаи «Ҳамаро ба сабад». Дар панели фурӯшанда — созандаи маҷмӯа.

## 7. 🔥 Молҳои тренд
```
GET ${BASE}/api/products/discovery/trending   (public)  → { products: [...] }
```
Аз рӯи фаъолнокии 7 рӯзи охир (дидан + фурӯш).
**UI:** дар саҳифаи асосӣ блоки «🔥 Тренди ҳафта».

## 8. 📥 Экспорт/Импорти Excel (CSV)
```
GET  ${BASE}/api/seller/export/orders   (SELLER)  → файли CSV (боркунӣ)
POST ${BASE}/api/seller/import/products (SELLER)  multipart "file" (CSV)
     Сутунҳо: name, description, price, stockQuantity, brand, [size], [discountPrice]
     → { importedCount, errorCount, errors: [{row, message}] }
```
**UI:** дар панели фурӯшанда тугмаи «⬇️ Экспорти фармоишҳо (Excel)» ва «⬆️ Импорти молҳо аз CSV» + намунаи файл барои зеркашӣ.

## 9. 🟢 Фурӯшанда онлайн
Ниг. №4 (`/shops/:shopId/status`). Инчунин socket event: `presence_update { userId, online }`. Дар сокет ба `presence_update` гӯш кун ва нуқтаи онлайнро live навсозӣ кун.

## 10. 💬 Ҷавоби тайёри AI (фурӯшанда)
```
POST ${BASE}/api/assistant/suggest-reply  (SELLER)  { questionId }  ё  { reviewId }
→ { reply: "матни тайёр" }
```
**UI:** назди ҳар савол/тақриз тугмаи «✨ Ҷавоби AI» → матнро ба майдон гузор, фурӯшанда таҳрир карда «Фиристодан».

## 11. 💍 Рӯйхати тӯёна (gift registry)
```
POST   ${BASE}/api/registries   (auth)  { title, eventDate? }  → { registry: { shareCode, ... } }
GET    ${BASE}/api/registries/mine   (auth)
POST   ${BASE}/api/registries/:id/items   (owner)  { productId, quantityWanted? }
DELETE ${BASE}/api/registries/:id/items/:itemId   (owner)
GET    ${BASE}/api/registries/:shareCode   (public)  → намоиши меҳмон
POST   ${BASE}/api/registries/:shareCode/items/:itemId/purchase   (public)  { quantity? }
```
Ҳар айтем `quantityWanted` ва `quantityPurchased` дорад.
**UI:** саҳифаи `/registry` — сохтани рӯйхат, илова кардани молҳо, линки мубодила. Саҳифаи оммавии `/registry/:shareCode` — меҳмон мебинад чӣ лозим аст ва «Ман инро мехарам» → `purchase` (нишони ✅ «харида шуд»).

## 12. 📦 Оптом (нархи яклухт)
```
GET ${BASE}/api/products/:id/wholesale   (public)  → { tiers: [{ minQty, price }] }
PUT ${BASE}/api/products/:id/wholesale    (SELLER)  { tiers: [{ minQty: 10, price: 42 }] }
```
Дар checkout нархи оптом **худкор** татбиқ мешавад (агар шумораи мол дар сабад >= minQty).
**UI:** дар саҳифаи мол ҷадвали «Оптом: аз 10 дона — 42 с., аз 50 — 38 с.». Дар форми мол — муҳаррири зинаҳо.

## 13. 🏷 QR-коди мағоза
```
GET ${BASE}/api/seller/qr   (SELLER)  → { url, qrDataUrl (PNG base64) }
```
**UI:** дар панели фурӯшанда «QR-коди мағоза» → нишон додани расм + тугмаи «Чоп/Зеркашӣ».

## 14. 📸 Ҷустуҷӯ бо расм
Аллакай тайёр: `POST ${BASE}/api/assistant/photo` (multipart "photo" ё `{ imageBase64 }`) → `{ reply, products }`.
**UI:** дар ҷустуҷӯ иконаи 📷 → боркунии акс → нишон додани молҳои ёфтшуда.

## 15. 🌐 Тарҷумаи худкори мол
Ҳангоми сохтани мол, backend худкор `nameRu`/`descriptionRu` тавлид мекунад (агар GROQ фаъол бошад). Дастӣ низ:
```
POST ${BASE}/api/assistant/translate  (SELLER)  { name, description, target: "ru" | "tj" }  → { name, description }
```
Дар ҷавоби мол майдонҳои `nameRu`, `descriptionRu` ҳастанд.
**UI:** агар забони корбар русӣ бошад ва `nameRu` мавҷуд, онро нишон деҳ. Дар форми мол тугмаи «Тарҷума ба русӣ».

## 16. 🤝 Савдои худкор (auto-accept)
Фурӯшанда ҳадди ақали нархро мемонад:
```
PUT ${BASE}/api/products/:id  (SELLER)  ... + minAcceptablePrice: 40
```
Пешниҳоди харидор >= ин → **фавран** қабул, купон дарҳол. Ҷавоби `POST /api/offers`: `{ autoAccepted: true, couponCode }`.
**UI:** дар форми мол майдони «Нархи ҳадди ақали худкор». Дар савдо, агар `autoAccepted` — дарҳол «✅ Қабул шуд! Коди купон: ...».

## 17. 🏪 Худгирӣ (pickup)
Фурӯшанда:
```
PUT ${BASE}/api/shops/settings/auto-reply  (SELLER)  { allowPickup: true, pickupAddress: "..." }
```
Харидор дар checkout:
```
POST ${BASE}/api/orders  { deliveryType: "PICKUP" }   // addressId лозим нест, пули расониш = 0
```
**UI:** дар checkout интихоби «🚚 Расониш / 🏪 Худам мегирам». Агар PICKUP — суроғаи мағозаро нишон деҳ, пули расонишро гир.

## 18. 🛵 Модули курер
Роли нав: **COURIER**.
```
POST ${BASE}/api/couriers/register   (public)  { name, email, phone, password }  → { token, user }
GET  ${BASE}/api/couriers             (SELLER/ADMIN)  → { couriers: [{id, name, phone}] }
POST ${BASE}/api/orders/:id/assign-courier  (SELLER/ADMIN)  { courierId }
GET  ${BASE}/api/courier/deliveries   (COURIER)  → { deliveries: [...] }
PUT  ${BASE}/api/courier/deliveries/:id/status  (COURIER)  { status: "SHIPPED" | "DELIVERED" }
```
**UI:** саҳифаи вуруд/сабти курер; панели курер бо рӯйхати расонишҳо ва тугмаҳои «Гирифтам»→«Супоридам». Дар фармоиши фурӯшанда — интихоби курер.

## 19. 📣 Канали худкори Telegram
Ҳангоми flash sale ё таблиғи нав, бот худкор ба канали оммавӣ пост мекунад (env `TELEGRAM_CHANNEL_ID`). **Кори frontend нест** — фақат каналро дар сайт таблиғ кун («Ба канали мо ҳамроҳ шавед»).

## 20. 🎬 Лентаи видео (TikTok-style)
```
GET    ${BASE}/api/videos/feed              (public)  → { feed: [{ url, product }] }
GET    ${BASE}/api/products/:id/videos       (public)
POST   ${BASE}/api/products/:id/videos       (SELLER)  multipart "video" (mp4/mov/webm, ≤50MB)
DELETE ${BASE}/api/products/:id/videos/:videoId  (SELLER)
```
**UI:** саҳифаи `/reels` — лентаи амудии full-screen (swipe боло/поён), ҳар видео бо корти мол + тугмаи «Ба сабад». Дар форми мол — боркунии видео.

## 21. ⬆️ Импорти молҳо аз CSV
Ниг. №8 (`POST /api/seller/import/products`).

## 22. 🕐 Харитаи гармии фурӯш
```
GET ${BASE}/api/analytics/heatmap  (SELLER)  → { dayLabels[7], counts[7][24], revenue[7][24], peak }
```
`counts[рӯз][соат]` = шумораи фармоишҳо. `dayLabels[0]`=Якшанбе.
**UI:** дар аналитика ҷадвали 7×24 heatmap (ранги пурратар = фаъолтар) + «Вақти авҷ: {peak}».

---

### Хулосаи даста-2 — чӣ илова кунӣ
- Checkout: интихоби **насия**, **худгирӣ**, ҷадвали оптом.
- Саҳифаи мол: **таърихи нарх**, **маҷмӯаҳо**, **оптом**, **видео**, тугмаи «🔔 хабар деҳ».
- Саҳифаи мағоза: **пайгирӣ** + онлайн 🟢.
- Саҳифаҳои нав: `/reels` (видео), `/registry` (тӯёна), `/tg` (Telegram Mini App), панели **курер**.
- Панели фурӯшанда: экспорт/импорти CSV, QR, муҳаррири оптом, `minAcceptablePrice`, ҷавоби AI, heatmap, тарҷума.
- Ҷустуҷӯ: 📷 бо расм; 🔥 тренд дар асосӣ.

Огоҳиҳои нав: `BACK_IN_STOCK`, `NEW_PRODUCT`, `FLASH_SALE`, `OFFER_AUTO_ACCEPTED`, `COURIER_ASSIGNED` — ҳама ба ҳамон зангӯла.
