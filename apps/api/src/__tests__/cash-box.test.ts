import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Priority 4 from the approved plan's test strategy: cash_box.balance ==
// SUM(cash_transactions). Every cash-affecting flow (sale confirm/cancel,
// manual income, expense) must keep that invariant exactly.
describe("cash box + expenses", () => {
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

  async function createProduct(namePrefix: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      headers: auth(),
      // sku max length is 40 (see createProductSchema) — truncate the prefix so
      // long descriptive test names can never push the generated SKU over that.
      payload: {
        sku: `${namePrefix.slice(0, 15)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: namePrefix,
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
      payload: {
        supplierId: null,
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

  async function createSaleDraft(productId: string, qty: number, salePrice: number) {
    const res = await app.inject({
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
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function getBalance() {
    const res = await app.inject({ method: "GET", url: "/api/v1/cash-box/balance", headers: auth() });
    expect(res.statusCode).toBe(200);
    return BigInt(res.json().balance);
  }

  async function createExpenseCategory() {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/expense-categories",
      headers: auth(),
      payload: { name: `Xarajat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  it("SALE confirm auto-creates a SALE_INCOME transaction and increases balance", async () => {
    const product = await createProduct("Kassa-sotuv");
    await stockIn(product.id, 10, 1000);
    const before = await getBalance();

    const draft = await createSaleDraft(product.id, 3, 2500);
    const confirmRes = await app.inject({ method: "POST", url: `/api/v1/stock-out/${draft.id}/confirm`, headers: auth() });
    expect(confirmRes.statusCode).toBe(200);

    const after = await getBalance();
    expect(after - before).toBe(7500n);

    const txRes = await app.inject({
      method: "GET",
      url: "/api/v1/cash-box/transactions?type=SALE_INCOME",
      headers: auth(),
    });
    expect(txRes.statusCode).toBe(200);
    const list = txRes.json() as Array<{ referenceDocumentId: string; amount: string }>;
    const match = list.find((t) => t.referenceDocumentId === draft.id);
    expect(match?.amount).toBe("7500");
  });

  it("SALE cancel reverses the cash income back out", async () => {
    const product = await createProduct("Kassa-bekor");
    await stockIn(product.id, 10, 1000);

    const draft = await createSaleDraft(product.id, 4, 3000);
    await app.inject({ method: "POST", url: `/api/v1/stock-out/${draft.id}/confirm`, headers: auth() });
    const afterConfirm = await getBalance();

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/v1/stock-out/${draft.id}/cancel`,
      headers: auth(),
      payload: { reason: "Test uchun bekor qilish" },
    });
    expect(cancelRes.statusCode).toBe(200);

    const afterCancel = await getBalance();
    expect(afterConfirm - afterCancel).toBe(12000n);
  });

  it("manual income increases the balance and is listed", async () => {
    const before = await getBalance();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cash-box/transactions/income",
      headers: auth(),
      payload: { amount: 50000, note: "Kassaga qo'lda kirim" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("MANUAL_INCOME");
    expect(res.json().amount).toBe("50000");

    const after = await getBalance();
    expect(after - before).toBe(50000n);
  });

  it("expense against a category decreases the balance", async () => {
    const category = await createExpenseCategory();
    const before = await getBalance();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cash-box/transactions/expense",
      headers: auth(),
      payload: { expenseCategoryId: category.id, amount: 12000, note: "Ofis xarajati" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe("EXPENSE");
    expect(res.json().amount).toBe("-12000");
    expect(res.json().expenseCategoryName).toBe(category.id ? (await getExpenseCategoryName(category.id)) : undefined);

    const after = await getBalance();
    expect(before - after).toBe(12000n);
  });

  async function getExpenseCategoryName(id: string) {
    const res = await app.inject({ method: "GET", url: "/api/v1/expense-categories", headers: auth() });
    const list = res.json() as Array<{ id: string; name: string }>;
    return list.find((c) => c.id === id)?.name;
  }

  it("rejects an expense against a nonexistent category", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cash-box/transactions/expense",
      headers: auth(),
      payload: { expenseCategoryId: "00000000-0000-0000-0000-000000000000", amount: 1000 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a non-positive amount for manual income", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cash-box/transactions/income",
      headers: auth(),
      payload: { amount: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});
