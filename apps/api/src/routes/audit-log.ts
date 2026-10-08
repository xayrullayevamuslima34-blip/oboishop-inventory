import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditLogEntrySchema } from "@oboishop/shared";
import { toApiJson } from "../lib/serialize.js";

export const auditLogRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          entityType: z.string().optional(),
          entityId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: { 200: z.array(auditLogEntrySchema) },
      },
    },
    async (request) => {
      const { entityType, entityId, limit } = request.query;
      const rows = await fastify.prisma.auditLog.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { fullName: true } } },
      });
      return rows.map(
        (r) =>
          toApiJson({
            id: r.id,
            userId: r.userId,
            userFullName: r.user?.fullName ?? null,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            beforeData: r.beforeData,
            afterData: r.afterData,
            createdAt: r.createdAt.toISOString(),
          }) as z.infer<typeof auditLogEntrySchema>,
      );
    },
  );

  // Distinct entity types actually present — powers the frontend filter
  // dropdown without hardcoding a list that drifts from what's really logged.
  app.get(
    "/entity-types",
    { schema: { response: { 200: z.array(z.string()) } } },
    async () => {
      const rows = await fastify.prisma.auditLog.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
        orderBy: { entityType: "asc" },
      });
      return rows.map((r) => r.entityType);
    },
  );
};
