import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { cancelDocumentSchema, createStockInDocumentSchema, stockInDocumentSchema } from "@oboishop/shared";
import * as stockInService from "../services/stockInService.js";

export const stockInRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
          supplierId: z.string().uuid().optional(),
        }),
        response: { 200: z.array(stockInDocumentSchema) },
      },
    },
    async (request) => stockInService.listDocuments(fastify.prisma, request.query),
  );

  app.get(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: stockInDocumentSchema } } },
    async (request) => stockInService.getById(fastify.prisma, request.params.id),
  );

  app.post(
    "/",
    { schema: { body: createStockInDocumentSchema, response: { 201: stockInDocumentSchema } } },
    async (request, reply) => {
      const doc = await stockInService.createDraft(fastify.prisma, request.body, request.user.sub);
      reply.status(201);
      return doc;
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      await stockInService.deleteDraft(fastify.prisma, request.params.id, request.user.sub);
      reply.status(204);
    },
  );

  app.post(
    "/:id/confirm",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: stockInDocumentSchema } } },
    async (request) => stockInService.confirmDocument(fastify.prisma, request.params.id, request.user.sub),
  );

  app.post(
    "/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: cancelDocumentSchema,
        response: { 200: stockInDocumentSchema },
      },
    },
    async (request) =>
      stockInService.cancelDocument(fastify.prisma, request.params.id, request.user.sub, request.body.reason),
  );
};
