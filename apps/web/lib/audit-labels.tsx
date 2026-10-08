"use client";

import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";

// Faoliyat tarixi ilgari xom holda ko'rsatilardi ("stock_out — create_draft",
// "StockOutDocument", JSON). Do'kon xodimi uchun bu tushunarsiz — shu sabab
// bu yerda hamma texnik nom oddiy o'zbekchaga o'giriladi.

const ACTION_LABEL: Record<string, string> = {
  "product.create": "Mahsulot qo'shildi",
  "product.update": "Mahsulot o'zgartirildi",
  "product.deactivate": "Mahsulot o'chirildi",
  "product.image_upload": "Mahsulot rasmi yuklandi",
  "product.image_delete": "Mahsulot rasmi o'chirildi",
  "product.stock_add": "Omborga qoldiq qo'shildi",

  "contragent.create": "Mijoz qo'shildi",
  "contragent.update": "Mijoz ma'lumoti o'zgartirildi",
  "contragent.deactivate": "Mijoz o'chirildi",

  "cash_box.sale_income": "Kassaga sotuvdan pul tushdi",
  "cash_box.manual_income": "Kassaga qo'lda pul kiritildi",
  "cash_box.expense": "Kassadan xarajat chiqdi",
  "cash_box.cancel_reversal": "Kassadagi summa qaytarildi",

  "contragent_ledger.invoice": "Mijoz hisobiga qarz yozildi",
  "contragent_ledger.payment": "Mijozdan to'lov qabul qilindi",
  "contragent_ledger.prepayment": "Mijozdan oldindan to'lov olindi",
  "contragent_ledger.adjustment": "Mijoz balansi qo'lda to'g'rilandi",
  "contragent_ledger.cancel_reversal": "Mijoz hisobidagi yozuv bekor qilindi",

  "stock_in.create_draft": "Kirim qoralamasi yaratildi",
  "stock_in.confirm": "Kirim tasdiqlandi",
  "stock_in.cancel": "Kirim bekor qilindi",
  "stock_in.delete_draft": "Kirim qoralamasi o'chirildi",

  "inventory_count.create_draft": "Reviziya boshlandi",
  "inventory_count.confirm": "Reviziya tasdiqlandi",
  "inventory_count.cancel": "Reviziya bekor qilindi",
  "inventory_count.delete_draft": "Reviziya qoralamasi o'chirildi",

  "expense_category.create": "Xarajat turi qo'shildi",
  "expense_category.deactivate": "Xarajat turi o'chirildi",
  "tag.create": "Teg qo'shildi",
  "tag.delete": "Teg o'chirildi",
  "shop_settings.update": "Do'kon sozlamalari o'zgartirildi",
  "user.change_password": "Parol o'zgartirildi",
  "user.update_profile": "Profil ma'lumoti o'zgartirildi",
};

// Chiqim hujjati bir necha maqsadda ishlatiladi — sotuv, qaytaruv,
// hisobdan chiqarish. Xodimga qaysi biri ekani muhim, shuning uchun
// hujjat turiga qarab aniqroq yozamiz.
const STOCK_OUT_KIND: Record<string, string> = {
  SALE: "Sotuv",
  CUSTOMER_RETURN: "Mijozdan qaytaruv",
  RETURN_TO_SUPPLIER: "Yetkazib beruvchiga qaytaruv",
  WRITEOFF: "Hisobdan chiqarish",
};

const STOCK_OUT_VERB: Record<string, string> = {
  update: "ma'lumoti tahrirlandi",
  items_update: "tarkibi tahrirlandi",
  create_draft: "qoralamasi yaratildi",
  confirm: "tasdiqlandi",
  cancel: "bekor qilindi",
  delete_draft: "qoralamasi o'chirildi",
};

const ENTITY_LABEL: Record<string, string> = {
  Product: "Mahsulot",
  Contragent: "Mijoz",
  CashTransaction: "Kassa amali",
  ContragentLedgerEntry: "Mijoz hisobi",
  StockOutDocument: "Sotuv/chiqim hujjati",
  StockInDocument: "Kirim hujjati",
  InventoryCount: "Reviziya",
  ExpenseCategory: "Xarajat turi",
  ShopSetting: "Do'kon sozlamasi",
  Tag: "Teg",
  User: "Foydalanuvchi",
  System: "Tizim",
};

function readDocType(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>).docType;
  return typeof value === "string" ? value : null;
}

export function describeAction(action: string, beforeData?: unknown, afterData?: unknown): string {
  if (action.startsWith("stock_out.")) {
    const verb = action.split(".")[1] ?? "";
    const docType = readDocType(afterData) ?? readDocType(beforeData);
    const kind = (docType && STOCK_OUT_KIND[docType]) ?? "Chiqim";
    return `${kind} ${STOCK_OUT_VERB[verb] ?? verb}`;
  }
  return ACTION_LABEL[action] ?? action;
}

export function describeEntity(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType;
}

// ---------- "Batafsil" bo'limidagi maydonlar ----------

const FIELD_LABEL: Record<string, string> = {
  name: "Nomi",
  sku: "Artikul",
  barcode: "Shtrix-kod",
  type: "Turi",
  unit: "O'lchov birligi",
  qty: "Miqdor",
  qtyOnHand: "Qoldiq",
  qtyReceived: "Kelgan miqdor",
  qtyRemaining: "Qolgan miqdor",
  salePrice: "Sotuv narxi",
  unitCost: "Tan narxi",
  lineTotal: "Qator summasi",
  totalAmount: "Umumiy summa",
  amount: "Summa",
  defaultSalePrice: "Chakana narx",
  wholesalePrice: "Ulgurji narx",
  purchasePrice: "Kirim narxi",
  purchaseCurrency: "Valyuta",
  minStockThreshold: "Minimal qoldiq",
  packName: "Qadoq nomi",
  packSize: "Qadoqdagi miqdor",
  docNumber: "Hujjat raqami",
  batchNumber: "Partiya raqami",
  docType: "Hujjat turi",
  status: "Holati",
  entryType: "Yozuv turi",
  direction: "Yo'nalishi",
  documentDate: "Hujjat sanasi",
  receivedAt: "Kelgan sana",
  createdAt: "Yaratilgan",
  updatedAt: "O'zgartirilgan",
  confirmedAt: "Tasdiqlangan",
  cancelledAt: "Bekor qilingan",
  cancelReason: "Bekor qilish sababi",
  note: "Izoh",
  phone: "Telefon",
  address: "Manzil",
  isActive: "Faol",
  imageUrl: "Rasm",
  contragentName: "Mijoz",
  fullName: "To'liq ismi",
  username: "Login",
  items: "Mahsulotlar",
};

// Ichki identifikatorlar xodimga hech narsa bermaydi — yashiramiz.
const HIDDEN = new Set([
  "id",
  "productId",
  "batchId",
  "contragentId",
  "supplierId",
  "createdBy",
  "confirmedBy",
  "cancelledBy",
  "expenseCategoryId",
  "referenceDocumentId",
  "referenceDocumentType",
  "tagIds",
  "allocations",
  "product",
  "userId",
]);

const MONEY_FIELDS = new Set([
  "salePrice",
  "unitCost",
  "lineTotal",
  "totalAmount",
  "amount",
  "defaultSalePrice",
  "wholesalePrice",
  "purchasePrice",
  "avgCost",
]);

const QTY_FIELDS = new Set(["qty", "qtyOnHand", "qtyReceived", "qtyRemaining", "minStockThreshold", "packSize"]);

const DATE_FIELDS = new Set(["documentDate", "receivedAt", "createdAt", "updatedAt", "confirmedAt", "cancelledAt"]);

const ENUM_LABEL: Record<string, string> = {
  DRAFT: "Qoralama",
  CONFIRMED: "Tasdiqlangan",
  CANCELLED: "Bekor qilingan",
  SALE: "Sotuv",
  CUSTOMER_RETURN: "Mijozdan qaytaruv",
  RETURN_TO_SUPPLIER: "Yetkazib beruvchiga qaytaruv",
  WRITEOFF: "Hisobdan chiqarish",
  RULON: "Rulon",
  DONA: "Dona",
  METR: "Metr",
  CUSTOMER: "Mijoz",
  SUPPLIER: "Yetkazib beruvchi",
  BOTH: "Mijoz + Yetkazib beruvchi",
  VINIL: "Vinil",
  FLIZELIN: "Flizelin",
  BOSHQA: "Boshqa",
  SALE_INCOME: "Sotuvdan kirim",
  MANUAL_INCOME: "Qo'lda kirim",
  EXPENSE: "Xarajat",
  CANCEL_REVERSAL: "Bekor qilish",
  PAYMENT: "To'lov",
  PREPAYMENT: "Oldindan to'lov",
  ADJUSTMENT: "To'g'rilash",
  INVOICE: "Hisob-faktura",
  IN: "Kirim",
  OUT: "Chiqim",
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  if (MONEY_FIELDS.has(key)) return formatMoney(String(value));
  if (QTY_FIELDS.has(key)) return formatQuantity(String(value));
  if (DATE_FIELDS.has(key)) return formatDateTime(String(value));
  if (typeof value === "string" && ENUM_LABEL[value]) return ENUM_LABEL[value];
  if (Array.isArray(value)) return `${value.length} ta`;
  if (typeof value === "object") return "—";
  return String(value);
}

export interface AuditField {
  label: string;
  value: string;
}

/** Hujjatdagi mahsulot qatorlarini "Nomi × miqdor — summa" ko'rinishida beradi. */
export function extractItems(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];

  return items.map((raw) => {
    const item = raw as Record<string, unknown>;
    const product = item.product as Record<string, unknown> | undefined;
    const name = (product?.name as string) ?? (item.productName as string) ?? "Mahsulot";
    const qty = item.qty !== undefined ? formatQuantity(String(item.qty)) : "";
    const total = item.lineTotal ? formatMoney(String(item.lineTotal)) : "";
    return [name, qty && `× ${qty}`, total && `— ${total}`].filter(Boolean).join(" ");
  });
}

/** JSON'ni xodim o'qiy oladigan "maydon → qiymat" ro'yxatiga aylantiradi. */
export function toReadableFields(data: unknown): AuditField[] {
  if (!data || typeof data !== "object") return [];

  const fields: AuditField[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (HIDDEN.has(key)) continue;
    if (key === "items") continue; // alohida ro'yxat sifatida ko'rsatiladi
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) continue;
    fields.push({ label: FIELD_LABEL[key] ?? key, value: formatValue(key, value) });
  }
  return fields;
}
