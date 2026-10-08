import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// A tiny valid 1x1 PNG (base64) — real bytes, not just a text stand-in, so
// the upload path is exercised the same way a real photo would be.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("product image upload", () => {
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
      // sku max length is 40 — truncate the prefix (see other test files).
      payload: {
        sku: `${namePrefix.slice(0, 15)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: namePrefix,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; imageUrl: string | null };
  }

  function pngFormData() {
    const form = new FormData();
    const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
    form.append("file", new Blob([bytes], { type: "image/png" }), "test.png");
    return form;
  }

  it("uploads a valid image and serves it back over /uploads", async () => {
    const product = await createProduct("Rasm-yuklash");

    const uploadRes = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: pngFormData(),
    });
    expect(uploadRes.statusCode).toBe(200);
    const updated = uploadRes.json();
    expect(updated.imageUrl).toMatch(/^\/uploads\/products\/.+\.png$/);

    const fileRes = await app.inject({ method: "GET", url: updated.imageUrl });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers["content-type"]).toBe("image/png");
  });

  it("replaces an existing image and removes the old file", async () => {
    const product = await createProduct("Rasm-almashtirish");

    const firstUpload = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: pngFormData(),
    });
    const firstImageUrl = firstUpload.json().imageUrl as string;

    const secondUpload = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: pngFormData(),
    });
    expect(secondUpload.statusCode).toBe(200);
    const secondImageUrl = secondUpload.json().imageUrl as string;
    expect(secondImageUrl).not.toBe(firstImageUrl);

    const oldFileRes = await app.inject({ method: "GET", url: firstImageUrl });
    expect(oldFileRes.statusCode).toBe(404);
  });

  it("rejects a non-image file", async () => {
    const product = await createProduct("Rasm-xato-tur");
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("hello")], { type: "text/plain" }), "notes.txt");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: form,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a file over the 15MB limit with a clean error, not a hang", async () => {
    const product = await createProduct("Rasm-katta");
    const form = new FormData();
    // PNG imzosi bilan boshlanadi, lekin haqiqiy rasm emas — hajm chegarasi
    // busboy darajasida ishlaydi, fayl formatidan qat'iy nazar.
    const oversized = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(15 * 1024 * 1024 + 1)]);
    form.append("file", new Blob([oversized], { type: "image/png" }), "katta.png");

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: form,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain("15MB");
  });

  it("404s for a nonexistent product", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/products/00000000-0000-0000-0000-000000000000/image",
      headers: auth(),
      payload: pngFormData(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("deletes an image", async () => {
    const product = await createProduct("Rasm-ochirish");
    const uploadRes = await app.inject({
      method: "POST",
      url: `/api/v1/products/${product.id}/image`,
      headers: auth(),
      payload: pngFormData(),
    });
    const imageUrl = uploadRes.json().imageUrl as string;

    const deleteRes = await app.inject({ method: "DELETE", url: `/api/v1/products/${product.id}/image`, headers: auth() });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().imageUrl).toBeNull();

    const fileRes = await app.inject({ method: "GET", url: imageUrl });
    expect(fileRes.statusCode).toBe(404);
  });
});
