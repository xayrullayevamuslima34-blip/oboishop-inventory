# Arxitektura qarorlari

Bu hujjat loyihaning asosiy dizayn qarorlarini va sabablarini qayd etadi — kod bazasiga yangi qo'shiladigan har bir bo'lim shu qoidalarga rioya qilishi kerak.

## Pul

- Barcha pul maydonlari Postgres'da **`BIGINT`** (butun so'm). Hech qachon `FLOAT`/`DOUBLE` ishlatilmaydi.
- Prisma `BigInt` qaytaradi, bu `JSON.stringify` bilan to'g'ridan-to'g'ri ishlamaydi — shuning uchun barcha API javoblari `src/lib/serialize.ts#toApiJson` orqali o'tadi va pul maydonlari **string** sifatida chiqadi.
- Frontend pul maydonlarini hech qachon API'ga qaytarish uchun JS `number`ga aylantirmaydi — faqat ko'rsatish uchun (`lib/format.ts#formatMoney`).
- Kirim inputlari `packages/shared/src/schemas/money.ts#moneyInputSchema` orqali validatsiya qilinadi: butun, manfiy bo'lmagan son.

## Miqdor

- `NUMERIC(12,3)` — hozircha rulonlar doim butun, lekin kelajakda metr/qism bo'lib sotilishi mumkinligini hisobga olib 3 kasr xona qoldirilgan.

## Hujjat holati (kirim/chiqim/reviziya — Phase 2+)

- `draft → confirmed → cancelled`. Qoldiq/pul faqat **confirm**da o'zgaradi.
- **Cancel hech qachon o'chirmaydi** — teskari (compensating) yozuv yaratiladi, shu orqali FIFO tarixi va audit trail buzilmaydi.

## Soft delete

- Moliyaviy jarayonlarda ishtirok etishi mumkin bo'lgan hech narsa hard-delete qilinmaydi (`products`, `categories`, `brands`, `contragents`) — `isActive=false`. Faqat `tags` kabi hech qanday moliyaviy bog'liqligi yo'q jadvallar hard-delete qilinadi.
- Foreign key'lar `onDelete: Restrict` — moliyaviy yozuv bilan bog'liq master-data yozuvini o'chirib bo'lmaydi.

## Auth

- JWT, yagona rol (`SKLAD_MENEJERI`) v1'da. Har bir route `fastify.requireRole(...)` orqali o'tadi (hozircha bo'sh — hech kimni cheklamaydi), shu orqali kelajakda yangi rol qo'shish bitta qatordan iborat bo'ladi.
- Token cookie (`oboishop_token`) **httpOnly emas** — bitta ichki foydalanuvchi, uchinchi tomon skriptlari yo'q loyiha uchun ongli soddalashtirish (`apps/web/lib/session.ts`da izohlangan). Loyiha ochiq/ko'p foydalanuvchili bo'lib qolsa, bu qarorni qayta ko'rib chiqish kerak.

## Audit

- Har bir moliyaviy create/update/confirm/cancel `audit_log`ga yoziladi (`src/lib/audit.ts#writeAuditLog`), bir xil DB tranzaksiyasi ichida.

## FIFO (Phase 2 dan boshlab)

- Chiqim confirm bo'lganda partiyalar `received_at ASC` bo'yicha `SELECT ... FOR UPDATE` bilan qulflanadi, eng eskisidan boshlab taqsimlanadi.
- Yetarli qoldiq bo'lmasa — butun tranzaksiya bekor qilinadi (qisman taqsimot yo'q), 409 xatolik.
- Har bir taqsimot alohida yoziladi (`stock_out_allocations`) — to'liq audit qilinadigan va qaytariladigan.

## Ilova ichidagi bildirishnomalar

- Avval Telegram-bot integratsiyasi bor edi (admin uchun tashqi push-xabar); loyiha egasi ongli ravishda soddaroq, faqat ilova ichidagi yechimni tanladi — tashqi bot/token/xizmat shart emas.
- Faqat "harakat kerak" turdagi hodisalar uchun yoziladi (kam qoldiq, qarz limiti) — menejer o'zi qilgan har bir kirim/chiqim uchun o'z-o'ziga bildirishnoma kelmaydi, bu shunchaki shovqin bo'lardi.
- `notifications` jadvali (`src/lib/notifications.ts#createNotification`) — DB'ga to'g'ridan-to'g'ri yoziladi, tashqi tarmoq chaqiruvi yo'q, shuning uchun tranzaksiya ichidan ham xavfsiz chaqiriladi.
- Kam qoldiq ogohlantirishi faqat mahsulot chegaradan **shu operatsiyada** pastga o'tganda yaratiladi (`lib/stock-balance.ts#findLowStockCrossings`) — aks holda allaqachon kam qoldiqli mahsulot har sotilganda qayta-qayta bildirishnoma kelaverardi.
- Xuddi shu "crossing" naqshi kontragent qarz limiti uchun ham qo'llanadi (`contragentLedgerService.ts#notifyDebtThresholdCrossing`, `DEBT_ALERT_THRESHOLD`) — balans allaqachon limitdan oshgan bo'lsa, keyingi har bir yozuvda qayta bildirishnoma kelmaydi.
- Frontend: header'dagi qo'ng'iroq belgisi (`components/notification-bell.tsx`) — o'qilmagan sanoq 30 soniyada bir yangilanadi, bosilganda ro'yxat ochiladi, bosilgan bildirishnoma o'qilgan deb belgilanadi va tegishli mahsulot/kontragentga o'tkazadi.

