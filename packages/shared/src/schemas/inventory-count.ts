import { z } from "zod";
import { DocumentStatus } from "../enums.js";
import { moneyOutputSchema, quantityInputSchema, quantityOutputSchema } from "./money.js";

export const createInventoryCountItemSchema = z.object({
  productId: z.string().uuid(),
  countedQty: quantityInputSchema.or(z.literal(0)),
});
export type CreateInventoryCountItemInput = z.infer<typeof createInventoryCountItemSchema>;

export const createInventoryCountSchema = z.object({
  countDate: z.string().min(1, "Sana kerak"),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z.array(createInventoryCountItemSchema).min(1, "Kamida bitta mahsulot qatori kerak"),
});
export type CreateInventoryCountInput = z.infer<typeof createInventoryCountSchema>;

export const inventoryCountItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().optional(),
  productSku: z.string().optional(),
  systemQty: quantityOutputSchema,
  countedQty: quantityOutputSchema,
  difference: z.string(),
  adjustmentValue: moneyOutputSchema.nullable(),
});
export type InventoryCountItem = z.infer<typeof inventoryCountItemSchema>;

export const inventoryCountSchema = z.object({
  id: z.string().uuid(),
  docNumber: z.string(),
  status: z.nativeEnum(DocumentStatus),
  countDate: z.string(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  confirmedBy: z.string().uuid().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(inventoryCountItemSchema),
});
export type InventoryCount = z.infer<typeof inventoryCountSchema>;
