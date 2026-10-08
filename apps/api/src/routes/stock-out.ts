import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  StockOutDocType,
  cancelDocumentSchema,
  createStockOutDocumentSchema,
  stockOutDocumentSchema,
  updateStockOutDocumentSchema,
} from "@oboishop/shared";
import * as stockOutService from "../services/stockOutService.js";

export const stockOutRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
          docType: z.nativeEnum(StockOutDocType).optional(),
          contragentId: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
        response: { 200: z.array(stockOutDocumentSchema) },
      },
    },
    async (request) => stockOutService.listDocuments(fastify.prisma, request.query),
  );

  app.get(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: stockOutDocumentSchema } } },
    async (request) => stockOutService.getById(fastify.prisma, request.params.id),
  );

  app.post(
    "/",
    { schema: { body: createStockOutDocumentSchema, response: { 201: stockOutDocumentSchema } } },
    async (request, reply) => {
      const doc = await stockOutService.createDraft(fastify.prisma, request.body, request.user.sub);
      reply.status(201);
      return doc;
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      await stockOutService.deleteDraft(fastify.prisma, request.params.id, request.user.sub);
      reply.status(204);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateStockOutDocumentSchema,
        response: { 200: stockOutDocumentSchema },
      },
    },
    async (request) => stockOutService.updateDocument(fastify.prisma, request.params.id, request.body, request.user.sub),
  );

  // To'liq tahrirlash: tovar qatorlari bilan birga.
  app.post(
    "/:id/replace",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: createStockOutDocumentSchema.omit({ docType: true, documentDate: true }).extend({
          documentDate: z.string().optional(),
        }),
        response: { 200: stockOutDocumentSchema },
      },
    },
    async (request) =>
      stockOutService.replaceDocument(
        fastify.prisma,
        request.params.id,
        { ...request.body, docType: "SALE", documentDate: request.body.documentDate ?? new Date().toISOString() },
        request.user.sub,
      ),
  );

  app.post(
    "/:id/confirm",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: stockOutDocumentSchema } } },
    async (request) => stockOutService.confirmDocument(fastify.prisma, request.params.id, request.user.sub),
  );

  app.post(
    "/:id/cancel",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: cancelDocumentSchema,
        response: { 200: stockOutDocumentSchema },
      },
    },
    async (request) =>
      stockOutService.cancelDocument(fastify.prisma, request.params.id, request.user.sub, request.body.reason),
  );
};
