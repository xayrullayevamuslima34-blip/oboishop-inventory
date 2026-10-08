import { z } from "zod";
import { DocumentStatus } from "../enums.js";
import { moneyInputSchema, moneyOutputSchema, quantityInputSchema, quantityOutputSchema } from "./money.js";

export const createStockInItemSchema = z.object({
  productId: z.string().uuid(),
  qty: quantityInputSchema,
  purchasePrice: moneyInputSchema,
});
export type CreateStockInItemInput = z.infer<typeof createStockInItemSchema>;

export const createStockInDocumentSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  documentDate: z.string().min(1, "Sana kerak"),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z.array(createStockInItemSchema).min(1, "Kamida bitta mahsulot qatori kerak"),
});
export type CreateStockInDocumentInput = z.infer<typeof createStockInDocumentSchema>;

export const cancelDocumentSchema = z.object({
  reason: z.string().trim().min(3, "Bekor qilish sababini kiriting"),
});
export type CancelDocumentInput = z.infer<typeof cancelDocumentSchema>;

export const stockInDocumentItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().optional(),
  productSku: z.string().optional(),
  qty: quantityOutputSchema,
  purchasePrice: moneyOutputSchema,
  lineTotal: moneyOutputSchema,
  batchId: z.string().uuid().nullable(),
});
export type StockInDocumentItem = z.infer<typeof stockInDocumentItemSchema>;

export const stockInDocumentSchema = z.object({
  id: z.string().uuid(),
  docNumber: z.string(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().optional(),
  status: z.nativeEnum(DocumentStatus),
  documentDate: z.string(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  confirmedBy: z.string().uuid().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(stockInDocumentItemSchema),
  totalAmount: moneyOutputSchema,
});
export type StockInDocument = z.infer<typeof stockInDocumentSchema>;
