import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// Phase 1 smoke test: proves the whole wire-up (Fastify + Prisma + JWT +
// error handler) works end to end against the seeded dev database. Deeper
// FIFO/ledger invariant tests land in Phase 2 — see docs/ARCHITECTURE.md and
// the approved plan's "To'g'rilik va test strategiyasi" section.
describe("auth", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "menejer", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("logs in the seeded user and fetches /me with the token", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "menejer", password: "sklad12345" },
    });
    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.user.username).toBe("menejer");
    expect(typeof body.token).toBe("string");

    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().username).toBe("menejer");
  });

  it("rejects requests without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/products" });
    expect(res.statusCode).toBe(401);
  });
});
