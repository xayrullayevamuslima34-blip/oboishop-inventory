import path from "node:path";
import fs from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  batchSchema,
  createProductSchema,
  moneyInputSchema,
  quantityInputSchema,
  productSchema,
  productStockBalanceSchema,
  stockMovementSchema,
  updateProductSchema,
  type Batch,
  type Product,
  type ProductStockBalance,
  type StockMovement,
} from "@oboishop/shared";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { generateBarcode } from "../lib/barcode.js";
import { nextDocNumber } from "../lib/document-sequence.js";
import { recomputeProductBalance } from "../lib/stock-balance.js";

const ALLOWED_IMAGE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Best-effort delete of a previously uploaded product image — never lets a
 * missing/already-gone file block the request that's replacing it. */
async function deleteUploadedImage(imageUrl: string | null) {
  if (!imageUrl?.startsWith("/uploads/")) return;
  const filePath = path.join(process.cwd(), imageUrl);
  await fs.unlink(filePath).catch(() => {});
}

const productInclude = { tags: { select: { tagId: true } } } satisfies Prisma.ProductInclude;

type ProductWithTags = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toDto(product: ProductWithTags): Product {
  const { tags, ...rest } = product;
  return toApiJson({
    ...rest,
    createdAt: rest.createdAt.toISOString(),
    tagIds: tags.map((t) => t.tagId),
  }) as Product;
}

async function generateUniqueBarcode(prisma: Pick<PrismaClient, "product">) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateBarcode();
    const existing = await prisma.product.findUnique({ where: { barcode: candidate } });
    if (!existing) return candidate;
  }
  throw new ConflictError("Shtrix-kod generatsiya qilib bo'lmadi, qayta urinib ko'ring");
}

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  // Ro'yxatdagi "Turi" filtri uchun — mahsulotlarda ishlatilgan turlar.
  // Alohida jadval yo'q, shuning uchun mavjud qiymatlar shu yerda yig'iladi.
  app.get("/types", { schema: { response: { 200: z.array(z.string()) } } }, async () => {
    const rows = await fastify.prisma.product.findMany({
      where: { isActive: true, type: { not: null } },
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    });
    return rows.map((r) => r.type).filter((t): t is string => !!t);
  });

  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          search: z.string().optional(),
          type: z.string().optional(),
        }),
        // Mijoz talabi: ro'yxat/qidiruvda mahsulotni topgan zahoti "necha
        // dona bor" ko'rinishi kerak — alohida sahifaga kirmasdan. Shu sabab
        // qtyOnHand shu yerning o'zida qo'shiladi (/low-stock'dagi kabi).
        response: { 200: z.array(productSchema.extend({ qtyOnHand: z.string() })) },
      },
    },
    async (request) => {
      const { search, type } = request.query;
      const rows = await fastify.prisma.product.findMany({
        where: {
          isActive: true,
          type: type ?? undefined,
          ...(search
            ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }, { barcode: { contains: search } }] }
            : {}),
        },
        include: { ...productInclude, productStockBalance: true },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((p) => {
        const { productStockBalance, ...rest } = p;
        return toApiJson({ ...toDto(rest as ProductWithTags), qtyOnHand: productStockBalance?.qtyOnHand ?? "0" }) as Product & {
          qtyOnHand: string;
        };
      });
    },
  );

  // Exact-match lookup for barcode scanners (Tezkor sotuv) — the list
  // endpoint's `search` does a `contains` across name/sku/barcode, which is
  // wrong for a scan: a scanner emits one exact barcode value, and an exact
  // findUnique on the indexed column is also the only O(1) way to do it.
  app.get(
    "/by-barcode/:barcode",
    { schema: { params: z.object({ barcode: z.string() }), response: { 200: productSchema } } },
    async (request) => {
      const product = await fastify.prisma.product.findFirst({
        where: { barcode: request.params.barcode, isActive: true },
        include: productInclude,
      });
      if (!product) throw new NotFoundError("Shtrix-kodli mahsulot", request.params.barcode);
      return toDto(product);
    },
  );

  app.get(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: productSchema } } },
    async (request) => {
      const product = await fastify.prisma.product.findUnique({ where: { id: request.params.id }, include: productInclude });
      if (!product) throw new NotFoundError("Mahsulot", request.params.id);
      return toDto(product);
    },
  );

  app.post(
    "/",
    { schema: { body: createProductSchema, response: { 201: productSchema } } },
    async (request, reply) => {
      const { tagIds, barcode, ...data } = request.body;
      const resolvedBarcode = barcode ?? (await generateUniqueBarcode(fastify.prisma));

      const product = await fastify.prisma.product.create({
        data: {
          ...data,
          barcode: resolvedBarcode,
          defaultSalePrice: data.defaultSalePrice ?? undefined,
          wholesalePrice: data.wholesalePrice ?? undefined,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: productInclude,
      });

      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "product.create",
        entityType: "Product",
        entityId: product.id,
        afterData: toDto(product),
      });

      reply.status(201);
      return toDto(product);
    },
  );

  app.patch(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), body: updateProductSchema, response: { 200: productSchema } } },
    async (request) => {
      const before = await fastify.prisma.product.findUnique({ where: { id: request.params.id }, include: productInclude });
      if (!before) throw new NotFoundError("Mahsulot", request.params.id);

      const { tagIds, ...data } = request.body;

      const product = await fastify.prisma.$transaction(async (tx) => {
        if (tagIds !== undefined) {
          await tx.productTag.deleteMany({ where: { productId: request.params.id } });
          if (tagIds.length > 0) {
            await tx.productTag.createMany({ data: tagIds.map((tagId) => ({ productId: request.params.id, tagId })) });
          }
        }
        // Note: unlike create, update must let an explicit `null` through
        // as-is (to clear a previously-set price) rather than collapsing it
        // to `undefined` (which would mean "leave unchanged") — Prisma's
        // nullable BigInt update input accepts `null` directly.
        return tx.product.update({
          where: { id: request.params.id },
          data,
          include: productInclude,
        });
      });

      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "product.update",
        entityType: "Product",
        entityId: product.id,
        beforeData: toDto(before),
        afterData: toDto(product),
      });

      return toDto(product);
    },
  );

  app.delete(
    "/:id",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      const before = await fastify.prisma.product.findUnique({ where: { id: request.params.id } });
      if (!before) throw new NotFoundError("Mahsulot", request.params.id);
      // Soft delete — products are referenced by batches/movements once stock exists.
      const product = await fastify.prisma.product.update({ where: { id: request.params.id }, data: { isActive: false } });
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "product.deactivate",
        entityType: "Product",
        entityId: product.id,
        beforeData: before,
        afterData: product,
      });
      reply.status(204);
    },
  );

  // ---------- Phase 2: stock/FIFO read endpoints ----------

  app.get(
    "/:id/balance",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: productStockBalanceSchema } } },
    async (request) => {
      const balance = await fastify.prisma.productStockBalance.findUnique({ where: { productId: request.params.id } });
      return toApiJson(
        balance ?? { productId: request.params.id, qtyOnHand: "0", avgCost: null, updatedAt: new Date().toISOString() },
      ) as ProductStockBalance;
    },
  );

  app.get(
    "/:id/batches",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: z.array(batchSchema) } } },
    async (request) => {
      const batches = await fastify.prisma.batch.findMany({
        where: { productId: request.params.id },
        orderBy: { receivedAt: "desc" },
      });
      return batches.map(
        (b) => toApiJson({ ...b, receivedAt: b.receivedAt.toISOString(), createdAt: b.createdAt.toISOString() }) as Batch,
      );
    },
  );

  app.get(
    "/:id/movements",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: z.array(stockMovementSchema) } } },
    async (request) => {
      const movements = await fastify.prisma.stockMovement.findMany({
        where: { productId: request.params.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return movements.map((m) => toApiJson({ ...m, createdAt: m.createdAt.toISOString() }) as StockMovement);
    },
  );

  app.get(
    "/low-stock",
    { schema: { response: { 200: z.array(productSchema.extend({ qtyOnHand: z.string() })) } } },
    async () => {
      const products = await fastify.prisma.product.findMany({
        where: { isActive: true, minStockThreshold: { not: null } },
        include: { ...productInclude, productStockBalance: true },
      });
      const low = products.filter((p) => {
        const qty = Number(p.productStockBalance?.qtyOnHand ?? 0);
        return qty <= Number(p.minStockThreshold);
      });
      return low.map((p) => {
        const { productStockBalance, ...rest } = p;
        return toApiJson({ ...toDto(rest as ProductWithTags), qtyOnHand: productStockBalance?.qtyOnHand ?? "0" }) as Product & {
          qtyOnHand: string;
        };
      });
    },
  );

  // ---------- Phase 11: product image upload ----------

  app.post(
    "/:id/image",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: productSchema } } },
    async (request) => {
      const before = await fastify.prisma.product.findUnique({ where: { id: request.params.id }, include: productInclude });
      if (!before) throw new NotFoundError("Mahsulot", request.params.id);

      const data = await request.file();
      if (!data) throw new ValidationError("Rasm fayli topilmadi");
      const ext = ALLOWED_IMAGE_MIME_EXT[data.mimetype];
      if (!ext) throw new ValidationError("Faqat JPEG, PNG yoki WebP formatidagi rasm qabul qilinadi");

      const fileName = `${randomUUID()}.${ext}`;
      const destPath = path.join(process.cwd(), "uploads", "products", fileName);
      await pipeline(data.file, createWriteStream(destPath));
      // busboy (used internally by @fastify/multipart) enforces the size
      // limit mid-stream rather than throwing synchronously — this flag is
      // how it's surfaced after the pipeline settles.
      if (data.file.truncated) {
        await fs.unlink(destPath).catch(() => {});
        throw new ValidationError("Rasm hajmi 15MB dan oshmasligi kerak");
      }

      const imageUrl = `/uploads/products/${fileName}`;
      await deleteUploadedImage(before.imageUrl);

      const product = await fastify.prisma.product.update({
        where: { id: request.params.id },
        data: { imageUrl },
        include: productInclude,
      });

      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "product.image_upload",
        entityType: "Product",
        entityId: product.id,
        beforeData: { imageUrl: before.imageUrl },
        afterData: { imageUrl },
      });

      return toDto(product);
    },
  );

  app.delete(
    "/:id/image",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: productSchema } } },
    async (request) => {
      const before = await fastify.prisma.product.findUnique({ where: { id: request.params.id }, include: productInclude });
      if (!before) throw new NotFoundError("Mahsulot", request.params.id);

      await deleteUploadedImage(before.imageUrl);
      const product = await fastify.prisma.product.update({
        where: { id: request.params.id },
        data: { imageUrl: null },
        include: productInclude,
      });

      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "product.image_delete",
        entityType: "Product",
        entityId: product.id,
        beforeData: { imageUrl: before.imageUrl },
        afterData: { imageUrl: null },
      });

      return toDto(product);
    },
  );

  // ---------- Ombor qoldig'ini to'ldirish ----------
  //
  // "Kirim" hujjatlari bo'limi mijoz talabiga ko'ra olib tashlangan, lekin
  // omborga tovar kelganda qoldiqni oshirish kerak. Bu endpoint bitta
  // mahsulot uchun yangi partiya ochadi — FIFO hisobi shu partiyadan
  // yuritiladi, ya'ni tannarx va foyda hisoboti to'g'ri qoladi.
  app.post(
    "/:id/stock",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          qty: quantityInputSchema,
          // Partiya tannarxi (so'mda). Berilmasa, mahsulotning kirim
          // narxidan olinadi (u valyutada bo'lsa — kurs bilan so'mga).
          unitCost: moneyInputSchema.nullable().optional(),
          note: z.string().trim().max(500).nullable().optional(),
        }),
        response: { 200: z.object({ productId: z.string().uuid(), qtyOnHand: z.string() }) },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { qty, unitCost, note } = request.body;

      const product = await fastify.prisma.product.findUnique({ where: { id } });
      if (!product) throw new NotFoundError("Mahsulot", id);

      const balance = await fastify.prisma.$transaction(async (tx) => {
        const batchNumber = await nextDocNumber(tx, "batch", "PARTIYA");
        const batch = await tx.batch.create({
          data: {
            productId: id,
            supplierId: null,
            batchNumber,
            receivedAt: new Date(),
            purchasePrice: BigInt(unitCost ?? 0),
            qtyReceived: qty,
            qtyRemaining: qty,
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: id,
            batchId: batch.id,
            movementType: "STOCK_IN",
            qtyDelta: qty,
            referenceDocumentType: "product_stock_entry",
            referenceDocumentId: batch.id,
            createdBy: request.user.sub,
          },
        });
        await writeAuditLog(tx, {
          userId: request.user.sub,
          action: "product.stock_add",
          entityType: "Product",
          entityId: id,
          afterData: { qty, unitCost: unitCost ?? 0, batchNumber, note: note ?? null },
        });
        await recomputeProductBalance(tx, id);
        return tx.productStockBalance.findUnique({ where: { productId: id } });
      });

      return toApiJson({ productId: id, qtyOnHand: balance?.qtyOnHand ?? 0 }) as { productId: string; qtyOnHand: string };
    },
  );
};
