import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateInventoryCountInput, InventoryCount } from "@oboishop/shared";
import { nextDocNumber } from "../lib/document-sequence.js";
import { recomputeProductBalance } from "../lib/stock-balance.js";
import { resolveCostBasis } from "../lib/cost-basis.js";
import { computeLineTotal } from "../lib/money.js";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { allocateFifo } from "./fifoAllocation.js";
import { BatchAlreadyConsumedError, ConflictError, DocumentAlreadyConfirmedError, NotFoundError } from "../lib/errors.js";

const inventoryCountInclude = {
  items: { include: { product: { select: { name: true, sku: true } } } },
} satisfies Prisma.InventoryCountInclude;

type InventoryCountWithRelations = Prisma.InventoryCountGetPayload<{ include: typeof inventoryCountInclude }>;

function toDto(doc: InventoryCountWithRelations): InventoryCount {
  return toApiJson({
    id: doc.id,
    docNumber: doc.docNumber,
    status: doc.status,
    countDate: doc.countDate.toISOString(),
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
      systemQty: item.systemQty,
      countedQty: item.countedQty,
      difference: new Prisma.Decimal(item.countedQty).minus(item.systemQty).toString(),
      adjustmentValue: item.adjustmentValue,
    })),
  }) as InventoryCount;
}

/** Snapshots each product's current qty_on_hand as system_qty — see the
 * model comment in schema.prisma. Missing balance (never had stock) = 0. */
export async function createDraft(
  prisma: PrismaClient,
  input: CreateInventoryCountInput,
  userId: string,
): Promise<InventoryCount> {
  const doc = await prisma.$transaction(async (tx) => {
    const docNumber = await nextDocNumber(tx, "inventory_count", "REVIZIYA");

    const items = await Promise.all(
      input.items.map(async (item) => {
        const balance = await tx.productStockBalance.findUnique({ where: { productId: item.productId } });
        return {
          productId: item.productId,
          systemQty: balance?.qtyOnHand ?? 0,
          countedQty: item.countedQty,
        };
      }),
    );

    const created = await tx.inventoryCount.create({
      data: {
        docNumber,
        countDate: new Date(input.countDate),
        note: input.note ?? null,
        createdBy: userId,
        items: { create: items },
      },
      include: inventoryCountInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "inventory_count.create_draft",
      entityType: "InventoryCount",
      entityId: created.id,
      afterData: created,
    });
    return created;
  });
  return toDto(doc);
}

export async function listDocuments(
  prisma: PrismaClient,
  filters: { status?: "DRAFT" | "CONFIRMED" | "CANCELLED" },
): Promise<InventoryCount[]> {
  const rows = await prisma.inventoryCount.findMany({
    where: { status: filters.status },
    include: inventoryCountInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function getById(prisma: PrismaClient, id: string): Promise<InventoryCount> {
  const doc = await prisma.inventoryCount.findUnique({ where: { id }, include: inventoryCountInclude });
  if (!doc) throw new NotFoundError("Reviziya", id);
  return toDto(doc);
}

export async function deleteDraft(prisma: PrismaClient, id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const doc = await tx.inventoryCount.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Reviziya", id);
    if (doc.status !== "DRAFT") throw new ConflictError("Faqat qoralama (draft) hujjatni o'chirish mumkin");
    await tx.inventoryCount.delete({ where: { id } });
    await writeAuditLog(tx, {
      userId,
      action: "inventory_count.delete_draft",
      entityType: "InventoryCount",
      entityId: id,
      beforeData: doc,
    });
  });
}

/**
 * Confirm: for each line, difference = counted - system.
 * - difference > 0 (surplus found): opens a new batch, same pattern as
 *   CUSTOMER_RETURN (see stockOutService).
 * - difference < 0 (shrinkage/loss): consumes via FIFO, same pattern as
 *   WRITEOFF — insufficient stock here would mean the snapshot is stale
 *   (something else moved stock since the count was drafted); the whole
 *   confirm rolls back and the manager must recount.
 * - difference === 0: no movement, item is left as a record only.
 */
export async function confirmDocument(prisma: PrismaClient, id: string, userId: string): Promise<InventoryCount> {
  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.inventoryCount.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
    });
    if (!doc) throw new NotFoundError("Reviziya", id);
    if (doc.status === "CONFIRMED") throw new DocumentAlreadyConfirmedError();
    if (doc.status === "CANCELLED") throw new ConflictError("Bekor qilingan hujjatni tasdiqlab bo'lmaydi");

    const affectedProductIds = new Set<string>();

    for (const item of doc.items) {
      const difference = new Prisma.Decimal(item.countedQty).minus(item.systemQty);
      if (difference.equals(0)) continue;
      affectedProductIds.add(item.productId);

      if (difference.gt(0)) {
        const unitCost = await resolveCostBasis(tx, item.productId, null);
        const batchNumber = await nextDocNumber(tx, "batch", "PARTIYA");
        const batch = await tx.batch.create({
          data: {
            productId: item.productId,
            supplierId: null,
            batchNumber,
            receivedAt: doc.countDate,
            purchasePrice: unitCost,
            qtyReceived: difference,
            qtyRemaining: difference,
          },
        });
        await tx.inventoryCountItem.update({
          where: { id: item.id },
          data: { resultingBatchId: batch.id, adjustmentValue: computeLineTotal(unitCost, difference) },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: batch.id,
            movementType: "INVENTORY_ADJ_PLUS",
            qtyDelta: difference,
            referenceDocumentType: "inventory_count",
            referenceDocumentId: doc.id,
            createdBy: userId,
          },
        });
      } else {
        const qtyNeeded = difference.abs();
        const { allocations, totalCost } = await allocateFifo(tx, {
          productId: item.productId,
          productName: item.product.name,
          qtyNeeded,
        });

        for (const allocation of allocations) {
          await tx.inventoryAdjustmentAllocation.create({
            data: {
              inventoryCountItemId: item.id,
              batchId: allocation.batchId,
              qtyTaken: allocation.qtyTaken,
              unitCostAtAllocation: allocation.unitCost,
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              batchId: allocation.batchId,
              movementType: "INVENTORY_ADJ_MINUS",
              qtyDelta: allocation.qtyTaken.negated(),
              referenceDocumentType: "inventory_count",
              referenceDocumentId: doc.id,
              createdBy: userId,
            },
          });
        }

        await tx.inventoryCountItem.update({ where: { id: item.id }, data: { adjustmentValue: totalCost } });
      }
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    const updated = await tx.inventoryCount.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedBy: userId, confirmedAt: new Date() },
      include: inventoryCountInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "inventory_count.confirm",
      entityType: "InventoryCount",
      entityId: id,
      afterData: updated,
    });
    return updated;
  });
  return toDto(result);
}

export async function cancelDocument(
  prisma: PrismaClient,
  id: string,
  userId: string,
  reason: string,
): Promise<InventoryCount> {
  const result = await prisma.$transaction(async (tx) => {
    const doc = await tx.inventoryCount.findUnique({
      where: { id },
      include: { items: { include: { resultingBatch: true, allocations: true } } },
    });
    if (!doc) throw new NotFoundError("Reviziya", id);
    if (doc.status === "CANCELLED") throw new ConflictError("Hujjat allaqachon bekor qilingan");

    const affectedProductIds = new Set<string>();

    if (doc.status === "CONFIRMED") {
      for (const item of doc.items) {
        if (item.resultingBatch && !item.resultingBatch.qtyRemaining.equals(item.resultingBatch.qtyReceived)) {
          throw new BatchAlreadyConsumedError();
        }
      }
      for (const item of doc.items) {
        if (item.resultingBatch) {
          await tx.batch.update({ where: { id: item.resultingBatch.id }, data: { isClosed: true, qtyRemaining: 0 } });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              batchId: item.resultingBatch.id,
              movementType: "CANCEL_REVERSAL",
              qtyDelta: item.resultingBatch.qtyReceived.negated(),
              referenceDocumentType: "inventory_count",
              referenceDocumentId: doc.id,
              createdBy: userId,
            },
          });
          affectedProductIds.add(item.productId);
        }
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
              referenceDocumentType: "inventory_count",
              referenceDocumentId: doc.id,
              createdBy: userId,
            },
          });
          affectedProductIds.add(item.productId);
        }
      }
    }

    for (const productId of affectedProductIds) {
      await recomputeProductBalance(tx, productId);
    }

    const updated = await tx.inventoryCount.update({
      where: { id },
      data: { status: "CANCELLED", cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason },
      include: inventoryCountInclude,
    });

    await writeAuditLog(tx, {
      userId,
      action: "inventory_count.cancel",
      entityType: "InventoryCount",
      entityId: id,
      afterData: updated,
    });
    return updated;
  });
  return toDto(result);
}
