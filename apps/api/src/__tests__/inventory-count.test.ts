import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";

// Reviziya (inventarizatsiya): counted vs system qty produces a surplus
// (opens a new batch, same pattern as CUSTOMER_RETURN) or a shrinkage
// (consumes via FIFO, same pattern as WRITEOFF). See inventoryCountService.ts.
describe("inventory counts (reviziya)", () => {
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

  async function createProduct(namePrefix: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      // sku max length is 40 (see createProductSchema) — truncate the prefix so
      // long descriptive test names can never push the generated SKU over that.
      payload: { sku: `${namePrefix.slice(0, 15)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: namePrefix },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function stockIn(productId: string, qty: number, purchasePrice: number) {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: { documentDate: new Date().toISOString(), items: [{ productId, qty, purchasePrice }] },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-in/${draftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(confirmRes.statusCode).toBe(200);
  }

  async function createCountDraft(productId: string, countedQty: number) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/inventory-counts",
      headers: auth(),
      payload: { countDate: new Date().toISOString(), items: [{ productId, countedQty }] },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function confirmCount(id: string) {
    return app.inject({ method: "POST", url: `/api/v1/inventory-counts/${id}/confirm`, headers: auth() });
  }

  async function cancelCount(id: string, reason = "Test uchun bekor qilish") {
    return app.inject({ method: "POST", url: `/api/v1/inventory-counts/${id}/cancel`, headers: auth(), payload: { reason } });
  }

  async function getBalance(productId: string) {
    const res = await app.inject({ method: "GET", url: `/api/v1/products/${productId}/balance`, headers: auth() });
    expect(res.statusCode).toBe(200);
    return res.json() as { qtyOnHand: string };
  }

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

  it("surplus (counted > system) opens a new batch and increases stock", async () => {
    const product = await createProduct("Reviziya-ortiqcha");
    await stockIn(product.id, 10, 1000);

    const draft = await createCountDraft(product.id, 12);
    expect(draft.items[0].systemQty).toBe("10");
    expect(draft.items[0].difference).toBe("2");

    const confirmRes = await confirmCount(draft.id);
    expect(confirmRes.statusCode).toBe(200);

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("12");
    await assertInvariant(product.id);
  });

  it("shrinkage (counted < system) consumes via FIFO and decreases stock", async () => {
    const product = await createProduct("Reviziya-kamomad");
    await stockIn(product.id, 10, 1000);

    const draft = await createCountDraft(product.id, 7);
    expect(draft.items[0].difference).toBe("-3");

    const confirmRes = await confirmCount(draft.id);
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().items[0].adjustmentValue).toBe("3000"); // 3 * 1000

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("7");
    await assertInvariant(product.id);
  });

  it("zero difference leaves stock untouched", async () => {
    const product = await createProduct("Reviziya-mos");
    await stockIn(product.id, 10, 1000);

    const draft = await createCountDraft(product.id, 10);
    const confirmRes = await confirmCount(draft.id);
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().items[0].adjustmentValue).toBeNull();

    const balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("10");
    await assertInvariant(product.id);
  });

  it("surplus confirm -> cancel round-trip restores balance", async () => {
    const product = await createProduct("Rev-ortiq-bekor");
    await stockIn(product.id, 10, 1000);

    const draft = await createCountDraft(product.id, 15);
    const confirmed = (await confirmCount(draft.id)).json();
    let balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("15");

    const cancelRes = await cancelCount(confirmed.id);
    expect(cancelRes.statusCode).toBe(200);
    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("10");
    await assertInvariant(product.id);
  });

  it("shrinkage confirm -> cancel round-trip restores balance", async () => {
    const product = await createProduct("Rev-kamomad-bekor");
    await stockIn(product.id, 10, 1000);

    const draft = await createCountDraft(product.id, 4);
    const confirmed = (await confirmCount(draft.id)).json();
    let balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("4");

    const cancelRes = await cancelCount(confirmed.id);
    expect(cancelRes.statusCode).toBe(200);
    balance = await getBalance(product.id);
    expect(balance.qtyOnHand).toBe("10");
    await assertInvariant(product.id);
  });

  it("cancel is blocked once a surplus batch has been (partially) sold", async () => {
    const product = await createProduct("Reviziya-bloklangan");
    await stockIn(product.id, 5, 1000);

    const draft = await createCountDraft(product.id, 8); // +3 surplus batch
    const confirmed = (await confirmCount(draft.id)).json();

    const saleDraftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType: "SALE",
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 6, salePrice: 1500 }], // eats into the surplus batch
      },
    });
    expect(saleDraftRes.statusCode).toBe(201);
    const saleConfirm = await app.inject({
      method: "POST",
      url: `/api/v1/stock-out/${saleDraftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(saleConfirm.statusCode).toBe(200);

    const cancelRes = await cancelCount(confirmed.id);
    expect(cancelRes.statusCode).toBe(409);
    expect(cancelRes.json().error.code).toBe("BATCH_ALREADY_CONSUMED");
    await assertInvariant(product.id);
  });
});
