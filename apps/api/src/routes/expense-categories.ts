import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createExpenseCategorySchema, expenseCategorySchema } from "@oboishop/shared";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "../lib/audit.js";

export const expenseCategoryRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get("/", { schema: { response: { 200: z.array(expenseCategorySchema) } } }, async () => {
    const rows = await fastify.prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    return rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
  });

  app.post(
    "/",
    { schema: { body: createExpenseCategorySchema, response: { 201: expenseCategorySchema } } },
    async (request, reply) => {
      const category = await fastify.prisma.expenseCategory.create({ data: request.body });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "expense_category.create",
        entityType: "ExpenseCategory",
        entityId: category.id,
        afterData: category,
      });
      reply.status(201);
      return { ...category, createdAt: category.createdAt.toISOString() };
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const before = await fastify.prisma.expenseCategory.findUnique({ where: { id: request.params.id } });
      if (!before) throw new NotFoundError("Xarajat turkumi", request.params.id);
      const category = await fastify.prisma.expenseCategory.update({ where: { id: request.params.id }, data: { isActive: false } });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "expense_category.deactivate",
        entityType: "ExpenseCategory",
        entityId: category.id,
        beforeData: before,
        afterData: category,
      });
      reply.status(204);
    },
  );
};
