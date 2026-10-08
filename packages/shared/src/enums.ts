// Central place for enums shared between the API (Prisma) and the web app.
// Keep these in sync with apps/api/prisma/schema.prisma.

export const UserRole = {
  SKLAD_MENEJERI: "SKLAD_MENEJERI",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ContragentType = {
  CUSTOMER: "CUSTOMER",
  SUPPLIER: "SUPPLIER",
  BOTH: "BOTH",
} as const;
export type ContragentType = (typeof ContragentType)[keyof typeof ContragentType];

export const BaseMaterial = {
  VINIL: "VINIL",
  FLIZELIN: "FLIZELIN",
  BOSHQA: "BOSHQA",
} as const;
export type BaseMaterial = (typeof BaseMaterial)[keyof typeof BaseMaterial];

export const ProductUnit = {
  RULON: "RULON",
  DONA: "DONA",
  METR: "METR",
} as const;
export type ProductUnit = (typeof ProductUnit)[keyof typeof ProductUnit];

export const DocumentStatus = {
  DRAFT: "DRAFT",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

// Hippo'da alohida bo'limlar (Sotuvlar/Qaytaruvlar/Yetkazib beruvchiga
// qaytaruvlar/Hisobdan chiqarishlar) shu bitta polimorfik hujjat turiga
// tushadi — qarang apps/api/prisma/schema.prisma.
export const StockOutDocType = {
  SALE: "SALE",
  CUSTOMER_RETURN: "CUSTOMER_RETURN",
  RETURN_TO_SUPPLIER: "RETURN_TO_SUPPLIER",
  WRITEOFF: "WRITEOFF",
} as const;
export type StockOutDocType = (typeof StockOutDocType)[keyof typeof StockOutDocType];

// Balans ishorasi: musbat = kontragent bizga qarzdor; manfiy = biz
// kontragentga qarzdormiz. Har entryType uchun ishora backend'da qat'iy
// belgilanadi (ADJUSTMENT bundan mustasno) — qarang apps/api/src/services/contragentLedgerService.ts.
export const LedgerEntryType = {
  INVOICE: "INVOICE",
  PAYMENT: "PAYMENT",
  PREPAYMENT: "PREPAYMENT",
  ADJUSTMENT: "ADJUSTMENT",
  CANCEL_REVERSAL: "CANCEL_REVERSAL",
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const LedgerDirection = {
  // Biz to'ladik / berdik (bizning qarzimiz kamayadi / ularniki bizga oshadi).
  OUT: "OUT",
  // Biz oldik / qabul qildik (ularning bizga qarzi kamayadi).
  IN: "IN",
} as const;
export type LedgerDirection = (typeof LedgerDirection)[keyof typeof LedgerDirection];

export const CashTransactionType = {
  SALE_INCOME: "SALE_INCOME",
  MANUAL_INCOME: "MANUAL_INCOME",
  EXPENSE: "EXPENSE",
  CANCEL_REVERSAL: "CANCEL_REVERSAL",
} as const;
export type CashTransactionType = (typeof CashTransactionType)[keyof typeof CashTransactionType];

export const MovementType = {
  STOCK_IN: "STOCK_IN",
  SALE: "SALE",
  WRITEOFF: "WRITEOFF",
  RETURN_TO_SUPPLIER: "RETURN_TO_SUPPLIER",
  CUSTOMER_RETURN: "CUSTOMER_RETURN",
  CANCEL_REVERSAL: "CANCEL_REVERSAL",
  INVENTORY_ADJ_PLUS: "INVENTORY_ADJ_PLUS",
  INVENTORY_ADJ_MINUS: "INVENTORY_ADJ_MINUS",
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];
