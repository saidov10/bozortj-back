# 🆕 Промт — ТАНҲО функсияҳои нав (5 фичаи нав)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **5 функсияи навро** ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, `lib/socket.ts`, store, types, роутинг) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend навсозӣ шуд. 5 фичаи нав илова шуд: **(1) Боти Telegram барои огоҳиномаҳо**, **(2) Савдо кардан — пешниҳоди нарх**, **(3) Нишонҳои эътимоди фурӯшанда**, **(4) Пардохти онлайн**, **(5) Web Push (PWA)**.

`BASE = https://bozortj-back.onrender.com`. Расмҳо: `${BASE}/uploads/{image}`. Токен: `Authorization: Bearer <token>`.

Ду фичаи калидӣ (**Telegram** ва **Web Push**) ба системаи **notification**-и мавҷуда пайванданд: ҳар огоҳиномае ки backend месозад (фармоиши нав, тағйири ҳолат, пешниҳоди нарх, пардохт...) акнун худкор ҳам ба Telegram ва ҳам ба Web Push мефиристад. Пас барои онҳо танҳо як бор «пайваст кардан» лозим аст.

---

## 1. 📱 Боти Telegram — огоҳиномаҳо дар ҷое ки одамон ҳастанд

Дар Тоҷикистон ҳама дар Telegram-анд. Корбар як бор ҳисоби худро ба боти расмӣ пайваст мекунад → баъд ҳамаи огоҳиномаҳо (харидор: «Фармоишат фиристода шуд», фурӯшанда: «🛎️ Фармоиши нав!») фавран ба Telegram мерасанд — ҳатто вақте сайт пӯшида ва Render хоб аст.

```
GET    ${BASE}/api/telegram/status   (токен)  → { configured, linked }
GET    ${BASE}/api/telegram/link     (токен)  → { configured, code, url, botUsername }
DELETE ${BASE}/api/telegram/link     (токен)  → { message }
```

**Ҷараён:**
1. Дар профил (ё танзимот) блоки «Огоҳиномаҳои Telegram». Аввал `GET /status`-ро зан.
2. Агар `configured: false` — блокро тамоман пинҳон кун (бот дар сервер танзим нашуда).
3. Агар `linked: false` — тугмаи **«Пайваст ба Telegram»**. Ҳангоми клик `GET /link`-ро зан → корбарро ба `url` бар (`window.open(url)` — ин `https://t.me/<bot>?start=<code>` аст, Telegram-ро мекушояд, корбар «Start»-ро мезанад). Баъд ҳар чанд сония `GET /status`-ро аз нав зан (poll) то `linked: true` шавад → «Пайваст шуд ✅».
4. Агар `linked: true` — «✅ Пайваст аст» + тугмаи **«Ҷудо кардан»** (`DELETE /link`).

**UI:** содда — як тугма ва ҳолат. Дизайни сабз/хокистарӣ барои пайваст/ҷудо.

---

## 2. 🤝 Савдо кардан (Price Bargaining) — фичаи имзоӣ

Дар бозори воқеии тоҷикӣ ҳама савдо мекунанд. Харидор нархашро пешниҳод мекунад → фурӯшанда **қабул / рад / нархи ҷавобӣ** медиҳад. Агар қабул шавад — backend худкор **купони яккаса** месозад (ба ҳамон харидор баста, `DEAL-XXXXXX`), ки харидор дар харид истифода мебарад ва бо нархи мувофиқашуда мехарад.

### Харидор
```
POST ${BASE}/api/offers               (BUYER)
  Body: { "productId", "offeredPrice", "message"? }
  (offeredPrice бояд аз нархи ҷорӣ камтар бошад; барои ҳар мол як пешниҳоди фаъол)
GET  ${BASE}/api/offers/mine          (BUYER)  → { offers: [Offer] }
POST ${BASE}/api/offers/:id/accept-counter  (BUYER)  → { couponCode }
      (қабули нархи ҷавобии фурӯшанда → купон сохта мешавад)
```

### Фурӯшанда
```
GET  ${BASE}/api/offers/received      (SELLER) → { offers: [Offer] }
POST ${BASE}/api/offers/:id/accept    (SELLER) → { couponCode }
POST ${BASE}/api/offers/:id/reject    (SELLER)
POST ${BASE}/api/offers/:id/counter   (SELLER)
      Body: { "counterPrice", "message"? }
      (counterPrice бояд байни offeredPrice ва нархи ҷорӣ бошад)
```

`Offer`:
```json
{
  "id": "uuid", "productId": "uuid",
  "offeredPrice": 900, "counterPrice": 1100, "agreedPrice": 900,
  "status": "PENDING",           // PENDING | COUNTERED | ACCEPTED | REJECTED | EXPIRED
  "message": "...", "couponCode": "DEAL-AB12CD",
  "createdAt": "...", "respondedAt": "...", "expiresAt": "...", "isExpired": false,
  "product": { "id","name","price","discountPrice","isOnDiscount","image","shopName","shopId" },
  "buyer": { "id","name","avatarUrl" }
}
```

**Пас аз қабул:** `couponCode`-ро ба харидор нишон деҳ ва бигӯ «Дар харид ин кодро истифода бар». Ин ҳамон майдони купони мавҷуда дар checkout аст (`couponCode` дар `POST /api/orders`). Купон яккаса (`maxUsage: 1`), танҳо барои ҳамон харидор ва то `expiresAt` эътибор дорад.

**UI:**
- Дар **саҳифаи мол** (барои харидори воридшуда) тугмаи **«🤝 Нарх пешниҳод кун»** → модал бо майдони нарх (+паём ихтиёрӣ). Агар аллакай пешниҳоди фаъол бошад (`409`) — «Шумо аллакай пешниҳод доред».
- Саҳифаи харидор **«Пешниҳодҳои ман»** (`/offers`): рӯйхат бо ҳолат. Агар `COUNTERED` — тугмаи «Қабули {counterPrice} с.» (`accept-counter`). Агар `ACCEPTED` — `couponCode` + тугмаи «Ба харид гузар».
- Панели **фурӯшанда → «Пешниҳодҳо»**: рӯйхати `received` бо тугмаҳои **Қабул / Рад / Нархи ҷавобӣ**. Нархи ҷавобӣ — майдончаи хурди нарх.
- Огоҳиномаҳо тавассути socket меоянд (ниг. поён) — рӯйхатро аз нав бор кун.

---

## 3. 🏅 Нишонҳои эътимоди фурӯшанда (Trust Badges)

Аз маълумоти мавҷуда (тақризҳо, фармоишҳои расонидашуда, суръати ҷавоб дар чат) backend худкор нишонҳо ҳисоб мекунад. Эътимод = фурӯш барои харидоре ки аз фиреб метарсад.

```
GET ${BASE}/api/shops/:id/badges   (public)
```
Ҷавоб:
```json
{
  "shopId": "uuid",
  "stats": {
    "reviewCount": 12, "avgRating": 4.7, "deliveredOrders": 34,
    "sellerReplyRate": 0.6, "avgResponseMinutes": 25
  },
  "badges": [
    { "id": "trusted",   "label": "Фурӯшандаи боэътимод",     "icon": "⭐", "description": "Баҳои миёна 4.7 аз 12 тақриз" },
    { "id": "proven",    "label": "Фурӯшандаи фаъол",          "icon": "📦", "description": "34 фармоиши расонидашуда" },
    { "id": "fast-reply","label": "Зуд ҷавоб медиҳад",          "icon": "💬", "description": "Ба ҳисоби миёна дар 25 дақиқа" },
    { "id": "engaged",   "label": "Ба тақризҳо ҷавоб медиҳад", "icon": "🗣️", "description": "..." }
  ]
}
```

**UI:** дар **саҳифаи мағоза** ва **саҳифаи мол** (назди номи фурӯшанда) нишонҳоро ҳамчун чипҳои хурд (icon + label) нишон деҳ. Ҳангоми hover/клик — `description`. Агар `badges` холӣ бошад — чизе нишон надеҳ. Ин занг арзон аст (backend 5 дақиқа кеш мекунад).

---

## 4. 💳 Пардохти онлайн

Ҳоло дар checkout корбар усули пардохтро интихоб мекунад. Дастрас: **COD** (пардохт ҳангоми расонидан) ва **MOCK** (корти онлайни озмоишӣ, ҷараёни пурраро санҷиш мекунад). Alif Mobi / Корти Миллӣ дар backend омоданд, вале то гирифтани ҳисоби мерчант ғайрифаъоланд — дар рӯйхат намеоянд.

```
GET  ${BASE}/api/payments/providers            (public) → { providers: [{ id, label, online, description }] }
POST ${BASE}/api/payments/initiate             (токен)
  Body: { "orderId", "provider" }   // provider = "COD" | "MOCK"
  → { payment: { id, provider, amount, status }, paymentUrl, instructions }
POST ${BASE}/api/payments/:id/confirm          (public — барои MOCK/webhook)
  → { message, payment }
GET  ${BASE}/api/payments/order/:orderId        (токен) → { payment, paymentMethod }
```

**Ҷараён:**
1. Дар checkout, пас аз сохтани фармоиш (`POST /api/orders`) `orderId` мегирӣ.
2. `GET /providers` → усулҳоро нишон деҳ (radio).
3. **COD:** `initiate` бо `provider: "COD"` → `instructions`-ро нишон деҳ («Ҳангоми расонидан нақд пардохт кунед») → тамом.
4. **MOCK (онлайн):** `initiate` бо `provider: "MOCK"` → `paymentUrl` мегирӣ. Дар воқеият ин саҳифаи gateway мебуд; барои озмоиш — тугмаи «Пардохтро тасдиқ кун», ки `POST /payments/:id/confirm`-ро мезанад (ё ба `paymentUrl` мегузарӣ). Баъд `status: "PAID"` мешавад → «✅ Пардохт шуд».
5. Барои нишон додани ҳолат: `GET /payments/order/:orderId`.

**UI:** қадами «Усули пардохт» дар checkout. Пас аз пардохти онлайн — экрани муваффақият. Огоҳиномаи `PAYMENT_PAID` тавассути socket меояд.

---

## 5. 🔔 Web Push (PWA) — огоҳинома вақте сайт пӯшида аст

Огоҳинома дар браузер/телефон ҳатто вақте сайт кушода нест — ройгон, бе app store. Мисли Telegram ба системаи notification пайваст аст.

```
GET  ${BASE}/api/push/vapid-public-key   (public) → { configured, publicKey }
POST ${BASE}/api/push/subscribe          (токен)  Body: PushSubscription JSON браузер
POST ${BASE}/api/push/unsubscribe        (токен)  Body: { endpoint }
```

**Ҷараён (стандартии Web Push):**
1. `service-worker.js`-ро сабт кун (`navigator.serviceWorker.register`).
2. `GET /vapid-public-key`. Агар `configured: false` — фичаро пинҳон кун.
3. Иҷозат пурс: `Notification.requestPermission()`.
4. Обуна шав: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })`.
5. Натиҷаро ба `POST /subscribe` фирист (ҳамон объекти `subscription.toJSON()` — `{ endpoint, keys: { p256dh, auth } }`).
6. Дар service worker `push` event-ро гӯш кун ва `showNotification(title, { body })` кун. Payload: `{ title, body, type?, orderId?, ... }`.
7. Тугмаи «Ғайрифаъол» → `POST /unsubscribe` бо `endpoint`.

**UI:** дар танзимот тугмаи «🔔 Огоҳиномаҳои браузер». service worker + manifest.json барои PWA лозим.

---

## 🔌 Socket — навъҳои нави огоҳинома

Event-и мавҷудаи `new_notification` акнун `type`-ҳои нав дорад. Ҳамаашро дар зангӯла/рӯйхат нишон деҳ; бо клик ба ҷои мувофиқ бар:

```ts
socket.on('new_notification', (n) => {
  // n = { title, content, createdAt, type?, ...meta }
  switch (n.type) {
    case 'PRICE_OFFER':      break; // → фурӯшанда: /seller/offers
    case 'OFFER_ACCEPTED':   break; // → харидор: купон n.couponCode, /offers
    case 'OFFER_REJECTED':   break; // → харидор: /offers
    case 'OFFER_COUNTERED':  break; // → харидор: нархи ҷавобӣ n.counterPrice, /offers
    case 'COUNTER_ACCEPTED': break; // → фурӯшанда: /seller/offers
    case 'PAYMENT_PAID':     break; // → харидор: /orders/:orderId
    case 'ORDER_PAID':       break; // → фурӯшанда
    // мавҷуда: NEW_ORDER | ORDER_STATUS | ABANDONED_CART
  }
});
```

---

## Типҳои TypeScript (илова кун)

```ts
type TelegramStatus = { configured: boolean; linked: boolean };
type TelegramLink = { configured: boolean; code: string; url: string | null; botUsername: string | null };

type OfferStatus = 'PENDING' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
type Offer = {
  id: string; productId: string;
  offeredPrice: number; counterPrice: number | null; agreedPrice: number | null;
  status: OfferStatus; message: string | null; couponCode: string | null;
  createdAt: string; respondedAt: string | null; expiresAt: string; isExpired: boolean;
  product: { id: string; name: string; price: number; discountPrice: number | null;
    isOnDiscount: boolean; image: string | null; shopName: string | null; shopId: string | null } | null;
  buyer: { id: string; name: string; avatarUrl: string | null } | null;
};

type TrustBadge = { id: string; label: string; icon: string; description: string };
type TrustResult = {
  shopId: string;
  stats: { reviewCount: number; avgRating: number | null; deliveredOrders: number;
    sellerReplyRate: number | null; avgResponseMinutes: number | null };
  badges: TrustBadge[];
};

type PaymentProvider = { id: string; label: string; online: boolean; description: string };
type Payment = { id: string; provider: string; amount: number; status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' };
type InitiatePaymentResponse = { payment: Payment; paymentUrl: string | null; instructions: string };
```

Дизайн ба стили умумии сайт мувофиқ бошад ва дар мобилӣ хуб кор кунад.

---

## ⚙️ Ёддошт барои backend deploy (муҳим)

Ҳамаи endpoint-ҳо **бехатар** кор мекунанд, ҳатто агар калидҳо гузошта нашаванд (`configured: false` бармегардонанд, сайт вайрон намешавад). Барои фаъол кардани фичаҳо, дар **Render → Environment** илова кун:

**Telegram (фичаи 1):**
```
TELEGRAM_BOT_TOKEN = <аз @BotFather>
TELEGRAM_BOT_USERNAME = <ном_бе_@>   # ихтиёрӣ; худкор аз getMe гирифта мешавад
```
Ботро дар [@BotFather](https://t.me/BotFather) соз (`/newbot`), токенро гир. Бот тавассути long polling кор мекунад — URL-и оммавӣ лозим нест.

**Web Push (фичаи 5):**
```
npx web-push generate-vapid-keys     # як бор иҷро кун
VAPID_PUBLIC_KEY  = ...
VAPID_PRIVATE_KEY = ...
VAPID_SUBJECT     = mailto:admin@bozor.tj   # ихтиёрӣ
```

**Пардохт (фичаи 4):** `COD` ва `MOCK` бе ҳеҷ калид кор мекунанд. Барои `MOCK` `paymentUrl`-и дуруст: `PUBLIC_BASE_URL = https://bozortj-back.onrender.com` (ихтиёрӣ). Alif/DC вақте ҳисоби мерчант гирифтӣ: `ALIF_MERCHANT_KEY` / `DC_MERCHANT_KEY` (интегратсия дар backend бояд илова шавад).

**Нишонҳои эътимод (фичаи 3):** ҳеҷ калид намехоҳад — фавран кор мекунад.

Push ба `main` кофист — Render худкор `prisma db push`-ро иҷро мекунад, пас ҷадвалҳо/майдонҳои нав (`PriceOffer`, `PushSubscription`, `Payment`, `telegramChatId`, `Coupon.assignedUserId`, `Order.paymentMethod`) худкор татбиқ мешаванд.
