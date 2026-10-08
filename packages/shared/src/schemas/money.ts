import { z } from "zod";

// Money is stored as BIGINT (whole so'm) in Postgres. Prisma returns BigInt
// values which JSON.stringify cannot serialize natively, so the API always
// sends money fields out as strings; on the way in we accept a plain
// non-negative integer (number or numeric string) and coerce it.
export const moneyInputSchema = z.coerce
  .number()
  .int("Summani butun son sifatida kiriting (tiyin qo'llab-quvvatlanmaydi)")
  .nonnegative("Summa manfiy bo'lishi mumkin emas");
export type MoneyInput = z.infer<typeof moneyInputSchema>;

export const moneyOutputSchema = z.string().regex(/^-?\d+$/);
export type MoneyOutput = z.infer<typeof moneyOutputSchema>;

// Quantities are NUMERIC(12,3) — allow up to 3 decimal places.
export const quantityInputSchema = z.coerce
  .number()
  .positive("Miqdor 0 dan katta bo'lishi kerak")
  .refine((v) => Math.round(v * 1000) === v * 1000, {
    message: "Miqdorda 3 tadan ortiq kasr xona bo'lishi mumkin emas",
  });
export type QuantityInput = z.infer<typeof quantityInputSchema>;

export const quantityOutputSchema = z.string();
export type QuantityOutput = z.infer<typeof quantityOutputSchema>;

// Tan narx (kirim narxi) so'mdan tashqari valyutada ham kiritilishi mumkin —
// shuning uchun u BIGINT emas, NUMERIC(14,2) sifatida saqlanadi (dollarda
// tiyin/sent bo'ladi) va yoniga valyuta kodi yoziladi.
export const currencyCodeSchema = z.enum(["UZS", "USD", "EUR", "RUB"]);
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

export const decimalMoneyInputSchema = z.coerce
  .number()
  .nonnegative("Narx manfiy bo'lishi mumkin emas")
  .refine((v) => Math.round(v * 100) === Math.round(v * 100), { message: "Narx noto'g'ri" });
export type DecimalMoneyInput = z.infer<typeof decimalMoneyInputSchema>;

export const decimalMoneyOutputSchema = z.string();
export type DecimalMoneyOutput = z.infer<typeof decimalMoneyOutputSchema>;
