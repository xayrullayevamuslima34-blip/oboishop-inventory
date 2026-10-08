import { z } from "zod";
import { moneyOutputSchema, quantityOutputSchema } from "./money.js";

// Phase 6 — Hisobotlar + Dashboard. All period reports take an explicit
// [from, to] window filtered on the moment money/stock actually moved
// (document confirmedAt / cash_transactions.createdAt), not the
// user-entered business date, so a report always matches the ledgers it's
// derived from. Business indicators (used by the dashboard) are a
// point-in-time snapshot instead — no period.

export const reportPeriodQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;

// ---------- Sotuv trendi (kunlik, grafik uchun) ----------

export const salesTrendPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  revenue: moneyOutputSchema,
  qty: quantityOutputSchema,
});
export type SalesTrendPoint = z.infer<typeof salesTrendPointSchema>;

export const salesTrendSchema = z.array(salesTrendPointSchema);
export type SalesTrend = z.infer<typeof salesTrendSchema>;

// ---------- Sotuv hisoboti ----------

export const salesReportRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  qty: quantityOutputSchema,
  revenue: moneyOutputSchema,
});
export type SalesReportRow = z.infer<typeof salesReportRowSchema>;

export const salesReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  documentCount: z.number(),
  totalQty: quantityOutputSchema,
  totalRevenue: moneyOutputSchema,
  byProduct: z.array(salesReportRowSchema),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

// ---------- Foyda (tan-narx) hisoboti ----------

export const profitReportRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  qty: quantityOutputSchema,
  revenue: moneyOutputSchema,
  costOfGoods: moneyOutputSchema,
  profit: moneyOutputSchema,
});
export type ProfitReportRow = z.infer<typeof profitReportRowSchema>;

export const profitReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenue: moneyOutputSchema,
  costOfGoods: moneyOutputSchema,
  grossProfit: moneyOutputSchema,
  byProduct: z.array(profitReportRowSchema),
});
export type ProfitReport = z.infer<typeof profitReportSchema>;

// ---------- Ombor qiymati (joriy holat, davrsiz) ----------

export const stockValuationRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  qtyOnHand: quantityOutputSchema,
  valuation: moneyOutputSchema,
});
export type StockValuationRow = z.infer<typeof stockValuationRowSchema>;

export const stockValuationReportSchema = z.object({
  asOf: z.string(),
  totalValuation: moneyOutputSchema,
  items: z.array(stockValuationRowSchema),
});
export type StockValuationReport = z.infer<typeof stockValuationReportSchema>;

// ---------- Davr bo'yicha umumiy hisobot (P&L + naqd oqimi) ----------

export const periodReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  salesRevenue: moneyOutputSchema,
  costOfGoods: moneyOutputSchema,
  grossProfit: moneyOutputSchema,
  totalExpenses: moneyOutputSchema,
  netProfit: moneyOutputSchema,
  cashIn: moneyOutputSchema,
  cashOut: moneyOutputSchema,
  netCashFlow: moneyOutputSchema,
});
export type PeriodReport = z.infer<typeof periodReportSchema>;

// ---------- Biznes-indikatorlar (Dashboard, real vaqtda) ----------

export const lowStockItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  qtyOnHand: quantityOutputSchema,
  minStockThreshold: quantityOutputSchema,
});
export type LowStockItem = z.infer<typeof lowStockItemSchema>;

export const businessIndicatorsSchema = z.object({
  asOf: z.string(),
  stockValuation: moneyOutputSchema,
  cashBalance: moneyOutputSchema,
  // Faqat bizning qarzimiz (manfiy kontragent balanslari yig'indisi, musbat
  // son sifatida) — mijozlarning bizga qarzi aktiv sifatida qo'shilmaydi,
  // rejadagi "umumiy balans" formulasi konservativ hisoblanadi.
  ourDebtToSuppliers: moneyOutputSchema,
  customerDebtToUs: moneyOutputSchema,
  netBalance: moneyOutputSchema,
  todaySalesRevenue: moneyOutputSchema,
  todayTransactionCount: z.number(),
  lowStockItems: z.array(lowStockItemSchema),
});
export type BusinessIndicators = z.infer<typeof businessIndicatorsSchema>;

// ---------- Mahsulot faolligi: sotilmay qolgan / zarariga sotilgan ----------

export const deadStockRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  qtyOnHand: quantityOutputSchema,
  valuation: moneyOutputSchema,
});
export type DeadStockRow = z.infer<typeof deadStockRowSchema>;

export const soldAtLossRowSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  qty: quantityOutputSchema,
  revenue: moneyOutputSchema,
  costOfGoods: moneyOutputSchema,
  // Har doim musbat son — zarar miqdori (costOfGoods - revenue).
  loss: moneyOutputSchema,
});
export type SoldAtLossRow = z.infer<typeof soldAtLossRowSchema>;

export const productActivityReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  deadStock: z.array(deadStockRowSchema),
  soldAtLoss: z.array(soldAtLossRowSchema),
});
export type ProductActivityReport = z.infer<typeof productActivityReportSchema>;
