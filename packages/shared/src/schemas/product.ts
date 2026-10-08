import { z } from "zod";
import { BaseMaterial, ProductUnit } from "../enums.js";
import {
  currencyCodeSchema,
  decimalMoneyInputSchema,
  decimalMoneyOutputSchema,
  moneyInputSchema,
  moneyOutputSchema,
  quantityInputSchema,
  quantityOutputSchema,
} from "./money.js";

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  // Turkum/brend o'rniga ishlatiladigan yagona erkin matnli maydon.
  type: z.string().trim().max(60).nullable().optional(),
  baseMaterial: z.nativeEnum(BaseMaterial).default(BaseMaterial.BOSHQA),
  sizeWidthM: z.coerce.number().positive().nullable().optional(),
  sizeLengthM: z.coerce.number().positive().nullable().optional(),
  unit: z.nativeEnum(ProductUnit).default(ProductUnit.RULON),
  // Qadoq (o'ram) — ixtiyoriy. packSize = bitta qadoqdagi asosiy birlik
  // miqdori; to'ldirilsa, kassada qadoq bilan sotish mumkin bo'ladi.
  packName: z.string().trim().max(40).nullable().optional(),
  packSize: quantityInputSchema.nullable().optional(),
  // Barcode is optional on create — if omitted, the backend auto-generates one.
  barcode: z.string().trim().max(64).nullable().optional(),
  // "Chakana narx" (yagona mijozga sotish narxi).
  defaultSalePrice: moneyInputSchema.nullable().optional(),
  // "Ulgurji narx" — katta miqdorda sotib oluvchi mijozlar uchun.
  wholesalePrice: moneyInputSchema.nullable().optional(),
  // "Kirim narxi" (tan narx) — ma'lumot uchun: mahsulot qanchaga olingani.
  // Valyutada ham kiritilishi mumkin. FIFO tannarx hisobiga ta'sir qilmaydi —
  // u haqiqiy kirim partiyalaridan olinadi.
  purchasePrice: decimalMoneyInputSchema.nullable().optional(),
  purchaseCurrency: currencyCodeSchema.nullable().optional(),
  minStockThreshold: quantityInputSchema.nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  baseMaterial: z.nativeEnum(BaseMaterial),
  sizeWidthM: z.string().nullable(),
  sizeLengthM: z.string().nullable(),
  unit: z.nativeEnum(ProductUnit),
  packName: z.string().nullable(),
  packSize: quantityOutputSchema.nullable(),
  barcode: z.string().nullable(),
  imageUrl: z.string().nullable(),
  defaultSalePrice: moneyOutputSchema.nullable(),
  purchasePrice: decimalMoneyOutputSchema.nullable(),
  purchaseCurrency: currencyCodeSchema.nullable(),
  wholesalePrice: moneyOutputSchema.nullable(),
  minStockThreshold: quantityOutputSchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  tagIds: z.array(z.string().uuid()).default([]),
});
export type Product = z.infer<typeof productSchema>;

export const productStockBalanceSchema = z.object({
  productId: z.string().uuid(),
  qtyOnHand: quantityOutputSchema,
  avgCost: moneyOutputSchema.nullable(),
  updatedAt: z.string(),
});
export type ProductStockBalance = z.infer<typeof productStockBalanceSchema>;
