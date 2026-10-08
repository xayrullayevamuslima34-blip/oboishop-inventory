import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CashTransactionType, cashTransactionSchema, createExpenseSchema, createManualIncomeSchema } from "@oboishop/shared";
import * as cashBoxService from "../services/cashBoxService.js";
import { toApiJson } from "../lib/serialize.js";

export const cashBoxRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get("/balance", { schema: { response: { 200: z.object({ balance: z.string() }) } } }, async () => {
    const balance = await cashBoxService.getBalance(fastify.prisma);
    return toApiJson({ balance }) as { balance: string };
  });

  app.get(
    "/transactions",
    {
      schema: {
        querystring: z.object({
          type: z.nativeEnum(CashTransactionType).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
        response: { 200: z.array(cashTransactionSchema) },
      },
    },
    async (request) => {
      const { type, from, to } = request.query;
      return cashBoxService.listTransactions(fastify.prisma, {
        type,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
    },
  );

  app.post(
    "/transactions/income",
    { schema: { body: createManualIncomeSchema, response: { 201: cashTransactionSchema } } },
    async (request, reply) => {
      const tx = await cashBoxService.createManualIncome(fastify.prisma, request.body, request.user.sub);
      reply.status(201);
      return tx;
    },
  );

  app.post(
    "/transactions/expense",
    { schema: { body: createExpenseSchema, response: { 201: cashTransactionSchema } } },
    async (request, reply) => {
      const tx = await cashBoxService.createExpense(fastify.prisma, request.body, request.user.sub);
      reply.status(201);
      return tx;
    },
  );
};
