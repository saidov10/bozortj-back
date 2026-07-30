# 🆕 Промт — ТАНҲО функсияҳои нав (Analytics Dashboard + Тавсияи мол + Пайгирии фармоиш)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **3 функсияи навро** ба лоиҳаи мавҷуда илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, store, types) мутобиқ шав, чизи дигарро вайрон накун.

Матни зери `---`-ро ба Claude/frontend AI диҳ.

---

Backend навсозӣ шуд. Ба frontend-и мавҷуди маркетплейс (Next.js, ба `https://bozortj-back.onrender.com` пайваст) **3 функсияи навро** илова кун.

## 1. 📊 Analytics Dashboard (Маъмур + Фурӯшанда)

### Барои Фурӯшанда (Seller Dashboard)
`GET /api/analytics` (token-и SELLER лозим) — акнун иловагӣ `orderStatusBreakdown` медиҳад:
```json
{
  "analytics": {
    "shopName": "MyShop",
    "totalRevenue": 1520.5,
    "totalItemsSold": 84,
    "averageRating": 4.3,
    "reviewCount": 21,
    "topProducts": [{ "id": "...", "name": "...", "quantitySold": 12, "revenueGenerated": 240 }],
    "monthlyBreakdown": { "2026-06": 500, "2026-07": 1020.5 },
    "orderStatusBreakdown": { "PENDING": 3, "DELIVERED": 40, "CANCELLED": 2 }
  }
}
```

### Барои Маъмур (Admin Dashboard) — НАВ
`GET /api/analytics/admin` (token-и ADMIN лозим):
```json
{
  "analytics": {
    "totalRevenue": 45230.75,
    "totalItemsSold": 1204,
    "totalOrders": 312,
    "totalUsers": 540,
    "totalBuyers": 480,
    "totalSellers": 58,
    "totalProducts": 890,
    "totalShops": 58,
    "topProducts": [{ "id": "...", "name": "...", "quantitySold": 60, "revenueGenerated": 3200 }],
    "topSellers": [{ "id": "...", "shopName": "...", "revenue": 5400 }],
    "orderStatusBreakdown": { "PENDING": 10, "PROCESSING": 8, "SHIPPED": 15, "DELIVERED": 260, "CANCELLED": 19 },
    "dailyRevenue": { "2026-07-28": 320.5, "2026-07-29": 410, "2026-07-30": 275 }
  }
}
```

### Чӣ бояд созӣ:
- Дар панели **Admin** саҳифаи нав ё бахши нав "Dashboard/Analytics" — карточкаҳои рақамӣ (stat cards) барои `totalRevenue`, `totalOrders`, `totalUsers`, `totalProducts`.
- Диаграммаи хаттӣ/сутунӣ (line/bar chart) барои `dailyRevenue` (даромад аз рӯи рӯз).
- Диаграммаи pie/donut барои `orderStatusBreakdown`.
- Ҷадвал ё рӯйхат барои `topProducts` ва `topSellers`.
- Дар панели **Seller** дашборди мавҷударо бо диаграммаи pie барои `orderStatusBreakdown` пурра кун (агар аллакай карточкаҳои `totalRevenue`/`topProducts`/`monthlyBreakdown` ҳастанд, онҳоро нигоҳ дор — танҳо иловаро гузор).
- Китобхонаи диаграмма: ҳар чизе, ки лоиҳа аллакай истифода мебарад (масалан `recharts`) — агар нест, `recharts`-ро истифода бар.

---

## 2. 🎯 Тавсияи мол (Product Recommendations) — НАВ

`GET /api/products/{id}/recommendations` (public, token лозим нест) — 8 маҳсулоти тавсияшуда мебарорад: аввал маҳсулоте, ки якҷоя бо ин мол зиёд харида шудаанд ("customers who bought this also bought"), баъд аз ҳамон категория (агар кофӣ набошад):
```json
{
  "recommendations": [
    {
      "id": "...", "name": "...", "price": 120, "discountPrice": 99, "isOnDiscount": true,
      "images": [{ "url": "/uploads/products/xxx.jpg" }],
      "category": { "id": "...", "name": "..." },
      "brand": { "id": "...", "name": "..." },
      "color": { "id": "...", "name": "...", "hexCode": "#000" },
      "variants": [...],
      "shop": { "id": "...", "shopName": "..." },
      "averageRating": 4.2,
      "reviewCount": 9
    }
  ]
}
```

### Чӣ бояд созӣ:
- Дар **саҳифаи мол** (product detail page), поёнтар аз тавсифи мол/шарҳҳо, бахши нав "Шояд ба шумо ҳам маъқул ояд" / "Молҳои монанд" илова кун.
- Карточкаҳои маҳсулот — ҳамон компоненти мавҷудаи `ProductCard`-ро истифода бар (агар ҳаст), танҳо data-ро аз ин endpoint гир.
- Агар `recommendations` холӣ буд, бахшро тамоман нишон надеҳ (padding-и холӣ насоз).

---

## 3. 📦 Пайгирии фармоиш (Order Tracking Timeline) — НАВ

`GET /api/orders/{id}/timeline` (token-и BUYER/SELLER/ADMIN, ки соҳиби фармоиш аст):
```json
{
  "orderId": "...",
  "currentStatus": "SHIPPED",
  "isCancelled": false,
  "stages": ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"],
  "history": [
    { "status": "PENDING", "note": "Order placed", "createdAt": "2026-07-28T10:00:00Z" },
    { "status": "PROCESSING", "note": null, "createdAt": "2026-07-29T09:00:00Z" },
    { "status": "SHIPPED", "note": null, "createdAt": "2026-07-30T08:00:00Z" }
  ]
}
```
Эзоҳ: агар фармоиш бекор шуда бошад (`CANCELLED`), `stages` танҳо `["CANCELLED"]` мешавад ва `isCancelled: true`.

Тағйир додани status (Seller/Admin) ҳоло майдони ихтиёрии `note` низ қабул мекунад:
`PUT /api/orders/{id}/status` body: `{ "status": "SHIPPED", "note": "Аз анбор фиристода шуд" }`

### Чӣ бояд созӣ:
- Дар **саҳифаи тафсилоти фармоиш** (order detail, барои Buyer/Seller/Admin) — компоненти визуалии **stepper/timeline** илова кун: марҳилаҳо (`stages`) уфуқӣ ё амудӣ, марҳилаи гузашта ✅ сабз, марҳилаи ҷорӣ ⏳ фаъол, боқимонда хокистарӣ.
- Зери stepper — рӯйхати `history` бо вақт (`createdAt`, ба формати маҳаллӣ табдил деҳ) ва `note` (агар бошад).
- Агар `isCancelled: true` бошад — ба ҷои stepper як баннери сурх "Фармоиш бекор карда шуд" нишон деҳ.
- Дар панели Seller, ҳангоми тағйири status, майдони ихтиёрии "Тавзеҳ (note)" илова кун, то бо `PUT /status` фиристода шавад.

---

## Ёддошт барои backend deploy

Ин 3 функсия ба ҷадвали **нав**-и база `OrderStatusHistory` эҳтиёҷ дорад. Пеш аз истифодаи production, дар сервери backend бояд иҷро шавад:
```
npx prisma db push
```
(бо `DATABASE_URL`-и воқеии Render/Postgres — на бо `.env`-и локалӣ).

## Типҳои TypeScript (илова кун)
```ts
type OrderStatusHistoryEntry = { status: string; note: string | null; createdAt: string };
type OrderTimeline = {
  orderId: string;
  currentStatus: string;
  isCancelled: boolean;
  stages: string[];
  history: OrderStatusHistoryEntry[];
};
type SellerAnalytics = {
  shopName: string; totalRevenue: number; totalItemsSold: number; averageRating: number; reviewCount: number;
  topProducts: { id: string; name: string; quantitySold: number; revenueGenerated: number }[];
  monthlyBreakdown: Record<string, number>;
  orderStatusBreakdown: Record<string, number>;
};
type AdminAnalytics = {
  totalRevenue: number; totalItemsSold: number; totalOrders: number;
  totalUsers: number; totalBuyers: number; totalSellers: number; totalProducts: number; totalShops: number;
  topProducts: { id: string; name: string; quantitySold: number; revenueGenerated: number }[];
  topSellers: { id: string; shopName: string; revenue: number }[];
  orderStatusBreakdown: Record<string, number>;
  dailyRevenue: Record<string, number>;
};
```
