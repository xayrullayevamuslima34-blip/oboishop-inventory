import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";

describe("notifications (in-app)", () => {
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

  async function createProduct(namePrefix: string, minStockThreshold?: number) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      // sku max length is 40 — truncate the prefix (see other test files).
      payload: {
        sku: `${namePrefix.slice(0, 15)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: namePrefix,
        minStockThreshold,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function stockIn(productId: string, qty: number, purchasePrice: number) {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: { supplierId: null, documentDate: new Date().toISOString(), items: [{ productId, qty, purchasePrice }] },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-in/${draftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(confirmRes.statusCode).toBe(200);
  }

  it("creates a LOW_STOCK notification when a sale crosses the threshold", async () => {
    const product = await createProduct("Bildirish-kam-qol", 3);
    await stockIn(product.id, 5, 1000); // qtyOnHand=5, above threshold=3 — not low yet

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType: "SALE",
        contragentId: null,
        documentDate: new Date().toISOString(),
        // 5 - 3 = 2, at/under the threshold of 3 — this sale is what crosses it.
        items: [{ productId: product.id, qty: 3, salePrice: 2000 }],
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({ method: "POST", url: `/api/v1/stock-out/${draftRes.json().id}/confirm`, headers: auth() });
    expect(confirmRes.statusCode).toBe(200);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/notifications?limit=100", headers: auth() });
    expect(listRes.statusCode).toBe(200);
    const found = (listRes.json() as Array<{ type: string; entityId: string }>).find(
      (n) => n.type === "LOW_STOCK" && n.entityId === product.id,
    );
    expect(found).toBeDefined();
  });

  it("lists, counts, and marks notifications as read", async () => {
    const product = await createProduct("Bildirish-oqilgan", 3);
    await stockIn(product.id, 5, 1000);

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType: "SALE",
        contragentId: null,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 3, salePrice: 2000 }],
      },
    });
    await app.inject({ method: "POST", url: `/api/v1/stock-out/${draftRes.json().id}/confirm`, headers: auth() });

    const beforeCount = await app.inject({ method: "GET", url: "/api/v1/notifications/unread-count", headers: auth() });
    expect(beforeCount.statusCode).toBe(200);
    expect(beforeCount.json().count).toBeGreaterThan(0);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/notifications?unreadOnly=true&limit=100", headers: auth() });
    const notification = (listRes.json() as Array<{ id: string; entityId: string }>).find((n) => n.entityId === product.id);
    expect(notification).toBeDefined();

    const readRes = await app.inject({ method: "POST", url: `/api/v1/notifications/${notification!.id}/read`, headers: auth() });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().isRead).toBe(true);
  });

  it("mark-all-read clears the unread count", async () => {
    const product = await createProduct("Bildirish-hammasi", 3);
    await stockIn(product.id, 5, 1000);
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-out",
      headers: auth(),
      payload: {
        docType: "SALE",
        contragentId: null,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 3, salePrice: 2000 }],
      },
    });
    await app.inject({ method: "POST", url: `/api/v1/stock-out/${draftRes.json().id}/confirm`, headers: auth() });

    const readAllRes = await app.inject({ method: "POST", url: "/api/v1/notifications/read-all", headers: auth() });
    expect(readAllRes.statusCode).toBe(200);

    const countRes = await app.inject({ method: "GET", url: "/api/v1/notifications/unread-count", headers: auth() });
    expect(countRes.json().count).toBe(0);
  });

  it("404s marking a nonexistent notification as read", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/00000000-0000-0000-0000-000000000000/read",
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("notifications: qarz limiti (DEBT_ALERT_THRESHOLD)", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  const prisma = new PrismaClient();
  const originalThreshold = process.env.DEBT_ALERT_THRESHOLD;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "menejer", password: "sklad12345" },
    });
    token = loginRes.json().token;
    userId = loginRes.json().user.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function auth() {
    return { authorization: `Bearer ${token}` };
  }

  beforeEach(() => {
    vi.resetModules();
    process.env.DEBT_ALERT_THRESHOLD = "10000";
  });

  afterEach(() => {
    // process.env values are always strings — a direct assignment of
    // `undefined` here would turn an originally-unset key into the literal
    // string "undefined" (truthy!), breaking env.ts's BigInt parse for any
    // later test. Delete instead so a genuinely-unset key stays unset.
    if (originalThreshold === undefined) delete process.env.DEBT_ALERT_THRESHOLD;
    else process.env.DEBT_ALERT_THRESHOLD = originalThreshold;
    vi.resetModules();
  });

  it("creates a DEBT_THRESHOLD notification once a payment crosses the limit", async () => {
    const supplierRes = await app.inject({
      method: "POST",
      url: "/api/v1/contragents",
      headers: auth(),
      payload: { name: `Bildirish-qarz-${Date.now()}`, type: "SUPPLIER" },
    });
    expect(supplierRes.statusCode).toBe(201);
    const supplier = supplierRes.json() as { id: string };

    const { createPayment } = await import("../services/contragentLedgerService.js");
    // direction IN makes the balance more negative — we owe the supplier —
    // crossing -10000 with a single 15000 entry.
    await createPayment(prisma, supplier.id, { entryType: "PAYMENT", direction: "IN", amount: 15000 }, userId);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/notifications?limit=100", headers: auth() });
    expect(listRes.statusCode).toBe(200);
    const found = (listRes.json() as Array<{ type: string; entityId: string }>).find(
      (n) => n.type === "DEBT_THRESHOLD" && n.entityId === supplier.id,
    );
    expect(found).toBeDefined();
  });
});
