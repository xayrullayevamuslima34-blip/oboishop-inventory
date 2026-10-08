import { z } from "zod";
import { MovementType } from "../enums.js";
import { quantityOutputSchema } from "./money.js";

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable(),
  movementType: z.nativeEnum(MovementType),
  qtyDelta: quantityOutputSchema,
  referenceDocumentType: z.string(),
  referenceDocumentId: z.string(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;
