import { Prisma, type PrismaClient } from "@prisma/client";
import type { CashTransaction, CreateExpenseInput, CreateManualIncomeInput } from "@oboishop/shared";
import { writeAuditLog } from "../lib/audit.js";
import { toApiJson } from "../lib/serialize.js";
import { NotFoundError } from "../lib/errors.js";

function toDto(tx: {
  id: string;
  type: string;
  amount: bigint;
  expenseCategoryId: string | null;
  expenseCategoryName?: string;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}): CashTransaction {
  return toApiJson({ ...tx, createdAt: tx.createdAt.toISOString() }) as CashTransaction;
}

/**
 * Low-level primitive — every cash-affecting operation (sale confirm/cancel,
 * manual income, expenses) goes through this so the append-only invariant
 * holds. `amount` must already be signed correctly by the caller.
 */
export async function createTransaction(
  tx: Prisma.TransactionClient,
  input: {
    type: "SALE_INCOME" | "MANUAL_INCOME" | "EXPENSE" | "CANCEL_REVERSAL";
    amount: bigint;
    expenseCategoryId?: string | null;
    referenceDocumentType?: string | null;
    referenceDocumentId?: string | null;
    note?: string | null;
    userId: string | null;
  },
) {
  const created = await tx.cashTransaction.create({
    data: {
      type: input.type,
      amount: input.amount,
      expenseCategoryId: input.expenseCategoryId ?? null,
      referenceDocumentType: input.referenceDocumentType ?? null,
      referenceDocumentId: input.referenceDocumentId ?? null,
      note: input.note ?? null,
      createdBy: input.userId,
    },
  });
  await writeAuditLog(tx, {
    userId: input.userId,
    action: `cash_box.${input.type.toLowerCase()}`,
    entityType: "CashTransaction",
    entityId: created.id,
    afterData: created,
  });
  return created;
}

export async function getBalance(prisma: Pick<PrismaClient, "cashTransaction">): Promise<bigint> {
  const result = await prisma.cashTransaction.aggregate({ _sum: { amount: true } });
  return result._sum.amount ?? 0n;
}

export async function listTransactions(
  prisma: PrismaClient,
  filters: { type?: "SALE_INCOME" | "MANUAL_INCOME" | "EXPENSE" | "CANCEL_REVERSAL"; from?: Date; to?: Date },
): Promise<CashTransaction[]> {
  const rows = await prisma.cashTransaction.findMany({
    where: {
      type: filters.type,
      createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    },
    include: { expenseCategory: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toDto({ ...r, expenseCategoryName: r.expenseCategory?.name }));
}

export async function createManualIncome(
  prisma: PrismaClient,
  input: CreateManualIncomeInput,
  userId: string,
): Promise<CashTransaction> {
  const tx = await prisma.$transaction(async (t) => {
    const created = await createTransaction(t, { type: "MANUAL_INCOME", amount: BigInt(input.amount), note: input.note, userId });
    return t.cashTransaction.findUniqueOrThrow({ where: { id: created.id } });
  });
  return toDto(tx);
}

export async function createExpense(prisma: PrismaClient, input: CreateExpenseInput, userId: string): Promise<CashTransaction> {
  const category = await prisma.expenseCategory.findUnique({ where: { id: input.expenseCategoryId } });
  if (!category) throw new NotFoundError("Xarajat turkumi", input.expenseCategoryId);

  const tx = await prisma.$transaction(async (t) => {
    const created = await createTransaction(t, {
      type: "EXPENSE",
      amount: -BigInt(input.amount),
      expenseCategoryId: input.expenseCategoryId,
      note: input.note,
      userId,
    });
    return t.cashTransaction.findUniqueOrThrow({
      where: { id: created.id },
      include: { expenseCategory: { select: { name: true } } },
    });
  });
  return toDto({ ...tx, expenseCategoryName: tx.expenseCategory?.name });
}
