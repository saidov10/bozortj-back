# Frontend prompt — 4 функсияи нав (Bozor TJ)

Ин ҳуҷҷат барои амалӣ кардани **4 функсияи нав** дар frontend аст. Backend аллакай тайёр
ва деплой шудааст. Ҳама endpointҳо зери `https://<API_BASE>/api/...` кор мекунанд.

**Асосҳо**
- Auth: header `Authorization: Bearer <JWT>`.
- Нақшҳо: `BUYER`, `SELLER`, `ADMIN`.
- Хатоҳо: `{ message: string }` бо коди статуси мувофиқ.
- Нархҳо бо **сомонӣ**.
- Функсияҳои AI (№10) серверро бо `GROQ_API_KEY` талаб мекунанд, вагарна `503`.

Функсияҳо: **10** AI-чатботи фурӯшанда · **11** Назорати нарх · **12** Дашборди таҳлилӣ · **13** Экспорт ба Telegram/Instagram.

---

## 10) AI-чатботи фурӯшанда (Grounded Q&A)

AI ба саволи харидор **фақат аз рӯи маълумоти воқеии мол** ҷавоб медиҳад (тавсиф, нарх,
андоза/ранг, захира, кафолат, расонидан). Агар ҷавоб дар маълумот набошад — содиқона мегӯяд
«аз фурӯшанда мепурсам» ва чизе аз худ намесозад.

### а) Ҷавоби фаврӣ дар саҳифаи мол (public)
`POST /api/products/:id/ai-question`
```json
{ "question": "Ин размери 42 ҳаст?" }
```
→ `{ "answer": "Ҳа, размери 42 мавҷуд аст...", "confident": true }`
- UI: дар саҳифаи мол блоки «Савол доред? Фавран пурсед» — майдони input + ҷавоби фаврӣ.
- `confident: false` → нишон диҳед «Ин ҷавоби AI аст, барои тасдиқ ба фурӯшанда нависед»
  ва тугмаи «Ба фурӯшанда савол диҳед» (ҳамон `POST /api/products/:id/questions`).

### б) Драфти AI барои фурӯшанда (SELLER)
Барои саволҳои воқеии ҷавобнадода (`GET /api/products/questions/pending`):
`POST /api/products/questions/:qid/ai-draft`
→ `{ "draft": "Салом! Ҳа, ин мол...", "confident": true }`
- UI: дар панели «Саволҳо» назди ҳар савол тугмаи «✨ Ҷавоби AI». Драфтро ба майдони ҷавоб
  мегузорад; фурӯшанда таҳрир ё бо як зер мефиристад бо `POST /api/products/questions/:qid/answer`.

---

## 11) Назорати нарх (Price insights) — `GET /api/seller/price-insights` (SELLER)

Ҳар моли фурӯшандаро бо **медианаи нархи молҳои монанд аз мағозаҳои дигар** муқоиса мекунад
ва бармегардонад, ки мол гарон, арзон ё муносиб аст.

Ҷавоб:
```json
{
  "checked": 12,
  "summary": { "overpriced": 3, "underpriced": 2, "fair": 6, "noData": 1 },
  "insights": [
    {
      "productId": "...", "name": "iPhone 13",
      "myPrice": 5200, "marketMedian": 4500, "deltaPercent": 15.6,
      "status": "overpriced",           // overpriced | underpriced | fair | no_data
      "basis": "similar",               // similar (монанд) | category (тамоми категория)
      "sampleSize": 8, "suggestedPrice": 4635
    }
  ]
}
```
- Остонаҳо: `> +15%` → `overpriced` (сурх), `< −15%` → `underpriced` (зард — «пул гум мекунед»),
  дар байн → `fair` (сабз).
- UI: ҷадвал/кортҳо — нархи ман vs медиана, `deltaPercent` бо ранг, тугмаи «Нархро ба
  {suggestedPrice} гузор» (→ `PUT /api/products/:id`). Мураттаб: аввал `overpriced`.
- `no_data` → «моли монанд кам аст».

---

## 12) Дашборди таҳлилӣ — `GET /api/analytics/dashboard` (SELLER)

Силсилаи 30-рӯза (фармоиш/адад/даромад) + KPI + афзоиш + шумораи корҳои таъхирнопазир.
> (Endpointҳои кӯҳна ҳанӯз кор мекунанд: `GET /api/analytics` умумӣ, `GET /api/analytics/heatmap`
> — «соатҳои фаъол».)

Ҷавоб:
```json
{
  "series": [ { "date": "2026-07-05", "orders": 4, "units": 6, "revenue": 820.5 }, ... ], // 30 рӯз
  "kpis": {
    "today":      { "revenue": 150, "orders": 2 },
    "last7Days":  { "revenue": 1900, "orders": 14 },
    "last30Days": { "revenue": 7400, "orders": 61, "units": 88 },
    "revenueGrowthPercent": 23.5,   // vs 30 рӯзи пешина (null агар маълумот набошад)
    "ordersGrowthPercent": 12.0
  },
  "actions": { "pendingOrders": 3, "unansweredQuestions": 5, "lowStockProducts": 2 }
}
```
- UI: саҳифаи асосии кабинети фурӯшанда — 4 корти KPI (бо ↑/↓ ва фоизи афзоиш), графики хатии
  `series` (даромад/фармоиш), ва «корҳо»-и таъхирнопазир ҳамчун бэйҷҳои клик-шаванда
  (фармоишҳои нав, саволҳои ҷавобнадода, захираи кам).

---

## 13) Экспорт ба Telegram / Instagram (Share) — `/api/share`

### а) Корти share (public)
`GET /api/share/products/:id/card`
```json
{
  "card": {
    "productId": "...", "title": "...", "price": 4500, "url": "https://bozor.tj/products/...",
    "caption": "🛍️ ... \n💰 4500 сомонӣ\n🏪 ...\n\n👉 https://...",
    "hashtags": ["#Apple", "#Телефон", "#BozorTJ", "#Тоҷикистон"],
    "shareText": "caption + hashtags",
    "imageUrl": "https://.../uploads/products/....jpg",
    "links": {
      "telegram": "https://t.me/share/url?url=...&text=...",
      "whatsapp": "https://wa.me/?text=...",
      "instagram": null
    },
    "telegramChannelAvailable": true
  }
}
```
- UI: тугмаи «Мубодила» дар корти/саҳифаи мол → варақаи share.
  - **Telegram / WhatsApp**: `links.telegram` / `links.whatsapp`-ро кушоед (target=_blank).
  - **Instagram**: URL-и веб надорад — аз `navigator.share({ text: shareText, url })` (Web Share API)
    истифода баред ё `imageUrl`+`caption`-ро барои Story нусхабардорӣ пешниҳод кунед.
  - Умуман беҳтараш: агар `navigator.share` дастрас бошад, ҳамонро бо `shareText`+`imageUrl` истифода баред.

### б) Як зер — нашр ба канали Telegram (SELLER)
`POST /api/share/products/:id/telegram` (танҳо соҳиби мол)
→ `200 { message }` ё `503` агар Telegram танзим нашуда бошад.
- UI: дар кабинети фурӯшанда назди мол тугмаи «Ба канал нашр кун». Агар
  `card.telegramChannelAvailable === false` → тугмаро пинҳон/ғайрифаъол кунед.

---

### Ҷамъбасти endpointҳои нав
| Функсия | Endpoint | Нақш |
|---|---|---|
| AI ҷавоби фаврӣ | `POST /api/products/:id/ai-question` | public |
| AI драфт барои савол | `POST /api/products/questions/:qid/ai-draft` | SELLER |
| Назорати нарх | `GET /api/seller/price-insights` | SELLER |
| Дашборд | `GET /api/analytics/dashboard` | SELLER |
| Корти share | `GET /api/share/products/:id/card` | public |
| Нашр ба Telegram | `POST /api/share/products/:id/telegram` | SELLER |

> Эзоҳ: промти пешинаи 8 функсия (иҷора, live, pickup, аукциони баръакс, preorder, AI хариди
> пурра) иваз шуд — он функсияҳо аллакай дар backend деплой шудаанд ва кор мекунанд.
