import { z } from "zod";
import { LedgerDirection, LedgerEntryType } from "../enums.js";
import { moneyOutputSchema } from "./money.js";

// Payment/prepayment amounts are always entered as a positive number — the
// UI asks "OUT" (biz to'ladik) or "IN" (biz oldik) and the backend derives
// the signed ledger amount from that, so a typo here can never accidentally
// flip which direction the money moved.
const positiveMoneyInput = z.coerce.number().int().positive("Summa 0 dan katta bo'lishi kerak");

export const createPaymentEntrySchema = z.object({
  entryType: z.enum([LedgerEntryType.PAYMENT, LedgerEntryType.PREPAYMENT]),
  direction: z.nativeEnum(LedgerDirection),
  amount: positiveMoneyInput,
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreatePaymentEntryInput = z.infer<typeof createPaymentEntrySchema>;

export const createAdjustmentEntrySchema = z.object({
  // Signed — a manual correction can go either direction.
  amount: z.coerce.number().int().refine((v) => v !== 0, "Summa 0 bo'lishi mumkin emas"),
  note: z.string().trim().min(3, "Tuzatish sababini kiriting").max(500),
});
export type CreateAdjustmentEntryInput = z.infer<typeof createAdjustmentEntrySchema>;

export const ledgerEntrySchema = z.object({
  id: z.string().uuid(),
  contragentId: z.string().uuid(),
  entryType: z.nativeEnum(LedgerEntryType),
  amount: moneyOutputSchema,
  referenceDocumentType: z.string().nullable(),
  referenceDocumentId: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const contragentStatementSchema = z.object({
  contragentId: z.string().uuid(),
  contragentName: z.string(),
  from: z.string(),
  to: z.string(),
  openingBalance: moneyOutputSchema,
  closingBalance: moneyOutputSchema,
  entries: z.array(ledgerEntrySchema),
});
export type ContragentStatement = z.infer<typeof contragentStatementSchema>;
