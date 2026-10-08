import { z } from "zod";
import { moneyOutputSchema, quantityOutputSchema } from "./money.js";

export const batchSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  batchNumber: z.string(),
  receivedAt: z.string(),
  purchasePrice: moneyOutputSchema,
  qtyReceived: quantityOutputSchema,
  qtyRemaining: quantityOutputSchema,
  isClosed: z.boolean(),
  createdAt: z.string(),
});
export type Batch = z.infer<typeof batchSchema>;
