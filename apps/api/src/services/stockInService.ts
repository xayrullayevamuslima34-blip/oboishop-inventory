import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateStockInDocumentInput, StockInDocument } from "@oboishop/shared";
import { nextDocNumber } from "../lib/document-sequence.js";
import { recomputeProductBalance } from "../lib/stock-balance.js";
import { computeLineTotal } from "../lib/money.js";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { createLedgerEntry, notifyDebtThresholdCrossing } from "./contragentLedgerService.js";
import { BatchAlreadyConsumedError, ConflictError, DocumentAlreadyConfirmedError, NotFoundError } from "../lib/errors.js";

const stockInInclude = {
  items: { include: { product: { select: { name: true, sku: true } } } },
  supplier: { select: { name: true } },
} satisfies Prisma.StockInDocumentInclude;

type StockInDocumentWithRelations = Prisma.StockInDocumentGetPayload<{ include: typeof stockInInclude }>;

function toDto(doc: StockInDocumentWithRelations): StockInDocument {
  const totalAmount = doc.items.reduce((sum, item) => sum + item.lineTotal, 0n);
  return toApiJson({
    id: doc.id,
    docNumber: doc.docNumber,
    supplierId: doc.supplierId,
    supplierName: doc.supplier?.name,
    status: doc.status,
    documentDate: doc.documentDate.toISOString(),
    note: doc.note,
    createdBy: doc.createdBy,
    confirmedBy: doc.confirmedBy,
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
      qty: item.qty,
      purchasePrice: item.purchasePrice,
      lineTotal: item.lineTotal,
      batchId: item.batchId,
    })),
    totalAmount,
  }) as StockInDocument;
}

export async function createDraft(
  prisma: PrismaClient,
  input: CreateStockInDocumentInput,
  userId: string,
): Promise<StockInDocument> {
  const doc = await prisma.$transaction(async (tx) => {
    const docNumber = await nextDocNumber(tx, "stock_in", "KIRIM");
    const created = await tx.stockInDocument.create({
      data: {
        docNumber,
        supplierId: input.supplierId ?? null,
        documentDate: new Date(input.documentDate),
        note: input.note ?? null,
        createdBy: userId,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            purchasePrice: BigInt(item.purchasePrice),
            lineTotal: computeLineTotal(BigInt(item.purchasePrice), item.qty),
          })),
        },
      },
      include: stockInInclude,
    });
    await writeAuditLog(tx, {
      userId,
      action: "stock_in.create_draft",
      entityType: "StockInDocument",
      entityId: created.id,
      afterData: created,
    });
    return created;
  });
  return toDto(doc);
}

export async function listDocuments(
  prisma: PrismaClient,
  filters: { status?: "DRAFT" | "CONFIRMED" | "CANCELLED"; supplierId?: string },
): Promise<StockInDocument[]> {
  const rows = await prisma.stockInDocument.findMany({
    where: { status: filters.status, supplierId: filters.supplierId },
    include: stockInInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function getById(prisma: PrismaClient, id: string): Promise<StockInDocument> {
  const doc = await prisma.stockInDocument.findUnique({ where: { id }, include: stockInInclude });
  if (!doc) throw new NotFoundError("Kirim hujjati", id);
  return toDto(doc);
}

export async function deleteDraft(prisma: PrismaClient, id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doc = await tx.stockInDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Kirim hujjati", id);
    if (doc.status !== "DRAFT") throw new ConflictError("Faqat qoralama (draft) hujjatni o'chirish mumkin");
    await tx.stockInDocument.delete({ where: { id } });
    await writeAuditLog(tx, {
      userId,
      action: "stock_in.delete_draft",
      entityType: "StockInDocument",
      entityId: id,
      beforeData: doc,
    });
  });
}

/**
 * Confirm: draft → confirmed. For each line, opens a new batch at that
 * line's purchase price and writes a STOCK_IN movement. See
 * docs/ARCHITECTURE.md for why balances are recomputed rather than
 * incremented.
 */
export async function confirmDocument(prisma: PrismaClient, id: string, userId: string): Promise<StockInDocument> {
  const { doc: result, supplierDebtCrossing } = await prisma.$transaction(async (tx) => {
    const doc = await tx.stockInDocument.findUnique({ where: { id }, include: { items: true } });
    if (!doc) throw new NotFoundError("Kirim hujjati", id);
    if (doc.status === "CONFIRMED") throw new DocumentAlreadyConfirmedError();
    if (doc.status === "CANCELLED") throw new ConflictError("Bekor qilingan hujjatni tasdiqlab bo'lmaydi");

    let supplierDebtCrossing: { id: string; name: string; before: bigint; after: bigint } | null = null;
    const affectedProductIds = new Set<string>();

    for (const item of doc.items) {
      const batchNumber = await nextDocNumber(tx, "batch", "PARTIYA");
      const batch = await tx.batch.create({
        data: {
          productId: item.productId,
          supplierId: doc.supplierId,
          batchNumber,
          receivedAt: doc.documentDate,
          purchasePrice: item.purchasePrice,
          qtyReceived: item.qty,
          qtyRemaining: item.qty,
        },
      });
      await tx.stockInDocumentItem.update({ where: { id: item.id }, data: { batchId: batch.id } });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          batchId: batch.id,
          movementType: "STOCK_IN",
          qtyDelta: item.qty,
          referenceDocumentType: "stock_in_document",
          referenceDocumentId: doc.id,
          createdBy: userId,
        },
      });
      affectedProductIds.add(item.productId);
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    // Goods received on credit increase what we owe the supplier. No
    // contragent set (e.g. a cash/petty purchase) means no ledger entry —
    // see plan assumption on contragent-less batches.
    if (doc.supplierId) {
      const totalAmount = doc.items.reduce((sum, item) => sum + item.lineTotal, 0n);
      const beforeAgg = await tx.contragentLedgerEntry.aggregate({
        where: { contragentId: doc.supplierId },
        _sum: { amount: true },
      });
      const before = beforeAgg._sum.amount ?? 0n;

      await createLedgerEntry(tx, {
        contragentId: doc.supplierId,
        entryType: "INVOICE",
        amount: -totalAmount,
        referenceDocumentType: "stock_in_document",
        referenceDocumentId: doc.id,
        note: `Kirim ${doc.docNumber}`,
        userId,
      });

      const supplier = await tx.contragent.findUnique({ where: { id: doc.supplierId }, select: { name: true } });
      supplierDebtCrossing = { id: doc.supplierId, name: supplier?.name ?? "", before, after: before - totalAmount };
    }

    const updated = await tx.stockInDocument.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedBy: userId, confirmedAt: new Date() },
      include: stockInInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "stock_in.confirm",
      entityType: "StockInDocument",
      entityId: id,
      afterData: updated,
    });
    return { doc: updated, supplierDebtCrossing };
  });

  if (supplierDebtCrossing) {
    await notifyDebtThresholdCrossing(
      prisma,
      supplierDebtCrossing.id,
      supplierDebtCrossing.name,
      supplierDebtCrossing.before,
      supplierDebtCrossing.after,
    );
  }

  return toDto(result);
}

/**
 * Cancel: confirmed → cancelled. Blocked if any batch this document created
 * has already been (partially) consumed by a stock-out — see
 * BatchAlreadyConsumedError. A draft can always be cancelled (no reversal
 * needed, it never touched stock).
 */
export async function cancelDocument(
  prisma: PrismaClient,
  id: string,
  userId: string,
  reason: string,
): Promise<StockInDocument> {
  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.stockInDocument.findUnique({
      where: { id },
      include: { items: { include: { batch: true } } },
    });
    if (!doc) throw new NotFoundError("Kirim hujjati", id);
    if (doc.status === "CANCELLED") throw new ConflictError("Hujjat allaqachon bekor qilingan");

    const affectedProductIds = new Set<string>();

    if (doc.status === "CONFIRMED") {
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
            referenceDocumentType: "stock_in_document",
            referenceDocumentId: doc.id,
            createdBy: userId,
          },
        });
        affectedProductIds.add(item.productId);
      }

      if (doc.supplierId) {
        const totalAmount = doc.items.reduce((sum, item) => sum + item.lineTotal, 0n);
        await createLedgerEntry(tx, {
          contragentId: doc.supplierId,
          entryType: "CANCEL_REVERSAL",
          amount: totalAmount,
          referenceDocumentType: "stock_in_document",
          referenceDocumentId: doc.id,
          note: `Kirim ${doc.docNumber} bekor qilindi`,
          userId,
        });
      }
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    const updated = await tx.stockInDocument.update({
      where: { id },
      data: { status: "CANCELLED", cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason },
      include: stockInInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "stock_in.cancel",
      entityType: "StockInDocument",
      entityId: id,
      afterData: updated,
    });
    return updated;
  });
  return toDto(result);
}
