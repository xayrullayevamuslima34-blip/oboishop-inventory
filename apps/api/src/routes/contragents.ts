import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ContragentType,
  contragentSchema,
  contragentStatementSchema,
  createAdjustmentEntrySchema,
  createContragentSchema,
  createPaymentEntrySchema,
  ledgerEntrySchema,
  updateContragentSchema,
  type Contragent,
} from "@oboishop/shared";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import * as contragentLedgerService from "../services/contragentLedgerService.js";

function toDto(contragent: { createdAt: Date } & Record<string, unknown>, balance: bigint): Contragent {
  return toApiJson({ ...contragent, createdAt: contragent.createdAt.toISOString(), balance }) as Contragent;
}

export const contragentRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ type: z.nativeEnum(ContragentType).optional(), search: z.string().optional() }),
        response: { 200: z.array(contragentSchema) },
      },
    },
    async (request) => {
      const { type, search } = request.query;
      const rows = await fastify.prisma.contragent.findMany({
        where: {
          isActive: true,
          ...(type ? { OR: [{ type }, { type: ContragentType.BOTH }] } : {}),
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
      });

      // Batched balance lookup (one query for the whole list) instead of
      // N+1 — cheap even as the contragent list grows.
      const sums = await fastify.prisma.contragentLedgerEntry.groupBy({
        by: ["contragentId"],
        where: { contragentId: { in: rows.map((r) => r.id) } },
        _sum: { amount: true },
      });
      const balanceByContragent = new Map(sums.map((s) => [s.contragentId, s._sum.amount ?? 0n]));

      return rows.map((c) => toDto(c, balanceByContragent.get(c.id) ?? 0n));
    },
  );

  app.get(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: contragentSchema } } },
    async (request) => {
      const contragent = await fastify.prisma.contragent.findUnique({ where: { id: request.params.id } });
      if (!contragent) throw new NotFoundError("Kontragent", request.params.id);
      const balance = await contragentLedgerService.getBalance(fastify.prisma, request.params.id);
      return toDto(contragent, balance);
    },
  );

  app.post(
    "/",
    { schema: { body: createContragentSchema, response: { 201: contragentSchema } } },
    async (request, reply) => {
      const contragent = await fastify.prisma.contragent.create({ data: request.body });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "contragent.create",
        entityType: "Contragent",
        entityId: contragent.id,
        afterData: contragent,
      });
      reply.status(201);
      return toDto(contragent, 0n);
    },
  );

  app.patch(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), body: updateContragentSchema, response: { 200: contragentSchema } } },
    async (request) => {
      const before = await fastify.prisma.contragent.findUnique({ where: { id: request.params.id } });
      if (!before) throw new NotFoundError("Kontragent", request.params.id);
      const contragent = await fastify.prisma.contragent.update({ where: { id: request.params.id }, data: request.body });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "contragent.update",
        entityType: "Contragent",
        entityId: contragent.id,
        beforeData: before,
        afterData: contragent,
      });
      const balance = await contragentLedgerService.getBalance(fastify.prisma, request.params.id);
      return toDto(contragent, balance);
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const before = await fastify.prisma.contragent.findUnique({ where: { id: request.params.id } });
      if (!before) throw new NotFoundError("Kontragent", request.params.id);
      const contragent = await fastify.prisma.contragent.update({ where: { id: request.params.id }, data: { isActive: false } });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "contragent.deactivate",
        entityType: "Contragent",
        entityId: contragent.id,
        beforeData: before,
        afterData: contragent,
      });
      reply.status(204);
    },
  );

  // ---------- Phase 4: qarz/to'lov jurnali ----------

  app.get(
    "/:id/ledger",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: z.array(ledgerEntrySchema) } } },
    async (request) => contragentLedgerService.listEntries(fastify.prisma, request.params.id),
  );

  app.post(
    "/:id/ledger/payment",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: createPaymentEntrySchema,
        response: { 201: ledgerEntrySchema },
      },
    },
    async (request, reply) => {
      const entry = await contragentLedgerService.createPayment(
        fastify.prisma,
        request.params.id,
        request.body,
        request.user.sub,
      );
      reply.status(201);
      return entry;
    },
  );

  app.post(
    "/:id/ledger/adjustment",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: createAdjustmentEntrySchema,
        response: { 201: ledgerEntrySchema },
      },
    },
    async (request, reply) => {
      const entry = await contragentLedgerService.createAdjustment(
        fastify.prisma,
        request.params.id,
        request.body,
        request.user.sub,
      );
      reply.status(201);
      return entry;
    },
  );

  app.get(
    "/:id/statement",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ from: z.string(), to: z.string() }),
        response: { 200: contragentStatementSchema },
      },
    },
    async (request) =>
      contragentLedgerService.getStatement(
        fastify.prisma,
        request.params.id,
        new Date(request.query.from),
        new Date(request.query.to),
      ),
  );
};
