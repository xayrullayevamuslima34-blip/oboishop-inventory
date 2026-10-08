import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";

// Priority 1-2 tests from the approved plan's "To'g'rilik va test strategiyasi"
// section — the FIFO/ledger engine is the single highest-risk piece of this
// system, so these are written in Phase 2 itself, not deferred. Run against
// the real dev Postgres (see vitest.config.ts) so SELECT ... FOR UPDATE
// locking and DB constraints are exercised for real, not mocked.
describe("stock-in / stock-out / FIFO engine", () => {
  let app: FastifyInstance;
  let token: string;
  const prisma = new PrismaClient();

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
    await prisma.$disconnect();
  });

  function auth() {
    return { authorization: `Bearer ${token}` };
  }

  async function createProduct(namePrefix: string, minStockThreshold?: number) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      // sku max length is 40 (see createProductSchema) — truncate the prefix so
      // long descriptive test names can never push the generated SKU over that.
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
      payload: { name: `Supplier ${Date.now()}`, type: "SUPPLIER" },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function stockIn(
    productId: string,
    qty: number,
    purchasePrice: number,
    opts: { documentDate?: string; supplierId?: string } = {},
  ) {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: opts.supplierId ?? null,
        documentDate: opts.documentDate ?? new Date().toISOString(),
        items: [{ productId, qty, purchasePrice }],
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const draft = draftRes.json();
    const confirmRes = await app.inject({ method: "POST", url: `/api/v1/stock-in/${draft.id}/confirm`, headers: auth() });
    expect(confirmRes.statusCode).toBe(200);
    return confirmRes.json();
  }

  async function createStockOutDraft(
    docType: "SALE" | "CUSTOMER_RETURN" | "RETURN_TO_SUPPLIER" | "WRITEOFF",
    productId: string,
    qty: number,
    opts: { salePrice?: number; unitCost?: number; contragentId?: string } = {},
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType,
        contragentId: opts.contragentId ?? null,
        documentDate: new Date().toISOString(),
        items: [{ productId, qty, salePrice: opts.salePrice, unitCost: opts.unitCost }],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function confirmStockOut(id: string) {
    return app.inject({ method: "POST", url: `/api/v1/stock-out/${id}/confirm`, headers: auth() });
  }

  async function cancelStockOut(id: string, reason = "Test uchun bekor qilish") {
    return app.inject({ method: "POST", url: `/api/v1/stock-out/${id}/cancel`, headers: auth(), payload: { reason } });
  }

  async function cancelStockIn(id: string, reason = "Test uchun bekor qilish") {
    return app.inject({ method: "POST", url: `/api/v1/stock-in/${id}/cancel`, headers: auth(), payload: { reason } });
  }

  async function getBalance(productId: string) {
    const res = await app.inject({ method: "GET", url: `/api/v1/products/${productId}/balance`, headers: auth() });
    expect(res.statusCode).toBe(200);
    return res.json() as { qtyOnHand: string; avgCost: string | null };
  }

  /** Master correctness check from the plan: the denormalized balance must
   * always equal both SUM(batches.qty_remaining) and SUM(stock_movements.qty_delta). */
  async function assertInvariant(productId: string) {
    const [batchSum, movementSum, balance] = await Promise.all([
      prisma.batch.aggregate({ where: { productId }, _sum: { qtyRemaining: true } }),
      prisma.stockMovement.aggregate({ where: { productId }, _sum: { qtyDelta: true } }),
      prisma.productStockBalance.findUnique({ where: { productId } }),
    ]);
    const fromBatches = Number(batchSum._sum.qtyRemaining ?? 0);
    const fromMovements = Number(movementSum._sum.qtyDelta ?? 0);
    const fromBalance = Number(balance?.qtyOnHand ?? 0);
    expect(fromBalance).toBeCloseTo(fromBatches, 6);
    expect(fromBalance).toBeCloseTo(fromMovements, 6);
  }

  it("single batch: sale consumes exactly the available qty and cost matches purchase price", async () => {
    const product = await createProduct("Yagona-partiya");
    await stockIn(product.id, 10, 1000);

    const draft = await createStockOutDraft("SALE", product.id, 10, { salePrice: 1500 });
    const confirmRes = await confirmStockOut(draft.id);
    expect(confirmRes.statusCode).toBe(200);
    const confirmed = confirmRes.json();
    expect(confirmed.items[0].costOfGoodsTotal).toBe("10000");
    expect(confirmed.totalAmount).toBe("15000");

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("0");
    await assertInvariant(product.id);
  });

  it("multi-batch FIFO: consumes the oldest batch first even when a newer batch is cheaper", async () => {
    const product = await createProduct("Kop-partiya");
    await stockIn(product.id, 5, 1000, { documentDate: "2026-01-01T00:00:00.000Z" });
    await stockIn(product.id, 5, 800, { documentDate: "2026-01-02T00:00:00.000Z" });

    const draft = await createStockOutDraft("SALE", product.id, 7, { salePrice: 1200 });
    const confirmRes = await confirmStockOut(draft.id);
    expect(confirmRes.statusCode).toBe(200);
    const confirmed = confirmRes.json();
    // 5 units @1000 (oldest batch, fully consumed) + 2 units @800 (newer batch) = 6600
    expect(confirmed.items[0].costOfGoodsTotal).toBe("6600");

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("3");
    await assertInvariant(product.id);
  });

  it("insufficient stock: the whole transaction rolls back, no partial allocation", async () => {
    const product = await createProduct("Yetarsiz-qoldiq");
    await stockIn(product.id, 5, 1000);

    const draft = await createStockOutDraft("SALE", product.id, 10, { salePrice: 1500 });
    const confirmRes = await confirmStockOut(draft.id);
    expect(confirmRes.statusCode).toBe(409);
    expect(confirmRes.json().error.code).toBe("INSUFFICIENT_STOCK");

    // Balance must be completely untouched by the failed attempt.
    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("5");
    await assertInvariant(product.id);
  });

  it("concurrent confirms on stock covering only one: exactly one succeeds, one fails", async () => {
    const product = await createProduct("Bir-donalik-poyga");
    await stockIn(product.id, 1, 1000);

    const draftA = await createStockOutDraft("SALE", product.id, 1, { salePrice: 1500 });
    const draftB = await createStockOutDraft("SALE", product.id, 1, { salePrice: 1500 });

    const [resA, resB] = await Promise.all([confirmStockOut(draftA.id), confirmStockOut(draftB.id)]);
    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("0");
    await assertInvariant(product.id);
  });

  it("stock-in confirm → cancel round-trip: balance returns to zero, batch closed", async () => {
    const product = await createProduct("Kirim-bekor");
    const confirmed = await stockIn(product.id, 8, 1000);
    let balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("8");

    const cancelRes = await cancelStockIn(confirmed.id);
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("CANCELLED");

    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("0");

    const batch = await prisma.batch.findUnique({ where: { id: confirmed.items[0].batchId } });
    expect(batch?.isClosed).toBe(true);
    expect(Number(batch?.qtyRemaining)).toBe(0);
    await assertInvariant(product.id);
  });

  it("stock-in cancel is blocked once its batch has been (partially) sold", async () => {
    const product = await createProduct("Kirim-blok");
    const confirmedIn = await stockIn(product.id, 5, 1000);

    const outDraft = await createStockOutDraft("SALE", product.id, 2, { salePrice: 1500 });
    const outConfirm = await confirmStockOut(outDraft.id);
    expect(outConfirm.statusCode).toBe(200);

    const cancelRes = await cancelStockIn(confirmedIn.id);
    expect(cancelRes.statusCode).toBe(409);
    expect(cancelRes.json().error.code).toBe("BATCH_ALREADY_CONSUMED");

    // Nothing should have changed as a result of the rejected cancel attempt.
    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("3");
    await assertInvariant(product.id);
  });

  it("stock-out (SALE) confirm → cancel round-trip: batch qty is fully restored", async () => {
    const product = await createProduct("Chiqim-bekor");
    await stockIn(product.id, 6, 1000);

    const draft = await createStockOutDraft("SALE", product.id, 4, { salePrice: 1500 });
    const confirmed = (await confirmStockOut(draft.id)).json();
    let balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("2");

    const cancelRes = await cancelStockOut(confirmed.id);
    expect(cancelRes.statusCode).toBe(200);

    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("6");
    await assertInvariant(product.id);
  });

  it("CUSTOMER_RETURN confirm opens a new batch and increases stock; cancel reverses it", async () => {
    const product = await createProduct("Mijozdan-qaytaruv");
    await stockIn(product.id, 5, 1000);
    const saleDraft = await createStockOutDraft("SALE", product.id, 5, { salePrice: 1500 });
    await confirmStockOut(saleDraft.id);
    let balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("0");

    const returnDraft = await createStockOutDraft("CUSTOMER_RETURN", product.id, 2, { unitCost: 1000 });
    const returnConfirm = await confirmStockOut(returnDraft.id);
    expect(returnConfirm.statusCode).toBe(200);

    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("2");
    await assertInvariant(product.id);

    const cancelRes = await cancelStockOut(returnConfirm.json().id);
    expect(cancelRes.statusCode).toBe(200);
    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("0");
    await assertInvariant(product.id);
  });

  it("WRITEOFF confirms via FIFO and reduces stock without requiring a sale price", async () => {
    const product = await createProduct("Spisanie");
    await stockIn(product.id, 4, 1000);

    const draft = await createStockOutDraft("WRITEOFF", product.id, 1);
    const confirmRes = await confirmStockOut(draft.id);
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().items[0].costOfGoodsTotal).toBe("1000");

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("3");
    await assertInvariant(product.id);
  });

  it("RETURN_TO_SUPPLIER confirms via FIFO against the correct supplier contragent", async () => {
    const supplier = await createSupplier();
    const product = await createProduct("YB-qaytaruv");
    await stockIn(product.id, 6, 1000, { supplierId: supplier.id });

    const draft = await createStockOutDraft("RETURN_TO_SUPPLIER", product.id, 2, { contragentId: supplier.id });
    const confirmRes = await confirmStockOut(draft.id);
    expect(confirmRes.statusCode).toBe(200);

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("4");
    await assertInvariant(product.id);
  });
});
