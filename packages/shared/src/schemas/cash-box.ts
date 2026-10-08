import { z } from "zod";
import { CashTransactionType } from "../enums.js";
import { moneyOutputSchema } from "./money.js";

const positiveMoneyInput = z.coerce.number().int().positive("Summa 0 dan katta bo'lishi kerak");

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const expenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const createManualIncomeSchema = z.object({
  amount: positiveMoneyInput,
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateManualIncomeInput = z.infer<typeof createManualIncomeSchema>;

export const createExpenseSchema = z.object({
  expenseCategoryId: z.string().uuid(),
  amount: positiveMoneyInput,
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const cashTransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(CashTransactionType),
  amount: moneyOutputSchema,
  expenseCategoryId: z.string().uuid().nullable(),
  expenseCategoryName: z.string().optional(),
  referenceDocumentType: z.string().nullable(),
  referenceDocumentId: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type CashTransaction = z.infer<typeof cashTransactionSchema>;
