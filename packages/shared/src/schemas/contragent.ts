import { z } from "zod";
import { ContragentType } from "../enums.js";
import { moneyOutputSchema } from "./money.js";

export const createContragentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.nativeEnum(ContragentType),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type CreateContragentInput = z.infer<typeof createContragentSchema>;

export const updateContragentSchema = createContragentSchema.partial();
export type UpdateContragentInput = z.infer<typeof updateContragentSchema>;

export const contragentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.nativeEnum(ContragentType),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  // Musbat = kontragent bizga qarzdor; manfiy = biz kontragentga qarzdormiz.
  balance: moneyOutputSchema,
});
export type Contragent = z.infer<typeof contragentSchema>;
