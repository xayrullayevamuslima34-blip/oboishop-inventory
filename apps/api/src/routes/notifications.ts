import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notificationSchema } from "@oboishop/shared";
import { toApiJson } from "../lib/serialize.js";
import { NotFoundError } from "../lib/errors.js";

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          unreadOnly: z.coerce.boolean().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        }),
        response: { 200: z.array(notificationSchema) },
      },
    },
    async (request) => {
      const { unreadOnly, limit } = request.query;
      const rows = await fastify.prisma.notification.findMany({
        where: unreadOnly ? { isRead: false } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((r) => toApiJson({ ...r, createdAt: r.createdAt.toISOString() }) as z.infer<typeof notificationSchema>);
    },
  );

  app.get(
    "/unread-count",
    { schema: { response: { 200: z.object({ count: z.number() }) } } },
    async () => {
      const count = await fastify.prisma.notification.count({ where: { isRead: false } });
      return { count };
    },
  );

  app.post(
    "/:id/read",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: notificationSchema } } },
    async (request) => {
      const existing = await fastify.prisma.notification.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new NotFoundError("Bildirishnoma", request.params.id);
      const updated = await fastify.prisma.notification.update({ where: { id: request.params.id }, data: { isRead: true } });
      return toApiJson({ ...updated, createdAt: updated.createdAt.toISOString() }) as z.infer<typeof notificationSchema>;
    },
  );

  app.post(
    "/read-all",
    { schema: { response: { 200: z.object({ updated: z.number() }) } } },
    async () => {
      const result = await fastify.prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
      return { updated: result.count };
    },
  );
};
