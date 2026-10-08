import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { shopSettingsSchema, updateShopSettingsSchema } from "@oboishop/shared";
import { writeAuditLog } from "../lib/audit.js";

// Tizim bitta magazin uchun — shuning uchun shop_settings jadvalida doim
// bitta qator bo'ladi va u shu qat'iy id bilan topiladi (schema.prisma'dagi
// ShopSetting izohiga qarang).
const SHOP_SETTINGS_ID = "shop";

// Sozlama hech qachon yaratilmagan bo'lsa (yangi o'rnatish, seed'siz baza)
// GET bo'sh javob qaytarmasligi kerak — frontend'da "sozlama yo'q" degan
// alohida holatni qo'llab-quvvatlamaslik uchun shu yerda standart qatorni
// yaratib beramiz.
const DEFAULT_NAME = "Oboishop";

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", fastify.requireRole());

  async function loadShopSettings() {
    return fastify.prisma.shopSetting.upsert({
      where: { id: SHOP_SETTINGS_ID },
      update: {},
      create: { id: SHOP_SETTINGS_ID, name: DEFAULT_NAME },
    });
  }

  app.get("/shop", { schema: { response: { 200: shopSettingsSchema } } }, async () => {
    const settings = await loadShopSettings();
    return { name: settings.name, address: settings.address, phone: settings.phone, logo: settings.logo };
  });

  app.patch(
    "/shop",
    { schema: { body: updateShopSettingsSchema, response: { 200: shopSettingsSchema } } },
    async (request) => {
      const before = await loadShopSettings();
      const { name, address, phone, logo } = request.body;

      const settings = await fastify.prisma.shopSetting.update({
        where: { id: SHOP_SETTINGS_ID },
        data: { name, address, phone, logo },
      });

      // Logoning base64 satri audit jurnalini keraksiz shishirmasligi uchun
      // faqat "bor/yo'q" holati yoziladi — o'zgarish faktini ko'rsatish
      // uchun shuning o'zi yetarli.
      await writeAuditLog(fastify.prisma, {
        userId: request.user.sub,
        action: "shop_settings.update",
        entityType: "ShopSetting",
        entityId: SHOP_SETTINGS_ID,
        beforeData: { name: before.name, address: before.address, phone: before.phone, hasLogo: before.logo !== null },
        afterData: { name: settings.name, address: settings.address, phone: settings.phone, hasLogo: settings.logo !== null },
      });

      return { name: settings.name, address: settings.address, phone: settings.phone, logo: settings.logo };
    },
  );
};
