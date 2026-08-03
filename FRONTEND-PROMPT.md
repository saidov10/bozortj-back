# Frontend prompt — 3 функсияи нав (Bozor TJ)

Ин ҳуҷҷат барои амалӣ кардани **3 функсияи нав** дар frontend аст. Backend аллакай тайёр
ва деплой шудааст. Ҳама endpointҳо зери `https://<API_BASE>/api/...`.

**Асосҳо**
- Auth: `Authorization: Bearer <JWT>`. Нақшҳо: `BUYER`, `SELLER`.
- Хатоҳо: `{ message }` бо коди статус. Нархҳо бо **сомонӣ**.
- Огоҳиҳо (№8, №10) тавассути системаи notification-и мавҷуда меоянд (in-app + Telegram + Web Push).

Функсияҳо: **8** Ҷустуҷӯи захирашуда + огоҳӣ · **9** Лентаи «Барои шумо» · **10** Story-и мағоза (24 соат).

---

## 8) Ҷустуҷӯи захирашуда + огоҳӣ — `/api/saved-searches` (BUYER)

Харидор ҷустуҷӯро бо филтрҳо захира мекунад; вақте моли нави мувофиқ пайдо шуд, огоҳӣ мегирад
(«iPhone 13 то 4000 сомонӣ пайдо шуд»).

**Захира кардан**
`POST /api/saved-searches`
```json
{ "name": "iPhone арзон", "query": "iphone 13", "categoryId": null, "brandId": null,
  "minPrice": null, "maxPrice": 4000, "notifyOnNew": true }
```
→ `201 { savedSearch, matchCount }` — `matchCount` = ҳозир чанд мол мувофиқ аст.
- Ҳадди ақал як меъёр лозим (`query` ё `categoryId`/`brandId`/`colorId`/нарх).

**Рӯйхат** — `GET /api/saved-searches` → `{ savedSearches: [{ ...поля, matchCount }] }`.
**Натиҷаи ҷустуҷӯ ҳозир** — `GET /api/saved-searches/:id/results` → `{ products: [...] }` (то 40 мол).
**Танзим/тағйир** — `PATCH /api/saved-searches/:id` → `{ name?, notifyOnNew? }` (огоҳиро хомӯш/фаъол).
**Нест кардан** — `DELETE /api/saved-searches/:id`.

**Огоҳӣ:** вақте фурӯшанда моли мувофиқ мегузорад, харидор notification мегирад бо
`meta: { type: "SAVED_SEARCH_MATCH", productId, savedSearchId }` — ба саҳифаи мол deep-link кунед.

**UI:** дар саҳифаи ҷустуҷӯ/натиҷаҳо тугмаи «🔔 Ин ҷустуҷӯро захира кун». Дар профил бахши
«Ҷустуҷӯҳои ман» бо `matchCount` ва toggle-и огоҳӣ.

---

## 9) Лентаи «Барои шумо» — `GET /api/products/discovery/for-you` (BUYER)

Тавсияи шахсӣ аз рӯи рафтори худи харидор (молҳои дидашуда, wishlist, харидҳо). Категория/бренди
дӯстдоштаро вазн мекунад, тахфиф ва мавҷудиро бартарӣ медиҳад.

Ҷавоб:
```json
{ "products": [ { ...product, averageRating, reviewCount } ], "personalized": true }
```
- `personalized: false` → харидор ҳанӯз таърих надорад (cold-start), молҳои нав нишон дода шуданд.
- Формати `products` ҳамон формати оддии рӯйхати мол (кортҳоро мисли ҳамеша render кунед).

**UI:** дар саҳифаи асосӣ блоки «✨ Барои шумо» (карусель ё грид). Агар `personalized: false`,
метавонед сарлавҳаро «Молҳои нав» кунед.

---

## 10) Story-и мағоза (24 соат) — `/api/stories`

Фурӯшанда акс/видеои кӯтоҳ мегузорад, ки баъди **24 соат** худкор нопадид мешавад (мисли Instagram).
Метавонад ба мол линк дошта бошад (tap-to-shop).

**Фурӯшанда — гузоштан** (`multipart/form-data`)
`POST /api/stories` — майдони файл **`story`** (акс: jpg/png/webp ё видео: mp4/mov/webm, то 30MB)
+ `caption?`, `productId?` (линк ба моли худи мағоза).
→ `201 { story: { id, mediaUrl, mediaType: "IMAGE"|"VIDEO", caption, productId, expiresAt } }`

**Фурӯшанда** — `GET /api/stories/mine` (бо `isActive`), `DELETE /api/stories/:id`.

**Public — лентаи Story (tray)**
`GET /api/stories` →
```json
{ "trays": [
  { "shopId", "shopName", "bannerUrl", "brandColor", "latestAt",
    "stories": [ { "id", "mediaUrl", "mediaType", "caption", "productId", "viewCount", "expiresAt" } ] }
] }
```
- Як tray барои ҳар мағоза (мағозаи навтарин аввал) — мисли қатори доирачаҳои Story дар боло.

**Public** — `GET /api/stories/shop/:shopId` → Story-ҳои фаъоли як мағоза.
**Public** — `POST /api/stories/:id/view` → ҳисоби намоиш (ҳангоми кушодани ҳар story занг занед).

**UI:**
- Дар саҳифаи асосӣ/мағоза қатори доирачаҳои Story (аватар/баннери мағоза, ҳошия бо `brandColor`).
- Кушодан → намоишгари пурраэкран (акс/видео), progress-bar, худкор гузаштан ба story-и оянда.
- `mediaType === "VIDEO"` → `<video autoplay muted playsinline>`; вагарна `<img>`.
- Агар `productId` бошад → тугмаи «🛍️ Харидан» → саҳифаи мол.
- Ҳангоми намоиш `POST /:id/view` фиристед. `mediaUrl` нисбӣ аст (`/uploads/...`) — бо `API_BASE` префикс кунед.

---

### Ҷамъбаст
| Функсия | Endpoint | Нақш |
|---|---|---|
| Ҷустуҷӯи захирашуда | `GET/POST/PATCH/DELETE /api/saved-searches`, `/:id/results` | BUYER |
| Лентаи «Барои шумо» | `GET /api/products/discovery/for-you` | BUYER |
| Story-и мағоза | `GET /api/stories`, `/shop/:shopId`, `/mine`; `POST /api/stories`, `/:id/view`; `DELETE /:id` | SELLER/public |

> Эзоҳ: промти пешинаи пайгирии курьер иваз шуд — он функсия аллакай дар backend деплой шудааст.
