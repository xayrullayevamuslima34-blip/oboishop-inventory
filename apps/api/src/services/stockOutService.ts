import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateStockOutDocumentInput, StockOutDocType, StockOutDocument } from "@oboishop/shared";
import { nextDocNumber } from "../lib/document-sequence.js";
import { findLowStockCrossings, recomputeProductBalance, type LowStockCrossing } from "../lib/stock-balance.js";
import { computeLineTotal } from "../lib/money.js";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { allocateFifo } from "./fifoAllocation.js";
import { resolveCostBasis } from "../lib/cost-basis.js";
import { createTransaction as createCashTransaction } from "./cashBoxService.js";
import { createNotification } from "../lib/notifications.js";
import { BatchAlreadyConsumedError, ConflictError, DocumentAlreadyConfirmedError, NotFoundError } from "../lib/errors.js";

const DOC_PREFIX: Record<StockOutDocType, string> = {
  SALE: "SOTUV",
  CUSTOMER_RETURN: "QAYTARUV-M",
  RETURN_TO_SUPPLIER: "QAYTARUV-YB",
  WRITEOFF: "SPISANIE",
};

// SALE/WRITEOFF/RETURN_TO_SUPPLIER all consume stock via the same FIFO path
// and only differ in which MovementType gets recorded and whether a sale
// price applies. CUSTOMER_RETURN is the one doc_type that goes the other
// way (opens a new batch) — see confirmDocument below.
const FIFO_CONSUMING_TYPES: ReadonlySet<StockOutDocType> = new Set(["SALE", "WRITEOFF", "RETURN_TO_SUPPLIER"]);

const stockOutInclude = {
  items: {
    include: {
      product: { select: { name: true, sku: true, unit: true, packName: true, packSize: true } },
      allocations: true,
    },
  },
  contragent: { select: { name: true } },
} satisfies Prisma.StockOutDocumentInclude;

type StockOutDocumentWithRelations = Prisma.StockOutDocumentGetPayload<{ include: typeof stockOutInclude }>;

function toDto(doc: StockOutDocumentWithRelations, userNames?: Map<string, string>): StockOutDocument {
  const totalAmount = doc.items.reduce((sum, item) => sum + (item.lineTotal ?? 0n), 0n);
  const hasCogs = doc.items.some((i) => i.costOfGoodsTotal !== null);
  const totalCostOfGoods = hasCogs ? doc.items.reduce((sum, item) => sum + (item.costOfGoodsTotal ?? 0n), 0n) : null;
  return toApiJson({
    id: doc.id,
    docNumber: doc.docNumber,
    docType: doc.docType,
    contragentId: doc.contragentId,
    contragentName: doc.contragent?.name,
    status: doc.status,
    documentDate: doc.documentDate.toISOString(),
    note: doc.note,
    createdBy: doc.createdBy,
    createdByName: userNames?.get(doc.createdBy) ?? null,
    confirmedBy: doc.confirmedBy,
    confirmedByName: doc.confirmedBy ? (userNames?.get(doc.confirmedBy) ?? null) : null,
    confirmedAt: doc.confirmedAt ? doc.confirmedAt.toISOString() : null,
    cancelledBy: doc.cancelledBy,
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
    cancelReason: doc.cancelReason,
    createdAt: doc.createdAt.toISOString(),
    items: doc.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      productSku: item.product.sku,
      productUnit: item.product.unit,
      productPackName: item.product.packName,
      productPackSize: item.product.packSize,
      qty: item.qty,
      salePrice: item.salePrice,
      unitCost: item.unitCost,
      lineTotal: item.lineTotal,
      costOfGoodsTotal: item.costOfGoodsTotal,
      allocations: item.allocations.map((a) => ({
        id: a.id,
        batchId: a.batchId,
        qtyTaken: a.qtyTaken,
        unitCostAtAllocation: a.unitCostAtAllocation,
      })),
    })),
    totalAmount,
    totalCostOfGoods,
  }) as StockOutDocument;
}

export async function createDraft(
  prisma: PrismaClient,
  input: CreateStockOutDocumentInput,
  userId: string,
): Promise<StockOutDocument> {
  const doc = await prisma.$transaction(async (tx) => {
    const docNumber = await nextDocNumber(tx, `stock_out_${input.docType.toLowerCase()}`, DOC_PREFIX[input.docType]);
    const created = await tx.stockOutDocument.create({
      data: {
        docNumber,
        docType: input.docType,
        contragentId: input.contragentId ?? null,
        documentDate: new Date(input.documentDate),
        note: input.note ?? null,
        createdBy: userId,
        items: {
          create: input.items.map((item) => {
            const salePrice = item.salePrice != null ? BigInt(item.salePrice) : null;
            const unitCost = item.unitCost != null ? BigInt(item.unitCost) : null;
            return {
              productId: item.productId,
              qty: item.qty,
              salePrice,
              unitCost,
              lineTotal: salePrice !== null ? computeLineTotal(salePrice, item.qty) : null,
            };
          }),
        },
      },
      include: stockOutInclude,
    });
    await writeAuditLog(tx, {
      userId,
      action: "stock_out.create_draft",
      entityType: "StockOutDocument",
      entityId: created.id,
      afterData: created,
    });
    return created;
  });
  return toDto(doc);
}

// Hujjatni kim rasmiylashtirgani ko'rinishi kerak, lekin StockOutDocument'da
// User bilan bog'lanish yo'q (createdBy — oddiy id). Shu sabab nomlarni
// bitta qo'shimcha so'rov bilan yig'ib olamiz.
async function loadUserNames(prisma: PrismaClient, docs: { createdBy: string; confirmedBy: string | null }[]) {
  const ids = [...new Set(docs.flatMap((d) => [d.createdBy, d.confirmedBy]).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

export async function listDocuments(
  prisma: PrismaClient,
  filters: {
    status?: "DRAFT" | "CONFIRMED" | "CANCELLED";
    docType?: StockOutDocType;
    contragentId?: string;
    from?: string;
    to?: string;
  },
): Promise<StockOutDocument[]> {
  // Sana oralig'i — operatsiyalar ro'yxatida "shu haftadagi sotuvlar" kabi
  // so'rovlar uchun. Chegara kunlari ham kiritiladi.
  const dateFilter =
    filters.from || filters.to
      ? {
          ...(filters.from ? { gte: new Date(filters.from) } : {}),
          ...(filters.to ? { lte: new Date(filters.to) } : {}),
        }
      : undefined;

  const rows = await prisma.stockOutDocument.findMany({
    where: {
      status: filters.status,
      docType: filters.docType,
      contragentId: filters.contragentId,
      ...(dateFilter ? { documentDate: dateFilter } : {}),
    },
    include: stockOutInclude,
    orderBy: { createdAt: "desc" },
  });
  const userNames = await loadUserNames(prisma, rows);
  return rows.map((row) => toDto(row, userNames));
}

export async function getById(prisma: PrismaClient, id: string): Promise<StockOutDocument> {
  const doc = await prisma.stockOutDocument.findUnique({ where: { id }, include: stockOutInclude });
  if (!doc) throw new NotFoundError("Chiqim hujjati", id);
  const userNames = await loadUserNames(prisma, [doc]);
  return toDto(doc, userNames);
}

export async function deleteDraft(prisma: PrismaClient, id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doc = await tx.stockOutDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Chiqim hujjati", id);
    if (doc.status !== "DRAFT") throw new ConflictError("Faqat qoralama (draft) hujjatni o'chirish mumkin");
    await tx.stockOutDocument.delete({ where: { id } });
    await writeAuditLog(tx, {
      userId,
      action: "stock_out.delete_draft",
      entityType: "StockOutDocument",
      entityId: id,
      beforeData: doc,
    });
  });
}

/**
 * Confirm: draft → confirmed.
 * - SALE / WRITEOFF / RETURN_TO_SUPPLIER: FIFO-consumes stock (allocateFifo)
 *   — insufficient stock rolls back the whole transaction, no partial sale.
 * - CUSTOMER_RETURN: opens a new batch instead (goods physically come back).
 */
export async function updateDocument(
  prisma: PrismaClient,
  id: string,
  input: { contragentId?: string | null; note?: string | null },
  userId: string,
): Promise<StockOutDocument> {
  const before = await prisma.stockOutDocument.findUnique({ where: { id }, include: stockOutInclude });
  if (!before) throw new NotFoundError("Chiqim hujjati", id);

  const updated = await prisma.stockOutDocument.update({
    where: { id },
    data: {
      ...(input.contragentId !== undefined ? { contragentId: input.contragentId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    include: stockOutInclude,
  });

  await writeAuditLog(prisma, {
    userId,
    action: "stock_out.update",
    entityType: "StockOutDocument",
    entityId: id,
    beforeData: { contragentId: before.contragentId, note: before.note, docNumber: before.docNumber, docType: before.docType },
    afterData: { contragentId: updated.contragentId, note: updated.note, docNumber: updated.docNumber, docType: updated.docType },
  });

  return toDto(updated);
}

/**
 * Hujjatni to'liq tahrirlash — tovar qatorlari, miqdor va narx bilan birga.
 *
 * Tasdiqlangan hujjatning qatorlarini joyida o'zgartirib bo'lmaydi: ombordan
 * qaysi partiyadan qancha yechilgani, tannarx va kassa yozuvi allaqachon shu
 * qatorlar bo'yicha yozilgan. Shu sabab tahrirlash "eski hujjatni bekor
 * qilib, yangisini rasmiylashtirish" tarzida bajariladi — hisob to'g'ri
 * qoladi va ikkala amal ham faoliyat tarixida ko'rinadi.
 *
 * Tartib ataylab shunday: avval yangi qoralama yaratiladi (omborga ta'sir
 * qilmaydi), keyin eskisi bekor qilinadi (tovar omborga qaytadi), eng oxirida
 * yangisi tasdiqlanadi. Shunda tasdiqlash paytida qoldiq albatta yetarli
 * bo'ladi. Tasdiqlash baribir xato bersa — yangi qoralama o'chiriladi.
 */
export async function replaceDocument(
  prisma: PrismaClient,
  id: string,
  input: CreateStockOutDocumentInput,
  userId: string,
): Promise<StockOutDocument> {
  const before = await prisma.stockOutDocument.findUnique({ where: { id }, include: stockOutInclude });
  if (!before) throw new NotFoundError("Chiqim hujjati", id);
  if (before.status === "CANCELLED") {
    throw new ConflictError("Bekor qilingan hujjatni tahrirlab bo'lmaydi");
  }

  // Qoralama hujjatda hech narsa qo'llanmagan — qatorlarni to'g'ridan-to'g'ri
  // almashtiraveramiz, yangi hujjat yasash shart emas.
  if (before.status === "DRAFT") {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.stockOutDocumentItem.deleteMany({ where: { documentId: id } });
      return tx.stockOutDocument.update({
        where: { id },
        data: {
          contragentId: input.contragentId ?? null,
          note: input.note ?? null,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              salePrice: item.salePrice != null ? BigInt(item.salePrice) : null,
              unitCost: item.unitCost != null ? BigInt(item.unitCost) : null,
              lineTotal: item.salePrice != null ? computeLineTotal(BigInt(item.salePrice), item.qty) : null,
            })),
          },
        },
        include: stockOutInclude,
      });
    });

    await writeAuditLog(prisma, {
      userId,
      action: "stock_out.items_update",
      entityType: "StockOutDocument",
      entityId: id,
      beforeData: toDto(before),
      afterData: toDto(updated),
    });

    const userNames = await loadUserNames(prisma, [updated]);
    return toDto(updated, userNames);
  }

  const draft = await createDraft(
    prisma,
    { ...input, docType: before.docType as StockOutDocType, documentDate: before.documentDate.toISOString() },
    userId,
  );

  await cancelDocument(prisma, id, userId, `Tahrirlandi — o'rniga ${draft.docNumber} rasmiylashtirildi`);

  try {
    const confirmed = await confirmDocument(prisma, draft.id, userId);
    await writeAuditLog(prisma, {
      userId,
      action: "stock_out.items_update",
      entityType: "StockOutDocument",
      entityId: draft.id,
      beforeData: toDto(before),
      afterData: confirmed,
    });
    return confirmed;
  } catch (err) {
    // Tasdiqlash o'tmadi — yangi qoralamani qoldirmaymiz.
    await deleteDraft(prisma, draft.id, userId).catch(() => {});
    throw err;
  }
}

export async function confirmDocument(prisma: PrismaClient, id: string, userId: string): Promise<StockOutDocument> {
  let lowStockCrossings: LowStockCrossing[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.stockOutDocument.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
    });
    if (!doc) throw new NotFoundError("Chiqim hujjati", id);
    if (doc.status === "CONFIRMED") throw new DocumentAlreadyConfirmedError();
    if (doc.status === "CANCELLED") throw new ConflictError("Bekor qilingan hujjatni tasdiqlab bo'lmaydi");

    const affectedProductIds = new Set<string>();

    // Snapshot pre-operation quantities so the low-stock alert below only
    // fires the moment a product CROSSES at-or-under its threshold, not on
    // every subsequent sale of an item that's already been low for days.
    const productIdsInDoc = [...new Set(doc.items.map((i) => i.productId))];
    const balancesBefore = await tx.productStockBalance.findMany({ where: { productId: { in: productIdsInDoc } } });
    const beforeQtyByProduct = new Map(balancesBefore.map((b) => [b.productId, Number(b.qtyOnHand)]));

    for (const item of doc.items) {
      affectedProductIds.add(item.productId);

      if (doc.docType === "CUSTOMER_RETURN") {
        const unitCost = await resolveCostBasis(tx, item.productId, item.unitCost);
        const batchNumber = await nextDocNumber(tx, "batch", "PARTIYA");
        const batch = await tx.batch.create({
          data: {
            productId: item.productId,
            supplierId: null,
            batchNumber,
            receivedAt: doc.documentDate,
            purchasePrice: unitCost,
            qtyReceived: item.qty,
            qtyRemaining: item.qty,
          },
        });
        await tx.stockOutDocumentItem.update({ where: { id: item.id }, data: { unitCost, batchId: batch.id } });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: batch.id,
            movementType: "CUSTOMER_RETURN",
            qtyDelta: item.qty,
            referenceDocumentType: "stock_out_document",
            referenceDocumentId: doc.id,
            createdBy: userId,
          },
        });
        continue;
      }

      const { allocations, totalCost } = await allocateFifo(tx, {
        productId: item.productId,
        productName: item.product.name,
        qtyNeeded: item.qty,
      });

      for (const allocation of allocations) {
        await tx.stockOutAllocation.create({
          data: {
            stockOutItemId: item.id,
            batchId: allocation.batchId,
            qtyTaken: allocation.qtyTaken,
            unitCostAtAllocation: allocation.unitCost,
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: allocation.batchId,
            movementType: doc.docType,
            qtyDelta: allocation.qtyTaken.negated(),
            referenceDocumentType: "stock_out_document",
            referenceDocumentId: doc.id,
            createdBy: userId,
          },
        });
      }

      await tx.stockOutDocumentItem.update({ where: { id: item.id }, data: { costOfGoodsTotal: totalCost } });
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    // CUSTOMER_RETURN only ever increases stock, so it can never cross INTO
    // low-stock — skip the check there, it would just do wasted work.
    if (doc.docType !== "CUSTOMER_RETURN") {
      lowStockCrossings = await findLowStockCrossings(tx, beforeQtyByProduct);
    }

    // A SALE is assumed paid in cash at the register (v1 has no on-credit
    // sales / accounts-receivable flow — see plan assumptions). WRITEOFF is
    // a loss with no money involved, RETURN_TO_SUPPLIER never touches cash.
    if (doc.docType === "SALE") {
      const totalAmount = doc.items.reduce((sum, item) => sum + (item.lineTotal ?? 0n), 0n);
      await createCashTransaction(tx, {
        type: "SALE_INCOME",
        amount: totalAmount,
        referenceDocumentType: "stock_out_document",
        referenceDocumentId: doc.id,
        note: `Sotuv ${doc.docNumber}`,
        userId,
      });
    }

    // Mijozdan qaytaruvda pul kassadan chiqadi. Ilgari buni menejer Kassa
    // sahifasidan qo'lda yozardi, lekin u sahifa olib tashlangan — shuning
    // uchun endi qaytaruv tasdiqlanganda avtomatik yoziladi, aks holda
    // kassa qoldig'i haqiqatdan ko'p bo'lib qolardi.
    if (doc.docType === "CUSTOMER_RETURN") {
      const refundAmount = doc.items.reduce((sum, item) => sum + (item.lineTotal ?? 0n), 0n);
      if (refundAmount > 0n) {
        await createCashTransaction(tx, {
          type: "CANCEL_REVERSAL",
          amount: -refundAmount,
          referenceDocumentType: "stock_out_document",
          referenceDocumentId: doc.id,
          note: `Mijozdan qaytaruv ${doc.docNumber}`,
          userId,
        });
      }
    }

    const updated = await tx.stockOutDocument.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedBy: userId, confirmedAt: new Date() },
      include: stockOutInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "stock_out.confirm",
      entityType: "StockOutDocument",
      entityId: id,
      afterData: updated,
    });
    return updated;
  });

  for (const crossing of lowStockCrossings) {
    await createNotification(prisma, {
      type: "LOW_STOCK",
      title: "Kam qoldiq",
      message: `${crossing.productName} (${crossing.sku}) — qoldiq: ${crossing.qtyOnHand}, chegara: ${crossing.minStockThreshold}`,
      entityType: "Product",
      entityId: crossing.productId,
    });
  }

  return toDto(result);
}

/**
 * Cancel: confirmed → cancelled, always via a reversing entry (never
 * deletes/mutates the original movements/allocations).
 * - SALE / WRITEOFF / RETURN_TO_SUPPLIER: adds each allocation's qty back
 *   to the batch it came from.
 * - CUSTOMER_RETURN: blocked if the batch it opened has already been sold
 *   from (BatchAlreadyConsumedError), same rule as stock-in cancel.
 */
export async function cancelDocument(
  prisma: PrismaClient,
  id: string,
  userId: string,
  reason: string,
): Promise<StockOutDocument> {
  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.stockOutDocument.findUnique({
      where: { id },
      include: { items: { include: { allocations: true, batch: true } } },
    });
    if (!doc) throw new NotFoundError("Chiqim hujjati", id);
    if (doc.status === "CANCELLED") throw new ConflictError("Hujjat allaqachon bekor qilingan");

    const affectedProductIds = new Set<string>();

    if (doc.status === "CONFIRMED") {
      if (doc.docType === "CUSTOMER_RETURN") {
        for (const item of doc.items) {
          if (item.batch && !item.batch.qtyRemaining.equals(item.batch.qtyReceived)) {
            throw new BatchAlreadyConsumedError();
          }
        }
        for (const item of doc.items) {
          if (!item.batch) continue;
          await tx.batch.update({ where: { id: item.batch.id }, data: { isClosed: true, qtyRemaining: 0 } });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              batchId: item.batch.id,
              movementType: "CANCEL_REVERSAL",
              qtyDelta: item.batch.qtyReceived.negated(),
              referenceDocumentType: "stock_out_document",
              referenceDocumentId: doc.id,
              createdBy: userId,
            },
          });
          affectedProductIds.add(item.productId);
        }
      } else {
        for (const item of doc.items) {
          for (const allocation of item.allocations) {
            await tx.batch.update({
              where: { id: allocation.batchId },
              data: { qtyRemaining: { increment: allocation.qtyTaken } },
            });
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                batchId: allocation.batchId,
                movementType: "CANCEL_REVERSAL",
                qtyDelta: allocation.qtyTaken,
                referenceDocumentType: "stock_out_document",
                referenceDocumentId: doc.id,
                createdBy: userId,
              },
            });
          }
          affectedProductIds.add(item.productId);
        }
      }

      if (doc.docType === "SALE") {
        const totalAmount = doc.items.reduce((sum, item) => sum + (item.lineTotal ?? 0n), 0n);
        await createCashTransaction(tx, {
          type: "CANCEL_REVERSAL",
          amount: -totalAmount,
          referenceDocumentType: "stock_out_document",
          referenceDocumentId: doc.id,
          note: `Sotuv ${doc.docNumber} bekor qilindi`,
          userId,
        });
      }

      // Qaytaruv bekor qilinsa — qaytarib berilgan pul kassaga qaytadi.
      if (doc.docType === "CUSTOMER_RETURN") {
        const refundAmount = doc.items.reduce((sum, item) => sum + (item.lineTotal ?? 0n), 0n);
        if (refundAmount > 0n) {
          await createCashTransaction(tx, {
            type: "CANCEL_REVERSAL",
            amount: refundAmount,
            referenceDocumentType: "stock_out_document",
            referenceDocumentId: doc.id,
            note: `Qaytaruv ${doc.docNumber} bekor qilindi`,
            userId,
          });
        }
      }
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    const updated = await tx.stockOutDocument.update({
      where: { id },
      data: { status: "CANCELLED", cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason },
      include: stockOutInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "stock_out.cancel",
      entityType: "StockOutDocument",
      entityId: id,
      afterData: updated,
    });
    return updated;
  });
  return toDto(result);
}
