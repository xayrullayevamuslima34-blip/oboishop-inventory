import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  BusinessIndicators,
  PeriodReport,
  ProductActivityReport,
  ProfitReport,
  SalesReport,
  SalesTrend,
  StockValuationReport,
} from "@oboishop/shared";
import { toApiJson } from "../lib/serialize.js";
import * as cashBoxService from "./cashBoxService.js";

// All period reports filter on the moment money/stock actually moved
// (document confirmedAt / cash_transactions.createdAt) — not the
// user-entered business date — so a report always reconciles exactly
// against the ledgers it's derived from. See docs/ARCHITECTURE.md.

async function getSaleItemsInPeriod(prisma: PrismaClient, from: Date, to: Date) {
  return prisma.stockOutDocumentItem.findMany({
    where: {
      document: { docType: "SALE", status: "CONFIRMED", confirmedAt: { gte: from, lte: to } },
    },
    select: {
      documentId: true,
      productId: true,
      qty: true,
      lineTotal: true,
      costOfGoodsTotal: true,
      product: { select: { name: true } },
      document: { select: { confirmedAt: true } },
    },
  });
}

/** Kunlik savdo trendi — Hisobotlar sahifasidagi chiziqli grafik uchun.
 * Kunlar `document.confirmedAt` (server local date, YYYY-MM-DD) bo'yicha
 * guruhlanadi — boshqa barcha davr hisobotlari bilan bir xil "haqiqiy
 * tasdiqlangan vaqt" prinsipi. */
export async function getSalesTrend(prisma: PrismaClient, from: Date, to: Date): Promise<SalesTrend> {
  const items = await getSaleItemsInPeriod(prisma, from, to);

  const byDay = new Map<string, { revenue: bigint; qty: Prisma.Decimal }>();
  for (const item of items) {
    const day = (item.document.confirmedAt ?? new Date()).toISOString().slice(0, 10);
    const row = byDay.get(day) ?? { revenue: 0n, qty: new Prisma.Decimal(0) };
    row.revenue += item.lineTotal ?? 0n;
    row.qty = row.qty.plus(item.qty);
    byDay.set(day, row);
  }

  return toApiJson(
    [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, revenue: row.revenue, qty: row.qty.toString() })),
  ) as SalesTrend;
}

export async function getSalesReport(prisma: PrismaClient, from: Date, to: Date): Promise<SalesReport> {
  const items = await getSaleItemsInPeriod(prisma, from, to);

  const byProduct = new Map<string, { productName: string; qty: Prisma.Decimal; revenue: bigint }>();
  const documentIds = new Set<string>();
  let totalRevenue = 0n;
  let totalQty = new Prisma.Decimal(0);

  for (const item of items) {
    documentIds.add(item.documentId);
    const revenue = item.lineTotal ?? 0n;
    totalQty = totalQty.plus(item.qty);
    totalRevenue += revenue;

    const row = byProduct.get(item.productId) ?? { productName: item.product.name, qty: new Prisma.Decimal(0), revenue: 0n };
    row.qty = row.qty.plus(item.qty);
    row.revenue += revenue;
    byProduct.set(item.productId, row);
  }

  return toApiJson({
    from: from.toISOString(),
    to: to.toISOString(),
    documentCount: documentIds.size,
    totalQty: totalQty.toString(),
    totalRevenue,
    byProduct: [...byProduct.entries()]
      .map(([productId, row]) => ({ productId, ...row, qty: row.qty.toString() }))
      .sort((a, b) => (b.revenue > a.revenue ? 1 : -1)),
  }) as SalesReport;
}

export async function getProfitReport(prisma: PrismaClient, from: Date, to: Date): Promise<ProfitReport> {
  const items = await getSaleItemsInPeriod(prisma, from, to);

  const byProduct = new Map<string, { productName: string; qty: Prisma.Decimal; revenue: bigint; costOfGoods: bigint }>();
  let revenue = 0n;
  let costOfGoods = 0n;

  for (const item of items) {
    const lineRevenue = item.lineTotal ?? 0n;
    const lineCost = item.costOfGoodsTotal ?? 0n;
    revenue += lineRevenue;
    costOfGoods += lineCost;

    const row = byProduct.get(item.productId) ?? {
      productName: item.product.name,
      qty: new Prisma.Decimal(0),
      revenue: 0n,
      costOfGoods: 0n,
    };
    row.qty = row.qty.plus(item.qty);
    row.revenue += lineRevenue;
    row.costOfGoods += lineCost;
    byProduct.set(item.productId, row);
  }

  return toApiJson({
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    costOfGoods,
    grossProfit: revenue - costOfGoods,
    byProduct: [...byProduct.entries()]
      .map(([productId, row]) => ({ productId, ...row, qty: row.qty.toString(), profit: row.revenue - row.costOfGoods }))
      .sort((a, b) => (b.profit > a.profit ? 1 : -1)),
  }) as ProfitReport;
}

async function computeStockValuation(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<
    { product_id: string; name: string; sku: string; qty_on_hand: string; valuation: string }[]
  >`
    SELECT b.product_id, p.name, p.sku, SUM(b.qty_remaining)::text AS qty_on_hand,
      ROUND(SUM(b.qty_remaining * b.purchase_price))::bigint::text AS valuation
    FROM batches b
    JOIN products p ON p.id = b.product_id
    WHERE b.qty_remaining > 0
    GROUP BY b.product_id, p.name, p.sku
    ORDER BY p.name ASC
  `;
  const totalValuation = rows.reduce((sum, r) => sum + BigInt(r.valuation), 0n);
  return { rows, totalValuation };
}

export async function getStockValuationReport(prisma: PrismaClient): Promise<StockValuationReport> {
  const { rows, totalValuation } = await computeStockValuation(prisma);
  return toApiJson({
    asOf: new Date().toISOString(),
    totalValuation,
    items: rows.map((r) => ({
      productId: r.product_id,
      productName: r.name,
      sku: r.sku,
      // NUMERIC(12,3)::text keeps Postgres's fixed 3-decimal formatting
      // ("4.000"); re-parse through Decimal so this matches how quantities
      // are formatted everywhere else in the API (trailing zeros trimmed).
      qtyOnHand: new Prisma.Decimal(r.qty_on_hand).toString(),
      valuation: r.valuation,
    })),
  }) as StockValuationReport;
}

export async function getPeriodReport(prisma: PrismaClient, from: Date, to: Date): Promise<PeriodReport> {
  const [saleItems, cashInAgg, cashOutAgg, expensesAgg] = await Promise.all([
    getSaleItemsInPeriod(prisma, from, to),
    prisma.cashTransaction.aggregate({ where: { createdAt: { gte: from, lte: to }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.cashTransaction.aggregate({ where: { createdAt: { gte: from, lte: to }, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.cashTransaction.aggregate({
      where: { type: "EXPENSE", createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const salesRevenue = saleItems.reduce((sum, i) => sum + (i.lineTotal ?? 0n), 0n);
  const costOfGoods = saleItems.reduce((sum, i) => sum + (i.costOfGoodsTotal ?? 0n), 0n);
  const grossProfit = salesRevenue - costOfGoods;
  const totalExpenses = -(expensesAgg._sum.amount ?? 0n);
  const netProfit = grossProfit - totalExpenses;
  const cashIn = cashInAgg._sum.amount ?? 0n;
  const cashOut = -(cashOutAgg._sum.amount ?? 0n);

  return toApiJson({
    from: from.toISOString(),
    to: to.toISOString(),
    salesRevenue,
    costOfGoods,
    grossProfit,
    totalExpenses,
    netProfit,
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,
  }) as PeriodReport;
}

export async function getBusinessIndicators(prisma: PrismaClient): Promise<BusinessIndicators> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const now = new Date();

  const [{ totalValuation }, cashBalance, contragentSums, lowStockRows, todaySaleItems] = await Promise.all([
    computeStockValuation(prisma),
    cashBoxService.getBalance(prisma),
    prisma.contragentLedgerEntry.groupBy({ by: ["contragentId"], _sum: { amount: true } }),
    // Column-to-column comparison (qty_on_hand <= min_stock_threshold) isn't
    // expressible through Prisma's query API, hence raw SQL here.
    prisma.$queryRaw<
      { product_id: string; name: string; sku: string; qty_on_hand: string; min_stock_threshold: string }[]
    >`
      SELECT b.product_id, p.name, p.sku, b.qty_on_hand::text, p.min_stock_threshold::text
      FROM product_stock_balance b
      JOIN products p ON p.id = b.product_id
      WHERE p.is_active = true AND p.min_stock_threshold IS NOT NULL AND b.qty_on_hand <= p.min_stock_threshold
      ORDER BY p.name ASC
    `,
    getSaleItemsInPeriod(prisma, startOfToday, now),
  ]);

  let ourDebtToSuppliers = 0n;
  let customerDebtToUs = 0n;
  for (const row of contragentSums) {
    const balance = row._sum.amount ?? 0n;
    if (balance < 0n) ourDebtToSuppliers += -balance;
    else customerDebtToUs += balance;
  }

  const netBalance = totalValuation + cashBalance - ourDebtToSuppliers;

  const todaySalesRevenue = todaySaleItems.reduce((sum, i) => sum + (i.lineTotal ?? 0n), 0n);
  const todayDocumentIds = new Set(todaySaleItems.map((i) => i.documentId));

  return toApiJson({
    asOf: now.toISOString(),
    stockValuation: totalValuation,
    cashBalance,
    ourDebtToSuppliers,
    customerDebtToUs,
    netBalance,
    todaySalesRevenue,
    todayTransactionCount: todayDocumentIds.size,
    lowStockItems: lowStockRows.map((r) => ({
      productId: r.product_id,
      productName: r.name,
      sku: r.sku,
      qtyOnHand: new Prisma.Decimal(r.qty_on_hand).toString(),
      minStockThreshold: new Prisma.Decimal(r.min_stock_threshold).toString(),
    })),
  }) as BusinessIndicators;
}

/** "Kutilayotgan to'lovlar" — hozirgi (davrsiz) nolga teng bo'lmagan
 * kontragent balanslari, ikki yo'nalishga ajratilgan. Muddat (due date)
 * tushunchasi tizimda hozircha yo'q — bu hippo.uz'dagi funksiyaning sodda,
 * "kim kimga qancha qarz" muqobili. */
export async function getProductActivityReport(prisma: PrismaClient, from: Date, to: Date): Promise<ProductActivityReport> {
  const [saleItems, inStockRows] = await Promise.all([
    getSaleItemsInPeriod(prisma, from, to),
    prisma.$queryRaw<{ product_id: string; name: string; sku: string; qty_on_hand: string; valuation: string }[]>`
      SELECT b.product_id, p.name, p.sku, SUM(b.qty_remaining)::text AS qty_on_hand,
        ROUND(SUM(b.qty_remaining * b.purchase_price))::bigint::text AS valuation
      FROM batches b
      JOIN products p ON p.id = b.product_id
      WHERE b.qty_remaining > 0 AND p.is_active = true
      GROUP BY b.product_id, p.name, p.sku
      ORDER BY p.name ASC
    `,
  ]);

  const soldProductIds = new Set(saleItems.map((i) => i.productId));
  const deadStock = inStockRows
    .filter((r) => !soldProductIds.has(r.product_id))
    .map((r) => ({
      productId: r.product_id,
      productName: r.name,
      sku: r.sku,
      qtyOnHand: new Prisma.Decimal(r.qty_on_hand).toString(),
      valuation: r.valuation,
    }));

  const byProduct = new Map<string, { productName: string; qty: Prisma.Decimal; revenue: bigint; costOfGoods: bigint }>();
  for (const item of saleItems) {
    const row = byProduct.get(item.productId) ?? {
      productName: item.product.name,
      qty: new Prisma.Decimal(0),
      revenue: 0n,
      costOfGoods: 0n,
    };
    row.qty = row.qty.plus(item.qty);
    row.revenue += item.lineTotal ?? 0n;
    row.costOfGoods += item.costOfGoodsTotal ?? 0n;
    byProduct.set(item.productId, row);
  }

  const soldAtLoss = [...byProduct.entries()]
    .filter(([, row]) => row.costOfGoods > row.revenue)
    .map(([productId, row]) => ({
      productId,
      productName: row.productName,
      qty: row.qty.toString(),
      revenue: row.revenue,
      costOfGoods: row.costOfGoods,
      loss: row.costOfGoods - row.revenue,
    }))
    .sort((a, b) => (a.loss > b.loss ? -1 : 1));

  return toApiJson({ from: from.toISOString(), to: to.toISOString(), deadStock, soldAtLoss }) as ProductActivityReport;
}
