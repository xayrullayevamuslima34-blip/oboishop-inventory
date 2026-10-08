import { z } from "zod";
import { DocumentStatus, StockOutDocType } from "../enums.js";
import { moneyInputSchema, moneyOutputSchema, quantityInputSchema, quantityOutputSchema } from "./money.js";

export const createStockOutItemSchema = z.object({
  productId: z.string().uuid(),
  qty: quantityInputSchema,
  // SALE uchun majburiy; CUSTOMER_RETURN uchun tan-narx (unitCost) beriladi;
  // WRITEOFF/RETURN_TO_SUPPLIER uchun ikkalasi ham shart emas.
  salePrice: moneyInputSchema.nullable().optional(),
  unitCost: moneyInputSchema.nullable().optional(),
});
export type CreateStockOutItemInput = z.infer<typeof createStockOutItemSchema>;

export const createStockOutDocumentSchema = z.object({
  docType: z.nativeEnum(StockOutDocType),
  contragentId: z.string().uuid().nullable().optional(),
  documentDate: z.string().min(1, "Sana kerak"),
  note: z.string().trim().max(1000).nullable().optional(),
  items: z.array(createStockOutItemSchema).min(1, "Kamida bitta mahsulot qatori kerak"),
});
export type CreateStockOutDocumentInput = z.infer<typeof createStockOutDocumentSchema>;

// Tasdiqlangan hujjatning mahsulot qatorlarini o'zgartirib bo'lmaydi —
// ombor qoldig'i va kassa allaqachon shu qatorlar asosida yozilgan. Faqat
// mijoz va izohni to'g'rilashga ruxsat beramiz; tovar yoki narx xato bo'lsa
// hujjat bekor qilinib, yangisi rasmiylashtiriladi.
export const updateStockOutDocumentSchema = z.object({
  contragentId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateStockOutDocumentInput = z.infer<typeof updateStockOutDocumentSchema>;

export const stockOutAllocationSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  qtyTaken: quantityOutputSchema,
  unitCostAtAllocation: moneyOutputSchema,
});
export type StockOutAllocation = z.infer<typeof stockOutAllocationSchema>;

export const stockOutDocumentItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().optional(),
  productSku: z.string().optional(),
  // Hujjat ko'rinishida o'lchov birligi va o'ram ma'lumoti ham kerak —
  // mahsulot keyin o'zgarsa ham hujjatdagi qator o'sha holda ko'rinishi
  // uchun ular so'rov vaqtida mahsulotdan olinadi.
  productUnit: z.string().optional(),
  productPackName: z.string().nullable().optional(),
  productPackSize: quantityOutputSchema.nullable().optional(),
  qty: quantityOutputSchema,
  salePrice: moneyOutputSchema.nullable(),
  unitCost: moneyOutputSchema.nullable(),
  lineTotal: moneyOutputSchema.nullable(),
  costOfGoodsTotal: moneyOutputSchema.nullable(),
  allocations: z.array(stockOutAllocationSchema).optional(),
});
export type StockOutDocumentItem = z.infer<typeof stockOutDocumentItemSchema>;

export const stockOutDocumentSchema = z.object({
  id: z.string().uuid(),
  docNumber: z.string(),
  docType: z.nativeEnum(StockOutDocType),
  contragentId: z.string().uuid().nullable(),
  contragentName: z.string().optional(),
  status: z.nativeEnum(DocumentStatus),
  documentDate: z.string(),
  note: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable().optional(),
  confirmedBy: z.string().uuid().nullable(),
  confirmedByName: z.string().nullable().optional(),
  confirmedAt: z.string().nullable(),
  cancelledBy: z.string().uuid().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(stockOutDocumentItemSchema),
  totalAmount: moneyOutputSchema,
  totalCostOfGoods: moneyOutputSchema.nullable(),
});
export type StockOutDocument = z.infer<typeof stockOutDocumentSchema>;
