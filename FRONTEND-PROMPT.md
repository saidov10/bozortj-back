# 🆕 Промт — ТАНҲО функсияҳои нав (Zinda Bozor: Real-Time лаяи фаврӣ)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **3 функсияи навро** ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts` ё `lib/socket.ts`, store, types) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend навсозӣ шуд. Socket.io (WebSocket) аллакай барои чат истифода мешавад — ҳамон пайвастшавии `ws://`/`wss://`-ро истифода бар, танҳо 3 event-и наверо гӯш кун ва 2 event-и наверо фиристода.

## ⚠️ Муҳим: Socket акнун барои меҳмон (бе login) ҳам кор мекунад
Пештар пайвастшавии socket **токен**-ро ҳатмӣ мехост. Акнун агар токен набошад ҳам, пайвастшавӣ қабул мешавад (ҳамчун "меҳмон") — танҳо чат/огоҳинома барои корбарони login-шуда фаъол мемонанд. Яъне дар **саҳифаи мол** (product page), новобаста аз он ки харидор login кардааст ё не, бояд socket пайваст шавад:
```ts
const socket = io(SOCKET_URL, { auth: { token: authToken || undefined } });
```
Агар `authToken` набошад, `undefined` фиристода шавад — socket ҳамоно кор мекунад (public feature-ҳо фаъол мешаванд).

---

## 1. 👀 "N нафар ҳозир ин молро мебинанд" (Live Viewer Count)

Дар **саҳифаи мол** (product detail page), ҳангоми кушодан:
```ts
socket.emit('view_product', productId);
```
Ҳангоми баромадан аз саҳифа (unmount) ё гузаштан ба моли дигар:
```ts
socket.emit('leave_product', productId);
```
Гӯш кардан ба навсозии рақам:
```ts
socket.on('viewer_count', ({ productId, count }) => { /* update UI */ });
```

### Чӣ бояд созӣ:
- Дар боло/паҳлӯи расми мол як бейҷи хурд: "🔥 {count} нафар ҳозир мебинанд" — фақат агар `count > 1` нишон деҳ (худи корбар низ ҳисоб мешавад, пас 1 маънои "танҳо шумо" дорад — ин бейҷро пинҳон кун).
- Дар `useEffect`, ҳангоми mount → `view_product`, ҳангоми cleanup → `leave_product`.

---

## 2. 📦 "Faqat N to monad!" — Зиндагии захира (Live Stock Update)

Гӯш кардан дар саҳифаи мол:
```ts
socket.on('stock_update', ({ productId, variantId, stockQuantity, productStockQuantity }) => {
  // Агар variantId бо вариант-и интихобшуда мувофиқ бошад — stockQuantity-ро нав кун
});
```
Ин ҳангоми **ҳар харид** (checkout)-и дигарон фаврӣ фиристода мешавад — ҳеҷ refresh лозим нест.

### Чӣ бояд созӣ:
- Дар саҳифаи мол, агар stock-и вариант-и интихобшуда ≤ 5 бошад, бо ранги сурх "Faqat {stockQuantity} to monad!" нишон диҳ.
- Ҳангоми гирифтани `stock_update` барои ҳамон продуктест, ки ҳозир кушода аст — рақамро зинда нав кун (бе refetch аз REST).
- Агар `stockQuantity === 0` шавад — тугмаи "Ба сабад илова кун"-ро ғайрифаъол кун ва "Тамом шуд" нишон диҳ.

---

## 3. 🛎️ Огоҳиномаи фаврии фурӯшанда ва пайгирии зиндаи фармоиш

### 3a. Фурӯшанда — toast фаврӣ барои фармоиши нав
Event-и мавҷудаи `new_notification` акнун майдонҳои иловагӣ дорад:
```ts
socket.on('new_notification', (n) => {
  // n = { title, content, createdAt, type?, orderId?, status? }
  if (n.type === 'NEW_ORDER') {
    // Дар панели Seller: toast/popup фаврӣ бо садо ("🛎️ Фармоиши нав! ...")
    // Тугма "Дидан" → навигатсия ба /seller/orders/{n.orderId}
  }
});
```
- Дар **панели фурӯшанда**, гӯш кардан ба ин event-ро дар лейаути умумии панел (на танҳо як саҳифа) гузор, то дар ҳар куҷои панел бошад ҳам, toast пайдо шавад.
- Як садои кӯтоҳ (notification sound, `.mp3` хурд) илова кун, ки ҳангоми `type === 'NEW_ORDER'` пахш шавад.

### 3b. Харидор — пайгирии зиндаи фармоиш (бе refresh)
Дар **саҳифаи пайгирии фармоиш** (order tracking, ки stepper-ро аз `GET /api/orders/{id}/timeline` нишон медиҳад — агар ин саҳифаро аллакай сохта бошед):
```ts
socket.on('order_status_changed', ({ orderId, status, note }) => {
  // Агар orderId баробари фармоиши кушодашуда бошад — stepper-ро фаврӣ нав кун
  // (бе дархости дубораи GET /timeline)
});
```
Ин вақте фиристода мешавад, ки Seller/Admin статуси фармоишро тағйир диҳад (`PUT /api/orders/{id}/status`).

---

## Хулосаи events

| Event | Самт | Барои чӣ |
|---|---|---|
| `view_product` | client → server | Кушодани саҳифаи мол |
| `leave_product` | client → server | Баромадан аз саҳифаи мол |
| `viewer_count` | server → client | `{ productId, count }` |
| `stock_update` | server → client | `{ productId, variantId, stockQuantity, productStockQuantity }` |
| `new_notification` | server → client | `{ title, content, createdAt, type?, orderId?, status? }` (акнун бо `type: 'NEW_ORDER'` ё `'ORDER_STATUS'`) |
| `order_status_changed` | server → client | `{ orderId, status, note }` |

## Типҳои TypeScript (илова кун)
```ts
type ViewerCountEvent = { productId: string; count: number };
type StockUpdateEvent = { productId: string; variantId: string; stockQuantity: number; productStockQuantity: number };
type LiveNotification = { title: string; content: string; createdAt: string; type?: 'NEW_ORDER' | 'ORDER_STATUS'; orderId?: string; status?: string };
type OrderStatusChangedEvent = { orderId: string; status: string; note: string | null };
```

## Ёддошт барои backend deploy
Ҳеҷ тағйироти база лозим нест (танҳо тағйироти socket/controller). Push ба `main` кофист — Render худкор деплой мекунад.
