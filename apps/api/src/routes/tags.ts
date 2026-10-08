import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createTagSchema, tagSchema } from "@oboishop/shared";
import { NotFoundError } from "../lib/errors.js";
import { writeAuditLog } from "../lib/audit.js";

export const tagRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get("/", { schema: { response: { 200: z.array(tagSchema) } } }, async () => {
    const rows = await fastify.prisma.tag.findMany({ orderBy: { name: "asc" } });
    return rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }));
  });

  app.post(
    "/",
    { schema: { body: createTagSchema, response: { 201: tagSchema } } },
    async (request, reply) => {
      const tag = await fastify.prisma.tag.create({ data: request.body });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "tag.create",
        entityType: "Tag",
        entityId: tag.id,
        afterData: tag,
      });
      reply.status(201);
      return { ...tag, createdAt: tag.createdAt.toISOString() };
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const before = await fastify.prisma.tag.findUnique({ where: { id: request.params.id } });
      if (!before) throw new NotFoundError("Teg", request.params.id);
      // Tags have no financial impact — hard delete is fine (join rows cascade).
      await fastify.prisma.tag.delete({ where: { id: request.params.id } });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "tag.delete",
        entityType: "Tag",
        entityId: request.params.id,
        beforeData: before,
      });
      reply.status(204);
    },
  );
};
