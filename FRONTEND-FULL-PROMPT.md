# 🚀 Промти пурра — Frontend-и функсионалӣ (Next.js + backend-и зинда)

> Матни зери сатри `---`-ро нусхабардорӣ карда, ба Claude диҳед.

---

Ту як **frontend-разработчики калон**-и ботаҷриба дар **Next.js** ҳастӣ. Барои ман frontend-и **комилан функсионалии** як мағозаи онлайн (маркетплейс) созед, ки ба **API-и зиндаи воқеӣ** пайваст мешавад ва **ҳамаи мантиқро (logic)** иҷро мекунад — на танҳо дизайн.

## 0. Backend аллакай тайёр ва деплойшуда аст
- **Base URL:** `https://bozortj-back.onrender.com`
- Ҳамаи endpoint-ҳо зери `/api` ҳастанд.
- Авторизатсия бо **JWT (Bearer token)**.
- Чати воқеӣ бо **Socket.io** дар ҳамон base URL.
- Расмҳо бо роҳи нисбӣ бармегарданд (масалан `/uploads/products/xxx.jpg`) — дар frontend бояд base URL-ро пеш гузоред: `${API_URL}${url}`.
- Дар `.env.local`: `NEXT_PUBLIC_API_URL=https://bozortj-back.onrender.com`

## 1. Технология (ҳатмӣ)
- **Next.js (App Router, TypeScript)** + **TailwindCSS**
- **axios** (як instance-и марказӣ бо interceptor барои token) ё fetch-и wrapped
- **socket.io-client** барои чат ва notification-и воқеӣ
- Идоракунии ҳолат: **Zustand** ё React Context (барои auth, cart, notifications)
- **react-hook-form** барои формаҳо, **lucide-react** барои иконка
- **Ҳатман responsive** (desktop + mobile), забони **тоҷикӣ**, асъор **сомонӣ**, телефон `+992XXXXXXXXX`

## 2. Услуби дизайн — ЛЮКС / ПРЕМИУМ 💎
Заминаи крем (`#F7F4EF`) ё тира; ранги таъкидӣ **тиллоӣ** (`#C9A24B`); сарлавҳаҳо serif (Playfair Display), матн sans (Inter); фазои кушод, сояҳои нарм, анимацияи оромона. Тоза ва боэътимод — мисли брендҳои люкс.

---

## 3. Авторизатсия (Auth) — мантиқи асосӣ
- **Login/Register** → ҷавоб: `{ token, user }`. Token-ро дар `localStorage` нигоҳ доред, user-ро дар store.
- Дар ҳар дархости ҳимоятшуда header илова кунед: `Authorization: Bearer <token>` (interceptor).
- `user` = `{ id, name, email, phone, role, avatarUrl, shop? }`. Барои SELLER: `shop = { id, shopName, description }`.
- **Роль (role):** `BUYER` | `SELLER` | `ADMIN` — маршрутизатсия ва меню вобаста ба роль (route guards).
- Token 30 рӯз эътибор дорад. Агар API **401** диҳад → logout. Агар **403** бо блок диҳад → корбар блокшуда, logout + паём.
- Пас аз login мувофиқи роль равона кунед: BUYER → мағоза, SELLER → `/seller`, ADMIN → `/admin`.

### Endpoint-ҳои Auth
| Метод | Роҳ | Дастрасӣ | Дархост (body) | Ҷавоб |
|-------|-----|----------|----------------|-------|
| POST | `/api/auth/register/buyer` | ҳама | **multipart**: `name, email, phone, password`(min 6), `avatar`(файл, ихтиёрӣ) | `{token, user}` |
| POST | `/api/auth/register/seller` | ҳама | **multipart**: `name, shopName, description, email, phone, password, avatar?` | `{token, user{shop}}` |
| POST | `/api/auth/login` | ҳама | **JSON**: `{email, password}` | `{token, user}` |
| GET | `/api/auth/me` | auth | — | `{user}` |
| PUT | `/api/auth/me` | auth | **multipart**: `name?, phone?, avatar?` | `{user}` |

---

## 4. Маҳсулот (Products)
| Метод | Роҳ | Дастрасӣ | Тавзеҳ |
|-------|-----|----------|--------|
| GET | `/api/products` | public | Филтрҳо ҳамчун query: `categoryId, subcategoryId, brandId, colorId, size, shopId, search`. Ҷавоб: `{products:[{id,name,description,price,discountPrice,isOnDiscount,images[],category,subcategory,brand,color,variants[{id,color,size,stockQuantity,price,discountPrice}],shop{id,shopName},averageRating,reviewCount}]}` |
| GET | `/api/products/:id` | public | `{product{...,variants,shop{id,shopName,user{id,name,phone,avatarUrl}},reviews[{rating,comment,images,sellerReply,user{name,avatarUrl}}],averageRating,reviewCount}}` |
| POST | `/api/products` | SELLER | **multipart**: `name,description,price,isOnDiscount,discountPrice?,colorId,size,stockQuantity,categoryId,subcategoryId?,brandId,variants`(JSON-string массив `[{colorId,size,stockQuantity,price?,discountPrice?}]`), `images`(файлҳо **1–10**, ҳадди ақал 1 ҳатмӣ) |
| PUT | `/api/products/:id` | SELLER | ҳамон майдонҳо (ихтиёрӣ), `images` илова мешаванд |
| DELETE | `/api/products/:id` | SELLER | — |
| POST | `/api/products/:id/reviews` | BUYER | **multipart**: `rating`(1–5), `comment?`, `reviewImages`(то 5 файл). Як шарҳ ба ҳар мол (upsert) |
| POST | `/api/products/reviews/:id/reply` | SELLER | **JSON**: `{reply}` |

> ⚠️ Backend сортировка/нарх-филтр/пагинатсия надорад — инро дар frontend (client-side) созед.

## 5. Мағозаҳо (Shops)
| GET `/api/shops` | public | `{shops}` |
| GET `/api/shops/:id` | public | `{shop}` + молҳои он |
| PUT `/api/shops/settings/auto-reply` | SELLER | **JSON**: `{autoReplyText, autoReplyEnabled}` |

## 6. Сабад (Cart) — BUYER
| GET `/api/cart` | `{cartItems:[{id,quantity,variant{...,color,product{...,images,shop{id,shopName}}}}]}` |
| POST `/api/cart` | **JSON**: `{variantId, quantity}` (ё `{productId, quantity}`) |
| PUT `/api/cart/:id` | **JSON**: `{quantity}` |
| DELETE `/api/cart/:id` | — |

## 7. Дӯстдоштаҳо (Wishlist) — BUYER
| GET `/api/wishlist` | рӯйхат бо product |
| POST `/api/wishlist` | **JSON**: `{productId}` |
| DELETE `/api/wishlist/:id` | — |

## 8. Суроғаҳо (Addresses) — BUYER
| GET `/api/addresses` | `{addresses}` |
| POST `/api/addresses` | **JSON**: `{title, city, street, building, apartment?, postalCode?, landmark?, isDefault?}` |
| PUT `/api/addresses/:id` | ҳамон майдонҳо |
| DELETE `/api/addresses/:id` | — |
| PUT `/api/addresses/:id/default` | пешфарз кардан |

## 9. Купонҳо (Coupons)
| GET `/api/coupons` | auth | `{coupons}` |
| POST `/api/coupons` | SELLER/ADMIN | **JSON**: `{code, discountType('PERCENT'|'FIXED'), discountValue, minPurchase?, maxUsage?, expiryDate?}` |
| DELETE `/api/coupons/:id` | SELLER/ADMIN | — |

## 10. Фармоишҳо (Orders)
| POST `/api/orders` | BUYER | **JSON**: `{addressId, couponCode?}` — аз сабад фармоиш месозад, захираро кам мекунад, сабадро тоза мекунад |
| GET `/api/orders` | auth | Вобаста ба роль: BUYER — фармоишҳои худ; SELLER — фармоишҳои дорои моли ӯ; ADMIN — ҳама |
| GET `/api/orders/:id` | auth | тафсилот |
| PUT `/api/orders/:id/status` | SELLER/ADMIN | **JSON**: `{status}` ∈ `PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED` |

## 11. Баргардонидани пул (Refund) — зери `/api/orders`
| POST `/api/orders/:id/refund` | BUYER | **multipart**: `reason`, `refundImages`(то 5 файл) |
| PUT `/api/orders/:id/refund` | SELLER | **JSON**: `{status('APPROVED'|'REJECTED'|'DISPUTED'), explanation?}` |
| PUT `/api/orders/:id/refund/dispute` | ADMIN | **JSON**: `{status('APPROVED'|'REJECTED'), explanation?}` |

## 12. Огоҳиномаҳо (Notifications) — auth
| GET `/api/notifications` | `{notifications:[{id,title,content,isRead,createdAt}]}` |
| PUT `/api/notifications/:id/read` | хондашуда кардан |

## 13. Таснифот (Categories / Brands / Colors)
- GET `/api/categories` → `{categories}`; GET `/api/categories/:categoryId/subcategories` → `{subcategories}`
- GET `/api/brands` → `{brands}`; GET `/api/colors` → `{colors}`
- POST/PUT/DELETE-и онҳо танҳо барои SELLER (body: `{name}`; барои subcategory зери category)

## 14. Омор (Analytics) — SELLER
GET `/api/analytics` → `{analytics:{shopName,totalRevenue,totalItemsSold,averageRating,reviewCount,topProducts:[{id,name,quantitySold,revenueGenerated}],monthlyBreakdown:{"2026-07":123.5,...}}}` — бо графикҳо нишон диҳед.

## 15. Панели маъмур (Admin)
| GET `/api/admin/users` | ADMIN | `{users}` |
| PUT `/api/admin/users/:userId/block` | ADMIN | **JSON**: `{block: boolean}` |
| GET `/api/admin/reports` | ADMIN | `{reports}` |
| PUT `/api/admin/reports/:id` | ADMIN | **JSON**: `{status('RESOLVED'|'DISMISSED')}` |
| POST `/api/admin/reports` | BUYER | **JSON**: `{productId?, shopId?, reason}` (шикоят) |

---

## 16. Чати воқеӣ (Socket.io) — муҳим
1. **Таърих (REST):**
   - GET `/api/chat/conversations` → `{conversations:[{partner{id,name,role,avatarUrl,shopProfile?},lastMessage,unreadCount}]}`
   - GET `/api/chat/history/:partnerId` → `{messages}` (инчунин паёмҳоро хондашуда мекунад)
2. **Real-time (socket):** пайваст ба `NEXT_PUBLIC_API_URL` бо `io(url, { auth: { token } })`.
   - **Фиристодан:** `socket.emit('send_message', { receiverId, text })`
   - **Гӯш кардан:**
     - `'new_message'` (message) — паёми нав аз тарафи муқобил
     - `'message_sent'` (message) — тасдиқи паёми худ
     - `'user_typing'` `{ senderId, isTyping }` — «дар ҳоли навиштан…»
     - `'new_notification'` `{ title, content, createdAt }` — огоҳиномаи зинда (badge-ро нав кунед)
     - `'error_message'` `{ message }`
   - **Typing:** `socket.emit('typing', { receiverId, isTyping })`
3. Чат танҳо байни **BUYER ва SELLER** аст (Admin надорад). Auto-reply-и фурӯшанда худкор кор мекунад.

---

## 17. Саҳифаҳо (ҳама функсионалӣ)

**🛒 ХАРИДОР:** Асосӣ · Каталог (филтр+сортировкаи client-side) · Саҳифаи мол (вариант интихоб, ба сабад, шарҳ бо расм) · Сабад · Checkout (суроға+купон) · Фармоишҳо (ҳолат+refund) · Wishlist · Чат · Профил · Суроғаҳо · Огоҳиномаҳо · Мағоза · Вуруд/Бақайдгирӣ.

**🏪 ФУРӮШАНДА (`/seller`):** Dashboard (analytics+графикҳо) · Молҳо (CRUD бо вариант+расм) · Фармоишҳо (тағйири ҳолат) · Refund-ҳо (тасдиқ/рад) · Купонҳо · Шарҳҳо (ҷавоб) · Чат · Танзими мағоза (auto-reply).

**🛡️ МАЪМУР (`/admin`):** Dashboard · Корбарон (блок/разблок) · Шикоятҳо · Баҳсҳои refund · Купонҳо · Категория/бренд/ранг.

---

## 18. Талаботи техникӣ
- **API layer марказӣ:** як `lib/api.ts` (axios instance + interceptor-и token) ва функсияҳои ҷудогона барои ҳар модул. Ҳеҷ jo дар компонент URL-и хом нанависед.
- **Навъҳои TypeScript** барои ҳамаи модел ва ҷавобҳо (`types/`).
- **Cart ва Auth** ҳамчун store глобалӣ; badge-и сабад ва огоҳинома дар navbar зинда бошад.
- **Идоракунии хатоҳо:** toast барои паёмҳои хато/муваффақият (ҷавобҳо майдони `message` доранд).
- **Loading/empty/skeleton** ҳолатҳо.
- **Расмҳо:** ҳамеша `${API_URL}${url}`.
- **Валидатсия:** телефон `+992` + 9 рақам; парол ≥ 6; дар checkout суроға ҳатмӣ.
- Огоҳӣ: backend-и ройгон пас аз бекорӣ ~50 сония «бедор» мешавад — loading-и хубе гузоред.

## 19. Аз ту чӣ интизорам (тартиб)
1. Лоиҳаи **Next.js**-ро бо сохтори тоза бунёд кун: `app/`, `components/`, `lib/api.ts`, `lib/socket.ts`, `store/`, `types/`, `tailwind.config`.
2. Аввал: **системаи дизайн + auth (login/register) + layout/navbar + API instance + auth store**.
3. Баъд панели **Харидор** пурра (Асосӣ → Каталог → Мол → Сабад → Checkout → Фармоишҳо → Чат).
4. Баъд панели **Фурӯшанда**, баъд **Маъмур**.
5. Ҳама бо матнҳои тоҷикӣ, ба API-и воқеӣ пайваст, responsive ва люкс.

**Аз қадами 1 ва 2 оғоз кун (лоиҳа + auth + navbar + API layer). Баъд ман мегӯям кадомашро идома диҳем.**

> 🔑 Барои санҷиш: admin тайёр — email `admin@ecommerce.com`, парол `adminpassword` (агар seed иҷро шуда бошад).
