import type { Prisma } from "@prisma/client";

/**
 * Default cost basis for stock that *increases* without a purchase price
 * of its own (CUSTOMER_RETURN, positive inventory-count adjustment): the
 * product's current weighted-average cost, else its most recent batch
 * purchase price, else 0. Always overridable by the caller (`provided`).
 */
export async function resolveCostBasis(
  tx: Prisma.TransactionClient,
  productId: string,
  provided: bigint | null,
): Promise<bigint> {
  if (provided !== null) return provided;
  const balance = await tx.productStockBalance.findUnique({ where: { productId } });
  if (balance?.avgCost != null) return balance.avgCost;
  const lastBatch = await tx.batch.findFirst({ where: { productId }, orderBy: { receivedAt: "desc" } });
  return lastBatch?.purchasePrice ?? 0n;
}
