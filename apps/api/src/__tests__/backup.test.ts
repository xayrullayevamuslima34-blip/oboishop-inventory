import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Sozlamalar sahifasidagi "Zaxira nusxa" tugmasi shu marshrutga tayanadi —
// haqiqiy pg_dump ishga tushishini va DATABASE_URL'dagi Prisma-ga xos
// `?schema=` parametri pg_dump'ni chalg'itmasligini tekshiradi (bu aynan
// avval ushlangan bug edi — schema param olib tashlanmasa pg_dump
// "invalid URI query parameter" bilan darhol chiqib ketadi).
describe("backup", () => {
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

  it("streams a valid gzip Postgres dump with a download filename", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/backup/download",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/gzip");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="oboishop-sklad-backup-.+\.sql\.gz"$/);

    const sql = gunzipSync(res.rawPayload).toString("utf8");
    expect(sql).toContain("PostgreSQL database dump");
    // Bir nechta bizga tegishli jadval nomi haqiqatan dump qilinganini
    // tasdiqlaydi, shunchaki bo'sh/qisman fayl emasligini ko'rsatadi.
    expect(sql).toContain("products");
    expect(sql).toContain("stock_movements");
  });

  it("401s without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/backup/download" });
    expect(res.statusCode).toBe(401);
  });
});
