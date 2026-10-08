import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ContragentStatement,
  CreateAdjustmentEntryInput,
  CreatePaymentEntryInput,
  LedgerEntry,
} from "@oboishop/shared";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { formatSom } from "../lib/money.js";
import { createNotification } from "../lib/notifications.js";
import { env } from "../env.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Fires once when a contragent's |balance| CROSSES the configured threshold
 * (in either debt direction) — not every time it's simply already over, the
 * same crossing-detection shape as low-stock alerts (see
 * lib/stock-balance.ts#findLowStockCrossings) and for the same reason: the
 * menejer shouldn't see a fresh notification on every subsequent
 * invoice/payment against an account that's already flagged. No-ops when
 * DEBT_ALERT_THRESHOLD is unset (default), so this never fires in dev/test.
 */
export async function notifyDebtThresholdCrossing(
  prisma: Pick<PrismaClient, "notification">,
  contragentId: string,
  contragentName: string,
  beforeBalance: bigint,
  afterBalance: bigint,
): Promise<void> {
  const threshold = env.DEBT_ALERT_THRESHOLD;
  if (threshold <= 0n) return;

  const beforeAbs = beforeBalance < 0n ? -beforeBalance : beforeBalance;
  const afterAbs = afterBalance < 0n ? -afterBalance : afterBalance;
  if (afterAbs >= threshold && beforeAbs < threshold) {
    const direction = afterBalance < 0n ? "biz qarzdormiz" : "bizga qarzdor";
    await createNotification(prisma, {
      type: "DEBT_THRESHOLD",
      title: "Qarz limiti oshdi",
      message: `${contragentName}: ${formatSom(afterAbs)} (${direction})`,
      entityType: "Contragent",
      entityId: contragentId,
    });
  }
}

function toDto(entry: {
  id: string;
  contragentId: string;
  entryType: string;
  amount: bigint;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}): LedgerEntry {
  return toApiJson({ ...entry, createdAt: entry.createdAt.toISOString() }) as LedgerEntry;
}

/**
 * Low-level primitive — every ledger-affecting operation in the system
 * (kirim confirm/cancel, manual payments, adjustments) goes through this so
 * the append-only invariant is never accidentally violated by a UPDATE/DELETE
 * elsewhere. `amount` must already be signed correctly by the caller.
 */
export async function createLedgerEntry(
  tx: Prisma.TransactionClient,
  input: {
    contragentId: string;
    entryType: "INVOICE" | "PAYMENT" | "PREPAYMENT" | "ADJUSTMENT" | "CANCEL_REVERSAL";
    amount: bigint;
    referenceDocumentType?: string | null;
    referenceDocumentId?: string | null;
    note?: string | null;
    userId: string | null;
  },
): Promise<void> {
  const entry = await tx.contragentLedgerEntry.create({
    data: {
      contragentId: input.contragentId,
      entryType: input.entryType,
      amount: input.amount,
      referenceDocumentType: input.referenceDocumentType ?? null,
      referenceDocumentId: input.referenceDocumentId ?? null,
      note: input.note ?? null,
      createdBy: input.userId,
    },
  });
  await writeAuditLog(tx, {
    userId: input.userId,
    action: `contragent_ledger.${input.entryType.toLowerCase()}`,
    entityType: "ContragentLedgerEntry",
    entityId: entry.id,
    afterData: entry,
  });
}

export async function getBalance(prisma: Pick<PrismaClient, "contragentLedgerEntry">, contragentId: string): Promise<bigint> {
  const result = await prisma.contragentLedgerEntry.aggregate({
    where: { contragentId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0n;
}

export async function listEntries(prisma: PrismaClient, contragentId: string): Promise<LedgerEntry[]> {
  const rows = await prisma.contragentLedgerEntry.findMany({
    where: { contragentId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

/** Manual payment/prepayment — direction determines the sign, never the
 * caller directly, so a UI bug can't silently move debt the wrong way. */
export async function createPayment(
  prisma: PrismaClient,
  contragentId: string,
  input: CreatePaymentEntryInput,
  userId: string,
): Promise<LedgerEntry> {
  const contragent = await prisma.contragent.findUnique({ where: { id: contragentId } });
  if (!contragent) throw new NotFoundError("Kontragent", contragentId);

  const signedAmount = input.direction === "OUT" ? BigInt(input.amount) : -BigInt(input.amount);
  const beforeBalance = await getBalance(prisma, contragentId);

  const entry = await prisma.$transaction(async (tx) => {
    await createLedgerEntry(tx, {
      contragentId,
      entryType: input.entryType,
      amount: signedAmount,
      note: input.note,
      userId,
    });
    return tx.contragentLedgerEntry.findFirstOrThrow({
      where: { contragentId },
      orderBy: { createdAt: "desc" },
    });
  });

  await notifyDebtThresholdCrossing(prisma, contragentId, contragent.name, beforeBalance, beforeBalance + signedAmount);

  return toDto(entry);
}

export async function createAdjustment(
  prisma: PrismaClient,
  contragentId: string,
  input: CreateAdjustmentEntryInput,
  userId: string,
): Promise<LedgerEntry> {
  const contragent = await prisma.contragent.findUnique({ where: { id: contragentId } });
  if (!contragent) throw new NotFoundError("Kontragent", contragentId);

  const signedAmount = BigInt(input.amount);
  const beforeBalance = await getBalance(prisma, contragentId);

  const entry = await prisma.$transaction(async (tx) => {
    await createLedgerEntry(tx, {
      contragentId,
      entryType: "ADJUSTMENT",
      amount: signedAmount,
      note: input.note,
      userId,
    });
    return tx.contragentLedgerEntry.findFirstOrThrow({
      where: { contragentId },
      orderBy: { createdAt: "desc" },
    });
  });

  await notifyDebtThresholdCrossing(prisma, contragentId, contragent.name, beforeBalance, beforeBalance + signedAmount);

  return toDto(entry);
}

/**
 * Kelishuv akti (statement) — a computed report, not a stored document (see
 * plan assumption #2: this is not a bilaterally-signed e-document). Opening
 * balance is the sum of everything strictly before `from`; entries in
 * [from, to] are listed; closing balance is opening + those entries.
 */
export async function getStatement(prisma: PrismaClient, contragentId: string, from: Date, to: Date): Promise<ContragentStatement> {
  const contragent = await prisma.contragent.findUnique({ where: { id: contragentId } });
  if (!contragent) throw new NotFoundError("Kontragent", contragentId);

  const [openingSum, entries] = await Promise.all([
    prisma.contragentLedgerEntry.aggregate({
      where: { contragentId, createdAt: { lt: from } },
      _sum: { amount: true },
    }),
    prisma.contragentLedgerEntry.findMany({
      where: { contragentId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const openingBalance = openingSum._sum.amount ?? 0n;
  const closingBalance = entries.reduce((sum, e) => sum + e.amount, openingBalance);

  return toApiJson({
    contragentId,
    contragentName: contragent.name,
    from: from.toISOString(),
    to: to.toISOString(),
    openingBalance,
    closingBalance,
    entries: entries.map(toDto),
  }) as ContragentStatement;
}
