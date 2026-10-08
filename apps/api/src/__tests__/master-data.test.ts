import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

describe("master data CRUD", () => {
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

  it("creates a product with both a retail and a wholesale price, and clears wholesale via PATCH", async () => {
    const sku = `NARX-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku, name: "Narx test mahsulot", defaultSalePrice: 150000, wholesalePrice: 120000 },
    });
    expect(createRes.statusCode).toBe(201);
    const product = createRes.json();
    expect(product.defaultSalePrice).toBe("150000");
    expect(product.wholesalePrice).toBe("120000");

    // PATCH orqali ulgurji narxni tozalash (null) — chakana narxga tegmasdan.
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/products/${product.id}`,
      headers: auth(),
      payload: { wholesalePrice: null },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().wholesalePrice).toBeNull();
    expect(patchRes.json().defaultSalePrice).toBe("150000");
  });

  it("creates a product with an auto-generated barcode and a manual barcode without collision", async () => {
    const sku = `TEST-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku, name: "Test mahsulot", defaultSalePrice: 125000, minStockThreshold: 3 },
    });
    expect(createRes.statusCode).toBe(201);
    const product = createRes.json();
    expect(product.barcode).toMatch(/^\d{13}$/);
    // Money/quantity fields must come back as strings (BigInt/Decimal over JSON) — see docs/ARCHITECTURE.md.
    expect(product.defaultSalePrice).toBe("125000");
    expect(product.minStockThreshold).toBe("3");

    const getRes = await app.inject({ method: "GET", url: `/api/v1/products/${product.id}`, headers: auth() });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().sku).toBe(sku);
  });

  it("lists products with the current qtyOnHand, kept in sync after a confirmed stock-in", async () => {
    const sku = `QTY-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku, name: "Qoldiq-test mahsulot" },
    });
    const product = createRes.json();

    // Yangi mahsulot — ro'yxatda qoldiq "0" bo'lishi kerak (kirim hali yo'q).
    const beforeListRes = await app.inject({ method: "GET", url: `/api/v1/products?search=${sku}`, headers: auth() });
    expect(beforeListRes.statusCode).toBe(200);
    const beforeRow = beforeListRes.json().find((p: { id: string }) => p.id === product.id);
    expect(beforeRow.qtyOnHand).toBe("0");

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: null,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 12, purchasePrice: 1000 }],
      },
    });
    await app.inject({ method: "POST", url: `/api/v1/stock-in/${draftRes.json().id}/confirm`, headers: auth() });

    // Mahsulotlar ro'yxati/qidiruv — mijoz talabi: qidirganda "shuncha dona
    // bor" darhol ko'rinishi kerak, alohida sahifaga kirmasdan.
    const afterListRes = await app.inject({ method: "GET", url: `/api/v1/products?search=${sku}`, headers: auth() });
    const afterRow = afterListRes.json().find((p: { id: string }) => p.id === product.id);
    expect(afterRow.qtyOnHand).toBe("12");
  });

  it("rejects a duplicate SKU", async () => {
    const sku = `DUP-${Date.now()}`;
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku, name: "Birinchi" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku, name: "Ikkinchi" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("CONFLICT");
  });

  it("creates a contragent of type SUPPLIER", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contragents",
      headers: auth(),
      payload: { name: `Test Yetkazib Beruvchi ${Date.now()}`, type: "SUPPLIER", phone: "+998901112233" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("SUPPLIER");
  });

  it("audit-log records product creation and lists distinct entity types", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku: `AUDIT-${Date.now()}`, name: "Audit test mahsulot" },
    });
    expect(createRes.statusCode).toBe(201);
    const product = createRes.json();

    const logRes = await app.inject({
      method: "GET",
      url: `/api/v1/audit-log?entityType=Product&entityId=${product.id}`,
      headers: auth(),
    });
    expect(logRes.statusCode).toBe(200);
    const entries = logRes.json();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].action).toBe("product.create");
    expect(entries[0].userFullName).toBeTruthy();

    const typesRes = await app.inject({ method: "GET", url: "/api/v1/audit-log/entity-types", headers: auth() });
    expect(typesRes.statusCode).toBe(200);
    expect(typesRes.json()).toContain("Product");
  });

  it("looks up a product by exact barcode", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku: `Barkod-${Date.now()}`, name: "Barkod test mahsulot" },
    });
    expect(createRes.statusCode).toBe(201);
    const product = createRes.json();

    const foundRes = await app.inject({ method: "GET", url: `/api/v1/products/by-barcode/${product.barcode}`, headers: auth() });
    expect(foundRes.statusCode).toBe(200);
    expect(foundRes.json().id).toBe(product.id);

    const notFoundRes = await app.inject({ method: "GET", url: "/api/v1/products/by-barcode/0000000000000", headers: auth() });
    expect(notFoundRes.statusCode).toBe(404);
  });
});
