import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { cancelDocumentSchema, createInventoryCountSchema, inventoryCountSchema } from "@oboishop/shared";
import * as inventoryCountService from "../services/inventoryCountService.js";

export const inventoryCountRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({ status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional() }),
        response: { 200: z.array(inventoryCountSchema) },
      },
    },
    async (request) => inventoryCountService.listDocuments(fastify.prisma, request.query),
  );

  app.get(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: inventoryCountSchema } } },
    async (request) => inventoryCountService.getById(fastify.prisma, request.params.id),
  );

  app.post(
    "/",
    { schema: { body: createInventoryCountSchema, response: { 201: inventoryCountSchema } } },
    async (request, reply) => {
      const doc = await inventoryCountService.createDraft(fastify.prisma, request.body, request.user.sub);
      reply.status(201);
      return doc;
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      await inventoryCountService.deleteDraft(fastify.prisma, request.params.id, request.user.sub);
      reply.status(204);
    },
  );

  app.post(
    "/:id/confirm",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: inventoryCountSchema } } },
    async (request) => inventoryCountService.confirmDocument(fastify.prisma, request.params.id, request.user.sub),
  );

  app.post(
    "/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: cancelDocumentSchema,
        response: { 200: inventoryCountSchema },
      },
    },
    async (request) =>
      inventoryCountService.cancelDocument(fastify.prisma, request.params.id, request.user.sub, request.body.reason),
  );
};
