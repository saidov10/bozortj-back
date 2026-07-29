# 🆕 Промт — ТАНҲО функсияҳои нав (категорияи мағоза + формаи динамикии мол)

> Frontend аллакай ҳаст ва ба `https://bozortj-back.onrender.com` пайваст аст. **Аз нав насоз** — танҳо ин **3 функсияи навро** ба лоиҳаи мавҷуда илова кун. Матни зери `---`-ро ба Claude диҳ.

---

Backend навсозӣ шуд. Ба frontend-и мавҷуди маркетплейс (Next.js, ба `https://bozortj-back.onrender.com` пайваст) **3 функсияи навро** илова кун. Ба сохтори мавҷуда (компонентҳо, `lib/api.ts`, store, types) мутобиқ шав, чизи дигарро вайрон накун.

## 1. 🏪 Дар signup-и Фурӯшанда — интихоби категорияи мағоза (ҲАТМӢ)
Ҳоло ҳар мағоза ба **як категория** баста мешавад ва танҳо ҳамон навъ молро мефурӯшад.
- Дар формаи **бақайдгирии фурӯшанда** (`register/seller`) як майдони нав илова кун: **интихоби категория** (dropdown).
- Рӯйхатро аз `GET /api/categories` гир (ҷавоб: `{ categories: [{ id, name, subcategories, attributeFields }] }`).
- Ҳангоми фиристодан майдони нав `categoryId`-ро ҳам дохил кун (multipart, ҳамроҳи `name, shopName, description, email, phone, password, avatar?`).
- `categoryId` **ҳатмӣ** аст — агар холӣ бошад backend `400` медиҳад. Дар UI validation гузор.
- Баъди login/register акнун `user.shop.category = { id, name }` меояд — онро дар store нигоҳ дор ва дар профили фурӯшанда нишон деҳ.

## 2. 🔒 Фурӯшанда танҳо категорияи худро мефурӯшад
Дар панели фурӯшанда, формаи **илова/таҳрири мол**:
- Категорияро **интихобшаванда накун** — онро **read-only** нишон деҳ (баробари `shop.category.name`), чун backend ҳар молро маҷбуран ба категорияи мағоза мебандад.
- `categoryId`-ро фиристодан шарт нест (backend худаш мегузорад). Агар фиристӣ, бояд баробари `shop.category.id` бошад — вагарна `400` бо паёми «Your shop can only sell products in the "X" category».
- **Subcategory**-ро ҳамоно интихоб кардан мумкин, вале танҳо аз зерқатегорияҳои ҳамон категория (аз `category.subcategories`).

## 3. 🧩 Формаи динамикии мол вобаста ба категория (МУҲИМТАРИН)
Ҳар категория майдонҳои махсуси худро дорад (Electronics → RAM, Storage, Screen Size…; Clothing → Material, Gender, Season…).
- Майдонҳоро гир: `GET /api/categories/{id}/attributes` →
  `{ categoryId, name, attributeFields: [{ key, label, type, options?, unit?, required? }] }`
  (ё ҳамин `attributeFields` дар ҳар category-и `GET /api/categories` низ ҳаст — метавонӣ аз он гирӣ, бе дархости иловагӣ).
- `type` ∈ `text` | `number` | `select` | `boolean`. Барои `select` — `options: string[]`; `unit` (масалан "GB", "ml") -ро дар паҳлӯи майдон нишон деҳ; `required: true` → validation.
- Дар формаи **илова/таҳрири мол**, баъди интихоби категория, ин майдонҳоро **динамикӣ render кун**:
  - `text` → input, `number` → input[type=number], `select` → dropdown бо options, `boolean` → checkbox/switch.
- Қиматҳоро дар як объект ҷамъ кун: `{ [key]: value }`, масалан `{ "condition":"New", "ram":"8GB", "storage":"256GB" }`.
- Ҳангоми фиристодани мол, инро ҳамчун **JSON-string** дар майдони `attributes` (дар ҳамон multipart form-data) гузор:
  `formData.append('attributes', JSON.stringify(attrs))`.
- Майдонҳои `required: true`-ро агар пур накунад, backend `400` медиҳад («Please fill in the required fields…») — дар frontend пеш аз фиристодан validation кун.

### Нишон додани attributes
- Дар **саҳифаи мол** (product detail), агар `product.attributes` бошад, як ҷадвали **«Хусусиятҳо / Характеристикаҳо»** созед: калид ↔ қимат (label-ро аз `attributeFields` мувофиқи `key` гир, то зебо ба тоҷикӣ/русӣ нишон диҳӣ).
- `product.attributes` акнун дар ҷавоби `GET /api/products` ва `GET /api/products/:id` меояд (объект ё `null`).

---

## Типҳои TypeScript (илова кун)
```ts
type AttributeField = {
  key: string; label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  options?: string[]; unit?: string; required?: boolean;
};
type Category = { id: string; name: string; subcategories: {id:string;name:string}[]; attributeFields: AttributeField[] };
// shop: акнун { id, shopName, description, category: { id, name } | null }
// product: акнун майдони attributes?: Record<string, any> | null дорад
```

## Хулоса
1. **Signup-и фурӯшанда** → dropdown-и категория (`categoryId` ҳатмӣ).
2. **Формаи мол** → категория read-only (= категорияи мағоза), subcategory аз ҳамон.
3. **Майдонҳои динамикӣ** аз `attributeFields` render кун → дар `attributes` (JSON-string) фирист; дар саҳифаи мол ҳамчун ҷадвали хусусиятҳо нишон деҳ.

Ҳамааш тоҷикӣ, responsive, ба услуби мавҷуда. Дигар қисматҳоро тағйир надеҳ.
