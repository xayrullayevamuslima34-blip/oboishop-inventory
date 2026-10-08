import { z } from "zod";

// Logo bazada `data:` URL sifatida saqlanadi, fayl sifatida emas — mahsulot
// rasmlaridan farqli o'laroq (ular `uploads/` diskiga tushadi). Sabab: API
// konteyneriga doimiy disk (volume) ulanmagan, ya'ni har qayta deploy'da
// disk tozalanadi. Logo esa har bir chekda chiqadi, shuning uchun uni
// yo'qotib qo'ymaslik muhimroq. Bitta kichik rasm uchun bu maqbul.
const MAX_LOGO_BYTES = 200 * 1024;

export const shopLogoSchema = z
  .string()
  .startsWith("data:image/", "Logo rasm bo'lishi kerak")
  .max(MAX_LOGO_BYTES, "Logo hajmi 200 KB dan oshmasligi kerak");

export const shopSettingsSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  logo: z.string().nullable(),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

// Bo'sh satr = "maydonni tozalash" degani. Formadan har doim satr keladi
// (input'da null tushunchasi yo'q), shuning uchun bo'sh satrni shu yerda
// null'ga aylantiramiz — aks holda bazada "" va NULL aralashib ketardi.
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable();

export const updateShopSettingsSchema = z.object({
  name: z.string().trim().min(1, "Do'kon nomi bo'sh bo'lishi mumkin emas").max(128),
  address: optionalText(256),
  phone: optionalText(32),
  logo: shopLogoSchema.nullable(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
