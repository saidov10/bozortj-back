# 🆕 Промт — 12 функсияи нав (музояда, насия, кафолат, сабадҳои номдор ва ғ.)

> Frontend аллакай ҳаст ва ба backend пайваст аст. **Аз нав насоз** — танҳо ин функсияҳои навро ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, `lib/socket.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

`BASE = https://bozortj-back.onrender.com`. Расмҳо: `${BASE}{url}`. Токен: `Authorization: Bearer <token>`. Socket ҳамон аст.

Backend 12 функсияи нав гирифт:
**(2)** мушовири андозаи AI, **(3)** такрори фармоиш, **(4)** сабадҳои номдор, **(6)** бекоркунии фармоиш аз тарафи харидор, **(8)** овоздиҳӣ ба тақризҳо, **(10)** кафолатнома, **(12)** музояда, **(15)** реҷаи таътил, **(16)** мушовири нархи AI, **(17)** ороиши витрина, **(19)** паёми овозӣ, **(20)** слотҳои вақти расониш.

---

## 2. 📏 Мушовири андозаи AI
```
POST ${BASE}/api/assistant/size-advice   (public)
     { productId, heightCm?, weightKg?, notes? }
→ { advice: "Барои шумо андозаи L мувофиқ аст, чунки...", availableSizes: ["M","L","XL"] }
```
**UI:** дар саҳифаи моли либос/пойафзол тугмаи «📏 Кадом андоза ба ман?» → модал: қад/вазн/шарҳ → ҷавоби AI.

## 3. 🔁 Такрори фармоиш (Reorder)
```
POST ${BASE}/api/orders/:id/reorder   (BUYER)
→ { addedCount, skipped: ["Номи моли тамомшуда"] }
```
Ҳамаи молҳои фармоиши кӯҳна ба сабад бармегарданд (молҳои тамомшуда партофта мешаванд).
**UI:** дар ҳар фармоиши кӯҳна тугмаи «🔁 Боз ҳамин» → баъд ба сабад бирав. Агар `skipped` бошад, тоуст нишон деҳ.

## 4. 📝 Сабадҳои номдор (Shopping Lists)
```
GET    ${BASE}/api/shopping-lists                    (BUYER)  → { lists: [{ id, name, items[] }] }
POST   ${BASE}/api/shopping-lists                    (BUYER)  { name }
DELETE ${BASE}/api/shopping-lists/:id                (BUYER)
POST   ${BASE}/api/shopping-lists/:id/items          (BUYER)  { variantId, quantity? }
DELETE ${BASE}/api/shopping-lists/:id/items/:itemId  (BUYER)
POST   ${BASE}/api/shopping-lists/:id/move-to-cart   (BUYER)  → { addedCount, skipped }
```
Айтемҳо ба **variantId** ишора мекунанд (мисли сабад).
**UI:** саҳифаи «Рӯйхатҳои ман» — сохтани рӯйхат («барои тӯй», «мактаб»), илова/ҳазфи молҳо, тугмаи «Ба сабад кӯчонидан». Дар саҳифаи мол тугмаи «＋ Ба рӯйхат».

## 6. ❌ Бекоркунии фармоиш (харидор)
```
POST ${BASE}/api/orders/:id/cancel   (BUYER)   { reason? }
```
Танҳо то статуси **PENDING** (пеш аз омодасозӣ). Захира барқарор мешавад, фурӯшанда огоҳӣ мегирад.
**UI:** дар фармоиши PENDING тугмаи «Бекор кардани фармоиш» + майдони сабаб. Баъди PROCESSING тугма ғайрифаъол.

## 8. 👍 Овоздиҳӣ ба тақризҳо
```
POST ${BASE}/api/products/reviews/:reviewId/helpful   (BUYER)
→ { voted: true|false, helpfulCount }
```
Toggle аст (бори дуюм → овоз бардошта мешавад). Тақризҳо дар саҳифаи мол акнун аз рӯи `helpfulCount` тартиб дода мешаванд ва ҳар тақриз `helpfulCount` дорад.
**UI:** зери ҳар тақриз «👍 Фоиданок ({helpfulCount})» — клик toggle мекунад.

## 10. 🛡 Кафолатнома (Warranty)
Фурӯшанда ҳангоми сохтан/навсозии мол:
```
POST/PUT ${BASE}/api/products[/:id]  (SELLER)  ... + warrantyMonths: 12
```
Дар ҷавоби мол майдони `warrantyMonths` ҳаст. Кафолатҳои фаъоли харидор:
```
GET ${BASE}/api/orders/warranties   (BUYER)
→ { warranties: [{ productName, image, warrantyMonths, startDate, expiryDate, daysLeft, active }] }
```
**UI:** дар форми мол майдони «Кафолат (моҳ)». Дар саҳифаи мол нишони «🛡 Кафолат 12 моҳ». Саҳифаи «Кафолатҳои ман» бо `expiryDate` ва огоҳии «≤30 рӯз монд».

## 12. 🔨 Музояда (Auction)
```
GET  ${BASE}/api/auctions             (public)  → { auctions: [...] }   // фаъол
GET  ${BASE}/api/auctions/:id          (public)  → { auction, bids: [{ amount, at, bidder }] }
GET  ${BASE}/api/auctions/mine         (SELLER)
POST ${BASE}/api/auctions              (SELLER)  { productId, startPrice, endsAt, bidIncrement? }
POST ${BASE}/api/auctions/:id/bid      (BUYER)   { amount }
```
`auction` = `{ currentPrice, bidIncrement, endsAt, secondsRemaining, currentBidder, isActive, product{...} }`.
Пешниҳоди нав бояд >= `currentPrice + bidIncrement` бошад (пешниҳоди аввал = `startPrice`).
**Socket:** `auction_update { auctionId, productId, currentPrice, currentBidderId, status }` — нархро live навсозӣ кун. Огоҳиҳо: `OUTBID` (пешӣ гирифтанд), `AUCTION_WON` (бо коди купон), `AUCTION_SOLD`.
Ғолиб коди купон мегирад ва бо нархи бурда мехарад.
**UI:** саҳифаи `/auctions` (рӯйхат бо таймер) + `/auctions/:id` (таймери live, нархи ҷорӣ, майдони пешниҳод, таърихи биддҳо). Дар панели фурӯшанда — сохтани музояда.

## 15. 🌴 Реҷаи таътил (фурӯшанда)
```
PUT ${BASE}/api/shops/settings/auto-reply  (SELLER)
    { vacationMode: true, vacationMessage: "То 15-ум дар таътилам", vacationUntil: "2026-08-15" }
```
Ҳангоми таътил: молҳои мағоза харида **намешаванд** (checkout хато медиҳад), чат бо паёми таътил ҷавоби худкор медиҳад.
**UI:** дар танзимоти мағоза свитчи «Реҷаи таътил» + матн + сана. Дар саҳифаи мағоза баннери «🌴 Дар таътил то ...».

## 16. 💡 Мушовири нархи AI (фурӯшанда)
```
POST ${BASE}/api/assistant/price-advice   (SELLER)   { name?, categoryId?, brandId? }
→ { count, min, max, avg, median, suggestedRange: { low, high }, message }
```
Аз рӯи молҳои монанди дар платформа буда таҳлил мекунад.
**UI:** дар форми гузоштани мол тугмаи «💡 Нархи тавсияшаванда» → нишондоди `suggestedRange` ва `message`.

## 17. 🎨 Ороиши витрина (фурӯшанда)
```
PUT ${BASE}/api/shops/settings/auto-reply  (SELLER)
    { brandColor: "#0A7E3D", aboutText: "...", featuredProductIds: "id1,id2,id3" }
PUT ${BASE}/api/shops/settings/banner       (SELLER)  multipart "banner" (расм)  → { bannerUrl }
```
Дар ҷавоби `GET /api/shops/:id`: `bannerUrl`, `brandColor`, `aboutText`, `featuredProductIds[]`.
**UI:** дар панели фурӯшанда «Ороиши мағоза» — боркунии баннер, интихоби ранг, матни «Дар бораи мо», интихоби молҳои витрина. Дар саҳифаи мағоза инҳоро истифода бар (баннер боло, ранги брендӣ, блоки «Дар бораи мо», молҳои интихобшуда аввал).

## 19. 🎤 Паёми овозӣ (ҷустуҷӯ/чат)
```
POST ${BASE}/api/assistant/voice   (public)  multipart "audio" (m4a/mp3/webm/ogg/wav)
→ { transcript, reply, products: [...] }
```
Backend овозро матн мекунад (Whisper) ва ассистентро иҷро мекунад.
**UI:** дар ҷустуҷӯ/чати AI тугмаи 🎤 → сабти овоз → фиристодан → нишон додани `transcript` + натиҷаҳо.

## 20. 🕐 Слотҳои вақти расониш
```
POST ${BASE}/api/orders  (BUYER)  { addressId, deliverySlot: "2026-08-02|18:00-21:00", ... }
```
`deliverySlot` матни озод (то 60 ҳарф). Дар ҷавоби фармоиш ва панели курер намоён.
**UI:** дар checkout интихоби вақт (имрӯз/фардо + бозаи соатҳо), сатрро ҳамчун `deliverySlot` фирист.

---

### Хулоса — саҳифаҳо ва ҷойҳо
- **Checkout:** слоти вақт (№20).
- **Саҳифаи фармоиш:** бекоркунӣ (№6), такрор (№3).
- **Саҳифаи мол:** мушовири андоза (№2), овоздиҳӣ ба тақриз (№8), нишони кафолат (№10), «＋ Ба рӯйхат» (№4).
- **Саҳифаҳои нав:** `/auctions` + `/auctions/:id` (№12), «Рӯйхатҳои ман» (№4), «Кафолатҳои ман» (№10).
- **Саҳифаи мағоза:** баннер/ранг/дар бораи мо (№17), баннери таътил (№15).
- **Панели фурӯшанда:** сохтани музояда (№12), реҷаи таътил (№15), мушовири нарх (№16), ороиши витрина (№17), майдони кафолат (№10).
- **Ҷустуҷӯ/AI:** паёми овозӣ 🎤 (№19).

Огоҳиҳои нав: `OUTBID`, `AUCTION_WON`, `AUCTION_SOLD`, `ORDER_CANCELLED` — ба ҳамон зангӯла. Socket event нав: `auction_update`.
