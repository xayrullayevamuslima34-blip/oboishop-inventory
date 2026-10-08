import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  businessIndicatorsSchema,
  periodReportSchema,
  productActivityReportSchema,
  profitReportSchema,
  reportPeriodQuerySchema,
  salesReportSchema,
  salesTrendSchema,
  stockValuationReportSchema,
} from "@oboishop/shared";
import * as reportsService from "../services/reportsService.js";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  function parsePeriod(query: { from: string; to: string }) {
    return { from: new Date(query.from), to: new Date(query.to) };
  }

  app.get(
    "/sales",
    { schema: { querystring: reportPeriodQuerySchema, response: { 200: salesReportSchema } } },
    async (request) => {
      const { from, to } = parsePeriod(request.query);
      return reportsService.getSalesReport(fastify.prisma, from, to);
    },
  );

  app.get(
    "/profit",
    { schema: { querystring: reportPeriodQuerySchema, response: { 200: profitReportSchema } } },
    async (request) => {
      const { from, to } = parsePeriod(request.query);
      return reportsService.getProfitReport(fastify.prisma, from, to);
    },
  );

  app.get(
    "/sales-trend",
    { schema: { querystring: reportPeriodQuerySchema, response: { 200: salesTrendSchema } } },
    async (request) => {
      const { from, to } = parsePeriod(request.query);
      return reportsService.getSalesTrend(fastify.prisma, from, to);
    },
  );

  app.get("/stock-valuation", { schema: { response: { 200: stockValuationReportSchema } } }, async () => {
    return reportsService.getStockValuationReport(fastify.prisma);
  });

  app.get(
    "/period",
    { schema: { querystring: reportPeriodQuerySchema, response: { 200: periodReportSchema } } },
    async (request) => {
      const { from, to } = parsePeriod(request.query);
      return reportsService.getPeriodReport(fastify.prisma, from, to);
    },
  );

  app.get("/business-indicators", { schema: { response: { 200: businessIndicatorsSchema } } }, async () => {
    return reportsService.getBusinessIndicators(fastify.prisma);
  });

  app.get(
    "/product-activity",
    { schema: { querystring: reportPeriodQuerySchema, response: { 200: productActivityReportSchema } } },
    async (request) => {
      const { from, to } = parsePeriod(request.query);
      return reportsService.getProductActivityReport(fastify.prisma, from, to);
    },
  );
};
