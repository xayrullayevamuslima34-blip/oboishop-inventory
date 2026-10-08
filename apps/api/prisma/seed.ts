import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("sklad12345", 10);
  const admin = await prisma.user.upsert({
    where: { username: "menejer" },
    update: {},
    create: {
      username: "menejer",
      passwordHash,
      fullName: "Sklad Menejeri",
      role: "SKLAD_MENEJERI",
    },
  });
  console.log(`Foydalanuvchi tayyor: ${admin.username} / sklad12345`);

  // Mirrors a few real SKUs so the dev/demo data feels real.
  const products = [
    { sku: "OB-0001", name: "news", baseMaterial: "VINIL" as const, defaultSalePrice: 250000n },
    { sku: "OB-0002", name: "test", baseMaterial: "VINIL" as const, defaultSalePrice: 150000n },
    { sku: "OB-0003", name: "smth", baseMaterial: "VINIL" as const, defaultSalePrice: 100000n },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        baseMaterial: p.baseMaterial,
        type: "Oboy",
        sizeWidthM: 1.06,
        sizeLengthM: 10,
        defaultSalePrice: p.defaultSalePrice,
        minStockThreshold: 5,
      },
    });
  }

  await prisma.contragent.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Namuna Yetkazib Beruvchi MChJ",
      type: "SUPPLIER",
      phone: "+998901234567",
    },
  });

  console.log("Boshlang'ich ma'lumotlar (mahsulot, turkum, brend, kontragent) tayyor.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
