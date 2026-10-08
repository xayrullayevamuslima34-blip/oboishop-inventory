import { Prisma } from "@prisma/client";
import { InsufficientStockError } from "../lib/errors.js";
import { computeLineTotal } from "../lib/money.js";

export interface FifoAllocation {
  batchId: string;
  qtyTaken: Prisma.Decimal;
  unitCost: bigint;
  lineCost: bigint;
}

export interface FifoAllocationResult {
  allocations: FifoAllocation[];
  totalCost: bigint;
}

/**
 * The single highest-risk function in the system — see docs/ARCHITECTURE.md
 * and the plan's "To'g'rilik va test strategiyasi" section. Must always be
 * called inside an existing `prisma.$transaction(async (tx) => ...)`.
 *
 * Locks every candidate batch for the product with `SELECT ... FOR UPDATE`
 * ordered oldest-received-first, then greedily consumes from the front of
 * that list until `qtyNeeded` is satisfied. If total available stock is
 * less than needed, throws `InsufficientStockError` — the caller's
 * transaction rolls back as a whole, so no partial allocation is ever
 * persisted (v1 disallows negative stock / backorders).
 *
 * Batch quantity updates happen here (not left to the caller) so the row
 * locks taken by the SELECT are released only after the corresponding
 * UPDATEs, within the same transaction — closing the window where a second
 * concurrent transaction could read stale `qty_remaining`.
 */
export async function allocateFifo(
  tx: Prisma.TransactionClient,
  params: { productId: string; productName: string; qtyNeeded: Prisma.Decimal | number | string },
): Promise<FifoAllocationResult> {
  const qtyNeeded = new Prisma.Decimal(params.qtyNeeded);
  if (qtyNeeded.lte(0)) {
    throw new Error("allocateFifo: qtyNeeded must be positive");
  }

  const candidates = await tx.$queryRaw<{ id: string; qty_remaining: string; purchase_price: string }[]>`
    SELECT id, qty_remaining, purchase_price
    FROM batches
    WHERE product_id = ${params.productId} AND qty_remaining > 0 AND is_closed = false
    ORDER BY received_at ASC, id ASC
    FOR UPDATE
  `;

  const allocations: FifoAllocation[] = [];
  let remaining = qtyNeeded;

  for (const row of candidates) {
    if (remaining.lte(0)) break;
    const available = new Prisma.Decimal(row.qty_remaining);
    const qtyTaken = Prisma.Decimal.min(available, remaining);
    if (qtyTaken.lte(0)) continue;

    const unitCost = BigInt(row.purchase_price);
    const lineCost = computeLineTotal(unitCost, qtyTaken);

    allocations.push({ batchId: row.id, qtyTaken, unitCost, lineCost });
    remaining = remaining.minus(qtyTaken);
  }

  if (remaining.gt(0)) {
    const totalAvailable = qtyNeeded.minus(remaining);
    throw new InsufficientStockError(params.productName, qtyNeeded.toString(), totalAvailable.toString());
  }

  for (const allocation of allocations) {
    await tx.batch.update({
      where: { id: allocation.batchId },
      data: { qtyRemaining: { decrement: allocation.qtyTaken } },
    });
  }

  const totalCost = allocations.reduce((sum, a) => sum + a.lineCost, 0n);
  return { allocations, totalCost };
}
