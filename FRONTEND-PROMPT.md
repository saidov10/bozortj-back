# Frontend prompt — 8 функсияи нав (Bozor TJ)

Ин ҳуҷҷат барои амалӣ кардани **8 функсияи нав** дар frontend аст. Backend аллакай тайёр
ва деплой шудааст. Ҳама endpointҳо зери `https://<API_BASE>/api/...` кор мекунанд.

**Асосҳо**
- Auth: header `Authorization: Bearer <JWT>` (ҳамон login-и мавҷуда).
- Нақшҳо: `BUYER`, `SELLER`, `ADMIN`.
- Socket.io: ҳамон пайвасти мавҷуда (`io(API_BASE, { auth: { token } })`). Рӯйдодҳои нав: `live_update`.
- Хатоҳо: `{ message: string }` бо коди статуси мувофиқ.
- Нархҳо бо **сомонӣ**.

> Эзоҳ: аз ин 8 функсия, **№6 (Таърихи нарх)** ва **№7 (Муқоисаи маҳсулот)** аллакай
> дар backend буданд — танҳо UI-ро васл кунед (endpointҳо дар охир). №1, 5, 8, 10, 11, 20 нав.

---

## 1) Иҷора (Rental) — `/api/rentals`

Маҳсулотро бо нархи рӯзона, гарав ва тақвими банд-будан иҷора медиҳанд (тӯйҳо, асбобҳо, техника).

**Seller — танзими иҷора барои маҳсулот**
`PUT /api/rentals/products/:productId/settings` (SELLER)
```json
{ "isRentable": true, "rentalDailyPrice": 150, "rentalDeposit": 500 }
```
UI: дар саҳифаи таҳрири маҳсулот toggle «Иҷора» + майдонҳои нархи рӯзона ва гарав.

**Public — тақвими дастрасӣ**
`GET /api/rentals/products/:productId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
→ `{ isRentable, rentalDailyPrice, rentalDeposit, bookedRanges: [{startDate,endDate}], available: true|false|null }`
UI: календар; рӯзҳои `bookedRanges`-ро ғайрифаъол (disabled) кунед. Вақте `from`/`to` дода шуд,
`available` нишон медиҳад, ки он бозор холӣ аст ё не.

**Buyer — брон кардан**
`POST /api/rentals` (BUYER) → `{ productId, startDate, endDate, note? }`
- `days` ва `totalPrice`-ро backend худаш ҳисоб мекунад (`days × dailyPrice`; гарав алоҳида).
- Агар сана банд бошад → `409` «Ин сана банд аст».

**Buyer** — `GET /api/rentals/mine` → бронҳои ман.
**Seller** — `GET /api/rentals/shop` → бронҳо барои молҳои ман.
**Seller** — `PATCH /api/rentals/:id/status` → `{ status: "CONFIRMED" | "ACTIVE" | "RETURNED" | "CANCELLED" }`.
**Buyer** — `PATCH /api/rentals/:id/cancel` (танҳо PENDING/CONFIRMED).

Статусҳо: `PENDING → CONFIRMED → ACTIVE → RETURNED` (ё `CANCELLED`). Харидор дар ҳар қадам
notification мегирад.

---

## 5) Live-фурӯш (Live shopping) — `/api/live` + socket

Фурӯшанда стрим мекунад ва молҳоро бо **нархи махсуси LIVE** мефурӯшад. Вақте стрим `LIVE`
аст, нархи live ҳамчун тахфифи воқеӣ ба маҳсулот татбиқ мешавад — яъне ҳангоми checkout
харидор ҳамон нархи арзонро мепардозад. Баъди анҷом нархи аслӣ барқарор мешавад.

**Seller**
- `POST /api/live` → `{ title, scheduledAt? }` → сохтани стрим (`SCHEDULED`).
- `POST /api/live/:id/items` → `{ productId, livePrice }` (livePrice < нархи оддӣ).
- `DELETE /api/live/:id/items/:itemId`.
- `PATCH /api/live/:id/start` → стрим `LIVE`, тахфифҳо фаъол, followerҳо огоҳ мешаванд.
- `PATCH /api/live/:id/feature` → `{ productId }` — моли ҷориро дар экран «пин» мекунад.
- `PATCH /api/live/:id/end` → стрим `ENDED`, нархҳо барқарор.
- `GET /api/live/mine`.

**Public**
- `GET /api/live` → стримҳои `LIVE` + `SCHEDULED` (LIVE аввал).
- `GET /api/live/:id` → стрим бо `items[]` (ҳар item: `livePrice`, `effectivePrice`, `savings`, `isFeatured`, `product`).

**Socket** — рӯйдоди `live_update`:
```ts
{ streamId, status, event: "STARTED"|"ENDED"|"FEATURE"|"ITEMS", featuredProductId?, livePrice? }
```
UI: саҳифаи Live (лентаи стримҳо + экрани стрим). Ҳангоми `FEATURE` корти моли пин-шударо
нав кунед; ҳангоми `STARTED/ENDED` статусро нав кунед. Тугмаи «Ҳозир харед» → ба cart илова
(нархи live аллакай татбиқ шудааст). Видео-стрим худро аз провайдери дилхоҳ (масалан HLS ё
берунӣ) гузоред — backend танҳо мол ва нархро идора мекунад.

---

## 6) Таърихи нарх (Price history) — аллакай тайёр

`GET /api/products/:id/price-history` → `{ history: [{ price, createdAt }] }`
UI: дар саҳифаи маҳсулот графики хатӣ (6 моҳ). Барои «тахфиф воқеист ё не» — нархи ҷориро
бо ҳадди ақали таърих муқоиса кунед.

---

## 7) Муқоисаи маҳсулот (Compare) — аллакай тайёр

`GET /api/products/discovery/compare?ids=a,b,c` (2–4 id)
→ `{ attributeKeys: string[], products: [...] }`
UI: ҷадвали паҳлӯ-ба-паҳлӯ. `attributeKeys` — маҷмӯи ҳамаи хусусиятҳо (як сатр барои ҳар
хусусият, ҳатто агар яке молро надошта бошад). Тугмаи «Муқоиса» дар корти маҳсулот →
интихоби то 4 мол.

---

## 8) Нуқтаҳои гирифтан (Pickup points / ПВЗ) — `/api/pickup-points`

Шабакаи нуқтаҳо: харидор ба ҷои курьер молро дар нуқтаи қулай мегирад (арзонтар — бе ҳаққи расонидан).

**Public**
- `GET /api/pickup-points?city=Душанбе` → нуқтаҳои фаъол.
- `GET /api/pickup-points/cities` → `{ cities: [...] }`.

**Admin** — `GET /api/pickup-points/all`, `POST /`, `PUT /:id`, `DELETE /:id` (soft-deactivate).
Майдонҳо: `name, city, address, landmark?, phone?, workingHours?, lat?, lng?, isActive`.

**Checkout (интеграция)**: ҳангоми фармоиш `POST /api/orders` акнун қабул мекунад:
```json
{ "deliveryType": "PICKUP_POINT", "pickupPointId": "<id>" }
```
`deliveryType` метавонад `DELIVERY` | `PICKUP` | `PICKUP_POINT` бошад. Барои `PICKUP_POINT`
ҳаққи расонидан **0** аст ва `addressId` лозим нест. UI: дар қадами интихоби расонидан варианти
сеюм «Нуқтаи гирифтан» + рӯйхати нуқтаҳо (бо шаҳр филтр). Дар order-detail нуқтаро нишон диҳед.

---

## 10) Аукциони баръакс (Reverse auction) — `/api/buyer-requests`

Харидор менависад «ин чизро мехоҳам, буҷаам 500 сомонӣ», фурӯшандагон пешниҳод (proposal)
мефиристанд ва рақобат мекунанд.

**Buyer**
- `POST /api/buyer-requests` → `{ title, description, budget, categoryId?, expiresInDays? }` (default 7 рӯз).
- `GET /api/buyer-requests/mine` → дархостҳои ман бо **ҳамаи** proposalҳо (мураттаб аз рӯи нарх).
- `POST /api/buyer-requests/:id/accept/:proposalId` → қабули пешниҳод (боқӣ рад мешаванд).
- `PATCH /api/buyer-requests/:id/close` → бастани дархост.

**Public / Seller**
- `GET /api/buyer-requests?status=OPEN&categoryId=` → дархостҳои кушода (барои фурӯшандагон).
- `GET /api/buyer-requests/:id` → детал. **Танҳо соҳиб** ҳамаи proposalҳоро мебинад; дигарон
  танҳо `proposalCount` (нархи рақибон пинҳон).

**Seller**
- `POST /api/buyer-requests/:id/proposals` → `{ price, message?, productId? }` (як proposal барои ҳар мағоза; upsert).
- `GET /api/buyer-requests/proposals/mine` → пешниҳодҳои ман бо ҳолаташон.

UI: ду намуд — (а) харидор: форми «Дархост» + рӯйхати proposalҳо бо нарх/мағоза, тугмаи «Қабул»;
(б) фурӯшанда: лентаи дархостҳои кушода + форми «Пешниҳод». Notificationҳо: proposalи нав,
қабул/рад.

---

## 11) Фармоиши пешакӣ (Pre-order) — `/api/preorders`

Моли ҳанӯз наомадаро эълон мекунанд; харидорон пешакӣ брон мекунанд — фурӯшанда талаботро мебинад.

**Seller**
- `PUT /api/preorders/products/:productId/settings` → `{ isPreorder, preorderReleaseDate?, preorderLimit? }`.
- `GET /api/preorders/shop` → `{ preorders[], demand: [{ productId, name, totalUnits, reservations }] }`.
- `POST /api/preorders/products/:productId/release` → `{ stockQuantity? }` — молро дастрас мекунад
  ва **ҳамаи** бронкунандагонро огоҳ мекунад.

**Buyer**
- `POST /api/preorders` → `{ productId, quantity? }` (як брон барои ҳар мол; агар `preorderLimit` пур бошад → `409`).
- `GET /api/preorders/mine`.
- `DELETE /api/preorders/:id` → бекор.

UI: дар маҳсулоти `isPreorder` тугмаи «Пешакӣ фармоиш» (ба ҷои «Ба сабад»), санаи тахминии
омадан + шумораи бронҳо. Барои фурӯшанда — панели талабот (demand). Ҳангоми release харидор
notification «Моли пешфармоишкардаатон омад» мегирад.

---

## 20) AI-ёрдамчии хариди пурра (Shopping plan) — `/api/assistant`

Харидор менависад «тӯй дорам, 2000 сомонӣ буҷа, 50 меҳмон» — AI рӯйхати пурраи харид месозад
ва ҳар бандро ба моли воқеии база мувофиқ мекунад.

`POST /api/assistant/shopping-plan` (public; барои сабт — `Authorization` + нақши BUYER)
```json
{ "message": "тӯй дорам, буҷа 2000 сомонӣ, 50 меҳмон", "save": true, "listName": "Тӯй" }
```
Ҷавоб:
```json
{
  "summary": "...",
  "budget": 2000,
  "totalEstimated": 1840.5,
  "withinBudget": true,
  "items": [
    { "label": "Костюми домод", "quantity": 1, "note": "...",
      "product": { "id", "name", "effectivePrice", "image", "shopName", ... },
      "lineTotal": 650 }
  ],
  "savedListId": "..."   // агар save=true ва BUYER бошад
}
```
UI: экрани чат/форм — матн ё овоз ворид кунед → нақшаро ҳамчун рӯйхати кортҳо нишон диҳед
(нархи ҳар банд, ҷамъи умумӣ vs буҷа). Тугмаҳо: «Ҳамаро ба сабад» (агар `save` → рӯйхати
номдор эҷод мешавад, баъд `POST /api/shopping-lists/:id/move-to-cart`), ё илова кардани
бандҳои алоҳида. Агар `product: null` бошад — «моли мувофиқ ёфт нашуд» нишон диҳед.

> Талабот: сервер бояд `GROQ_API_KEY` дошта бошад, вагарна `503`.

---

### Ҷамъбасти endpointҳои нав
| Функсия | Prefix |
|---|---|
| Иҷора | `/api/rentals` |
| Live-фурӯш | `/api/live` (+ socket `live_update`) |
| Нуқтаҳои гирифтан | `/api/pickup-points` (+ `deliveryType=PICKUP_POINT` дар `/api/orders`) |
| Аукциони баръакс | `/api/buyer-requests` |
| Фармоиши пешакӣ | `/api/preorders` |
| AI хариди пурра | `POST /api/assistant/shopping-plan` |
| Таърихи нарх (мавҷуд) | `GET /api/products/:id/price-history` |
| Муқоиса (мавҷуд) | `GET /api/products/discovery/compare?ids=` |
