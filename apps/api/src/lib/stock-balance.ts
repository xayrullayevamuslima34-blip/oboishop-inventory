import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Recomputes `product_stock_balance` for a product FROM SCRATCH, from the
 * batches table (the source of truth) — rather than incrementally
 * adding/subtracting deltas. This is deliberately the more expensive
 * approach: an incrementally-maintained balance can drift from reality if
 * any single call site has a bug, silently and permanently. Recomputing
 * from `batches` on every balance-affecting operation makes that class of
 * bug impossible — the denormalized value is always a pure function of the
 * source of truth. Batch counts per product are small for a single-shop
 * system, so the extra query is cheap.
 *
 * Call this inside the same transaction as any operation that creates or
 * updates a batch's qty_remaining (stock-in confirm/cancel, stock-out
 * confirm/cancel). See docs/ARCHITECTURE.md.
 */
export async function recomputeProductBalance(tx: Tx, productId: string): Promise<void> {
  const activeBatches = await tx.batch.findMany({
    where: { productId, qtyRemaining: { gt: 0 } },
    select: { qtyRemaining: true, purchasePrice: true },
  });

  const qtyOnHand = activeBatches.reduce((sum, b) => sum + Number(b.qtyRemaining), 0);
  const totalCost = activeBatches.reduce((sum, b) => sum + Number(b.qtyRemaining) * Number(b.purchasePrice), 0);
  const avgCost = qtyOnHand > 0 ? BigInt(Math.round(totalCost / qtyOnHand)) : null;

  await tx.productStockBalance.upsert({
    where: { productId },
    create: { productId, qtyOnHand, avgCost: avgCost ?? undefined },
    update: { qtyOnHand, avgCost: avgCost ?? null },
  });
}

export interface LowStockCrossing {
  productId: string;
  productName: string;
  sku: string;
  qtyOnHand: number;
  minStockThreshold: number;
}

/**
 * Detects products that just dropped AT OR BELOW their min-stock threshold
 * as a result of the operation the caller just ran — not every product
 * that's simply already low. Comparing against a "before" snapshot the
 * caller took prior to recomputeProductBalance() is what keeps this from
 * re-notifying admins on every single sale of an item that's been low for
 * a week (see stockOutService.ts#confirmDocument for the call site).
 */
export async function findLowStockCrossings(
  tx: Tx,
  beforeQtyByProduct: Map<string, number>,
): Promise<LowStockCrossing[]> {
  const productIds = [...beforeQtyByProduct.keys()];
  if (productIds.length === 0) return [];

  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, minStockThreshold: { not: null } },
    select: { id: true, name: true, sku: true, minStockThreshold: true, productStockBalance: { select: { qtyOnHand: true } } },
  });

  const crossings: LowStockCrossing[] = [];
  for (const p of products) {
    const threshold = Number(p.minStockThreshold);
    const after = Number(p.productStockBalance?.qtyOnHand ?? 0);
    // No prior balance row means this product has never been stocked before
    // — treat "before" as unbounded so a brand-new product that immediately
    // lands at/under its threshold still triggers the first alert.
    const before = beforeQtyByProduct.has(p.id) ? beforeQtyByProduct.get(p.id)! : Number.POSITIVE_INFINITY;
    if (after <= threshold && before > threshold) {
      crossings.push({ productId: p.id, productName: p.name, sku: p.sku, qtyOnHand: after, minStockThreshold: threshold });
    }
  }
  return crossings;
}
