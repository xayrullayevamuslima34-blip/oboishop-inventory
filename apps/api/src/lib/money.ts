import { Prisma } from "@prisma/client";

/**
 * unitPrice (whole so'm) × qty (NUMERIC(12,3)) → whole so'm, rounded.
 *
 * v1 quantities are always whole rolls in practice (see plan), so doing the
 * multiply as a JS number and rounding back to BigInt is safe (realistic
 * UZS amounts are far below Number.MAX_SAFE_INTEGER) and simpler than
 * fighting Decimal.js for a single intermediate value. The rounded result
 * is the only thing that ever reaches the database — floats never are
 * stored. See docs/ARCHITECTURE.md.
 */
export function computeLineTotal(unitPrice: bigint, qty: Prisma.Decimal | number | string): bigint {
  return BigInt(Math.round(Number(unitPrice) * Number(qty)));
}

/** Thousands-separated so'm, for server-generated text (in-app notification
 * messages, etc.) — server has no Intl.NumberFormat locale data guarantee,
 * so this is done by hand. */
export function formatSom(amount: bigint): string {
  const sign = amount < 0n ? "-" : "";
  const digits = (amount < 0n ? -amount : amount).toString();
  const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSeparators} so'm`;
}
