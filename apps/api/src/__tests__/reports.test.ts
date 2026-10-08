import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Phase 6 — Hisobotlar + Dashboard. Reports are derived, read-only views
// over ledgers already covered by earlier phases' tests, so these tests
// focus on the aggregation/period-filtering logic itself rather than
// re-proving FIFO/ledger correctness.
describe("reports", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "menejer", password: "sklad12345" },
    });
    token = loginRes.json().token;
  });

  afterAll(async () => {
    await app.close();
  });

  function auth() {
    return { authorization: `Bearer ${token}` };
  }

  function period(minutesAgo = 5) {
    const from = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }

  async function createProduct(namePrefix: string, minStockThreshold?: number) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      // sku max length is 40 — truncate the prefix so descriptive test names
      // can never push the generated SKU over that (see other test files).
      payload: {
        sku: `${namePrefix.slice(0, 15)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: namePrefix,
        minStockThreshold,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function createSupplier() {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contragents",
      headers: auth(),
      payload: { name: `Report-Supplier-${Date.now()}`, type: "SUPPLIER" },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function stockIn(productId: string, qty: number, purchasePrice: number, supplierId?: string) {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: supplierId ?? null,
        documentDate: new Date().toISOString(),
        items: [{ productId, qty, purchasePrice }],
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-in/${draftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(confirmRes.statusCode).toBe(200);
  }

  async function sale(productId: string, qty: number, salePrice: number) {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType: "SALE",
        contragentId: null,
        documentDate: new Date().toISOString(),
        items: [{ productId, qty, salePrice }],
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-out/${draftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(confirmRes.statusCode).toBe(200);
    return draftRes.json() as { id: string };
  }

  it("sales + profit reports aggregate a SALE within the period and exclude it outside", async () => {
    const product = await createProduct("Hisobot-sotuv");
    await stockIn(product.id, 10, 1000);
    await sale(product.id, 4, 2500);

    const salesRes = await app.inject({ method: "GET", url: `/api/v1/reports/sales?${period()}`, headers: auth() });
    expect(salesRes.statusCode).toBe(200);
    const salesReport = salesRes.json();
    const salesRow = salesReport.byProduct.find((r: { productId: string }) => r.productId === product.id);
    expect(salesRow.qty).toBe("4");
    expect(salesRow.revenue).toBe("10000");

    const profitRes = await app.inject({ method: "GET", url: `/api/v1/reports/profit?${period()}`, headers: auth() });
    expect(profitRes.statusCode).toBe(200);
    const profitReport = profitRes.json();
    const profitRow = profitReport.byProduct.find((r: { productId: string }) => r.productId === product.id);
    expect(profitRow.revenue).toBe("10000");
    expect(profitRow.costOfGoods).toBe("4000");
    expect(profitRow.profit).toBe("6000");

    // Outside the window — a period an hour ago, ending 5 minutes ago — must not see this sale.
    const outsideFrom = new Date(Date.now() - 3_600_000).toISOString();
    const outsideTo = new Date(Date.now() - 300_000).toISOString();
    const outsideRes = await app.inject({
      method: "GET",
      url: `/api/v1/reports/sales?from=${outsideFrom}&to=${outsideTo}`,
      headers: auth(),
    });
    const outsideReport = outsideRes.json();
    expect(outsideReport.byProduct.find((r: { productId: string }) => r.productId === product.id)).toBeUndefined();
  });

  it("sales-trend buckets revenue by day and matches the sales report total", async () => {
    const product = await createProduct("Hisobot-trend");
    await stockIn(product.id, 10, 1000);
    await sale(product.id, 3, 5000);

    const trendRes = await app.inject({ method: "GET", url: `/api/v1/reports/sales-trend?${period()}`, headers: auth() });
    expect(trendRes.statusCode).toBe(200);
    const trend = trendRes.json() as Array<{ date: string; revenue: string; qty: string }>;
    expect(trend.length).toBeGreaterThan(0);

    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = trend.find((p) => p.date === today);
    expect(todayPoint).toBeDefined();

    const totalFromTrend = trend.reduce((sum, p) => sum + BigInt(p.revenue), 0n);
    const salesRes = await app.inject({ method: "GET", url: `/api/v1/reports/sales?${period()}`, headers: auth() });
    expect(totalFromTrend).toBe(BigInt(salesRes.json().totalRevenue));
  });

  it("stock-valuation report reflects remaining batch quantity × purchase price", async () => {
    const product = await createProduct("Hisobot-qiymat");
    await stockIn(product.id, 6, 1500);
    await sale(product.id, 2, 2000);

    const res = await app.inject({ method: "GET", url: "/api/v1/reports/stock-valuation", headers: auth() });
    expect(res.statusCode).toBe(200);
    const report = res.json();
    const row = report.items.find((r: { productId: string }) => r.productId === product.id);
    expect(row.qtyOnHand).toBe("4");
    expect(row.valuation).toBe("6000");
  });

  it("period report reconciles gross profit and net cash flow", async () => {
    const product = await createProduct("Hisobot-davr");
    await stockIn(product.id, 10, 1000);
    await sale(product.id, 3, 3000);

    const catRes = await app.inject({
      method: "POST",
      url: "/api/v1/expense-categories",
      headers: auth(),
      payload: { name: `Hisobot-davr-xarajat-${Date.now()}` },
    });
    const category = catRes.json() as { id: string };
    await app.inject({
      method: "POST",
      url: "/api/v1/cash-box/transactions/expense",
      headers: auth(),
      payload: { expenseCategoryId: category.id, amount: 2000 },
    });

    const res = await app.inject({ method: "GET", url: `/api/v1/reports/period?${period()}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const report = res.json();
    // Revenue 9000, cost 3000 -> gross profit 6000; expenses include the
    // 2000 above plus whatever else ran in this window, so just check the
    // arithmetic identity holds rather than an exact absolute figure.
    expect(BigInt(report.grossProfit)).toBe(BigInt(report.salesRevenue) - BigInt(report.costOfGoods));
    expect(BigInt(report.netProfit)).toBe(BigInt(report.grossProfit) - BigInt(report.totalExpenses));
    expect(BigInt(report.netCashFlow)).toBe(BigInt(report.cashIn) - BigInt(report.cashOut));
  });

  it("business-indicators includes stock valuation, cash balance and low-stock alerts", async () => {
    const product = await createProduct("Hisobot-kam-qoldiq", 100);
    await stockIn(product.id, 5, 1000); // qtyOnHand=5 <= threshold=100 -> low stock

    const res = await app.inject({ method: "GET", url: "/api/v1/reports/business-indicators", headers: auth() });
    expect(res.statusCode).toBe(200);
    const indicators = res.json();
    expect(BigInt(indicators.netBalance)).toBe(
      BigInt(indicators.stockValuation) + BigInt(indicators.cashBalance) - BigInt(indicators.ourDebtToSuppliers),
    );
    const lowStockRow = indicators.lowStockItems.find((r: { productId: string }) => r.productId === product.id);
    expect(lowStockRow).toBeDefined();
    expect(lowStockRow.qtyOnHand).toBe("5");
  });

  it("product-activity reports dead stock (unsold, in stock) and sales made at a loss", async () => {
    const deadProduct = await createProduct("Hisobot-sotilmagan");
    await stockIn(deadProduct.id, 8, 1000); // omborda bor, lekin bu davrda sotilmaydi

    const lossProduct = await createProduct("Hisobot-zarar");
    await stockIn(lossProduct.id, 10, 5000); // tan narx 5000/dona
    await sale(lossProduct.id, 4, 3000); // 3000 < 5000 — zararga sotildi

    const res = await app.inject({ method: "GET", url: `/api/v1/reports/product-activity?${period()}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const report = res.json();

    const deadRow = report.deadStock.find((r: { productId: string }) => r.productId === deadProduct.id);
    expect(deadRow).toBeDefined();
    expect(deadRow.qtyOnHand).toBe("8");

    const lossRow = report.soldAtLoss.find((r: { productId: string }) => r.productId === lossProduct.id);
    expect(lossRow).toBeDefined();
    expect(lossRow.revenue).toBe("12000"); // 4 * 3000
    expect(lossRow.costOfGoods).toBe("20000"); // 4 * 5000
    expect(lossRow.loss).toBe("8000");

    // Zarar bilan sotilgan mahsulot hali ombor qoldig'i bor bo'lsa ham
    // "sotilmagan" ro'yxatida chiqmasligi kerak — u sotilgan, faqat zararga.
    expect(report.deadStock.some((r: { productId: string }) => r.productId === lossProduct.id)).toBe(false);
  });
});
