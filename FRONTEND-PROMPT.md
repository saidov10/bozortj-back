# Frontend prompt — Пайгирии зиндаи курьер (Live courier tracking)

Ин ҳуҷҷат барои амалӣ кардани **пайгирии зиндаи курьер дар харита** дар frontend аст.
Backend аллакай тайёр ва деплой шудааст.

**Асосҳо**
- `API_BASE` + header `Authorization: Bearer <JWT>`.
- Нақшҳо: `BUYER`, `COURIER`, `SELLER`.
- Socket.io: ҳамон пайвасти мавҷуда `io(API_BASE, { auth: { token } })`. Рӯйдоди нав: `courier_location`.
- Ҷойгиршавӣ: `lat` (−90..90), `lng` (−180..180). Танҳо **нуқтаи охирин** дар база нигоҳ дошта
  мешавад; ҳаракати зинда тавассути socket меояд.
- Пайгирӣ танҳо вақте фаъол аст, ки фармоиш `PROCESSING` ё `SHIPPED` бошад.

---

## 1) Курьер — фиристодани ҷойгиршавӣ (COURIER)

`PUT /api/courier/deliveries/:id/location`
```json
{ "lat": 38.5598, "lng": 68.7870 }
```
→ `200 { message }`

**UI (аппи курьер):** дар экрани «Расонидани фаъол», вақте курьер молро гирифт (`SHIPPED`),
бо `navigator.geolocation.watchPosition(...)` ҳар ~10–15 сония ё ҳангоми ҳаракат координатаро
фиристед. Ҳангоми `DELIVERED` ё пӯшидани экран `clearWatch` кунед.

> Хатоҳо: `403` — фармоиш ба ин курьер таъин нашуда; `400` — фармоиш дар роҳ нест (ё координата нодуруст).

---

## 2) Харидор — дидани курьер дар харита (BUYER)

### Ҳолати ибтидоӣ (REST)
`GET /api/orders/:id/courier-location`
```json
{
  "status": "SHIPPED",
  "isTracking": true,
  "courier": { "id": "...", "name": "Алишер", "phone": "+992..." },
  "destination": { "city": "Душанбе", "street": "...", "building": "12", "landmark": "..." },
  "location": { "lat": 38.5598, "lng": 68.7870, "at": "2026-08-03T14:20:00Z" }
}
```
- `location: null` → курьер ҳанӯз ҷойгиршавиро нафиристодааст → нишон диҳед «Курьер ҳанӯз дар роҳ нест».
- `isTracking: false` → харитаро пинҳон кунед (фармоиш ё нарасидааст ё аллакай `DELIVERED`).

### Навшавии зинда (socket)
```ts
socket.on('courier_location', ({ orderId, lat, lng, at }) => {
  if (orderId === currentOrderId) moveMarker(lat, lng);   // маркери курьерро ҳаракат диҳед
});
```
- Аввал бо REST ҳолати ибтидоиро гиред → маркерро гузоред → баъд бо socket навсозӣ кунед.
- Дастрасӣ: харидори соҳиби фармоиш, курьери таъиншуда ва фурӯшандаи молҳои дохили фармоиш.

**UI:** дар саҳифаи пайгирии фармоиш (order timeline) блоки харита. Ду маркер: **курьер** (ҳаракаткунанда)
ва **манзили харидор** (`destination`). Номи курьер + тугмаи «Занг задан» (`tel:phone`). Харитаро
аз ҳар провайдери дилхоҳ (Leaflet + OpenStreetMap, 2GIS, Google Maps) гузоред — backend танҳо
координатаҳоро медиҳад.

---

### Ҷамъбаст
| Амал | Endpoint / event | Нақш |
|---|---|---|
| Курьер координата мефиристад | `PUT /api/courier/deliveries/:id/location` | COURIER |
| Ҳолати ибтидоӣ | `GET /api/orders/:id/courier-location` | BUYER / SELLER / COURIER |
| Навшавии зинда | socket `courier_location` `{ orderId, lat, lng, at }` | ҳамаи тарафҳо |

> Эзоҳ: промти пешинаи функсияҳои 10–13 (AI-чатбот, назорати нарх, дашборд, share) иваз шуд —
> он функсияҳо аллакай дар backend деплой шудаанд ва кор мекунанд.
