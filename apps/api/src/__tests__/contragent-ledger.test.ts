import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Balans ishorasi: musbat = kontragent bizga qarzdor, manfiy = biz
// kontragentga qarzdormiz. Qarang: contragentLedgerService.ts.
describe("contragent ledger (qarz/to'lov)", () => {
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

  async function createSupplier() {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/contragents",
      headers: auth(),
      payload: { name: `Ledger-Supplier-${Date.now()}`, type: "SUPPLIER" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe("0");
    return res.json() as { id: string };
  }

  async function createProduct() {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      payload: { sku: `LDG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "Ledger test product" },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function getContragent(id: string) {
    const res = await app.inject({ method: "GET", url: `/api/v1/contragents/${id}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    return res.json() as { balance: string };
  }

  it("kirim confirm with a supplier creates an INVOICE entry that increases our debt", async () => {
    const supplier = await createSupplier();
    const product = await createProduct();

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: supplier.id,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 10, purchasePrice: 5000 }],
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-in/${draftRes.json().id}/confirm`,
      headers: auth(),
    });
    expect(confirmRes.statusCode).toBe(200);

    // 10 * 5000 = 50 000 so'm debt (biz ularga qarzdor bo'ldik).
    const contragent = await getContragent(supplier.id);
    expect(contragent.balance).toBe("-50000");

    const ledgerRes = await app.inject({ method: "GET", url: `/api/v1/contragents/${supplier.id}/ledger`, headers: auth() });
    expect(ledgerRes.statusCode).toBe(200);
    expect(ledgerRes.json()[0].entryType).toBe("INVOICE");
    expect(ledgerRes.json()[0].amount).toBe("-50000");
  });

  it("kirim cancel reverses the INVOICE entry back to zero", async () => {
    const supplier = await createSupplier();
    const product = await createProduct();

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: supplier.id,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 4, purchasePrice: 1000 }],
      },
    });
    const stockInId = draftRes.json().id;
    await app.inject({ method: "POST", url: `/api/v1/stock-in/${stockInId}/confirm`, headers: auth() });
    expect((await getContragent(supplier.id)).balance).toBe("-4000");

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-in/${stockInId}/cancel`,
      headers: auth(),
      payload: { reason: "Test uchun bekor qilish" },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect((await getContragent(supplier.id)).balance).toBe("0");
  });

  it("payment OUT reduces our debt (moves balance toward positive)", async () => {
    const supplier = await createSupplier();
    const product = await createProduct();

    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/stock-in",
      headers: auth(),
      payload: {
        supplierId: supplier.id,
        documentDate: new Date().toISOString(),
        items: [{ productId: product.id, qty: 5, purchasePrice: 2000 }],
      },
    });
    await app.inject({ method: "POST", url: `/api/v1/stock-in/${draftRes.json().id}/confirm`, headers: auth() });
    expect((await getContragent(supplier.id)).balance).toBe("-10000");

    const paymentRes = await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/payment`,
      headers: auth(),
      payload: { entryType: "PAYMENT", direction: "OUT", amount: 6000, note: "Qisman to'lov" },
    });
    expect(paymentRes.statusCode).toBe(201);
    expect((await getContragent(supplier.id)).balance).toBe("-4000");
  });

  it("prepayment OUT before any invoice puts the supplier in our debt (positive balance)", async () => {
    const supplier = await createSupplier();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/payment`,
      headers: auth(),
      payload: { entryType: "PREPAYMENT", direction: "OUT", amount: 15000 },
    });
    expect(res.statusCode).toBe(201);
    expect((await getContragent(supplier.id)).balance).toBe("15000");
  });

  it("adjustment applies the signed amount directly", async () => {
    const supplier = await createSupplier();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/adjustment`,
      headers: auth(),
      payload: { amount: -2500, note: "Hisob-kitob xatosini tuzatish" },
    });
    expect(res.statusCode).toBe(201);
    expect((await getContragent(supplier.id)).balance).toBe("-2500");
  });

  it("rejects an adjustment without a note", async () => {
    const supplier = await createSupplier();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/adjustment`,
      headers: auth(),
      payload: { amount: 100 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("statement reports correct opening/closing balances for a date range", async () => {
    const supplier = await createSupplier();

    // Entry before the window.
    await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/adjustment`,
      headers: auth(),
      payload: { amount: -1000, note: "Oldingi qoldiq" },
    });

    const from = new Date();
    from.setSeconds(from.getSeconds() + 1);
    await new Promise((r) => setTimeout(r, 1100));

    await app.inject({
      method: "POST",
      url: `/api/v1/contragents/${supplier.id}/ledger/payment`,
      headers: auth(),
      payload: { entryType: "PAYMENT", direction: "OUT", amount: 400 },
    });

    const to = new Date();
    to.setSeconds(to.getSeconds() + 5);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/contragents/${supplier.id}/statement?from=${from.toISOString()}&to=${to.toISOString()}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const statement = res.json();
    expect(statement.openingBalance).toBe("-1000");
    expect(statement.entries).toHaveLength(1);
    expect(statement.closingBalance).toBe("-600");
  });
});
