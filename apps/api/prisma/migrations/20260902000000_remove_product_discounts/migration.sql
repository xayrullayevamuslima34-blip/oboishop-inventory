-- Chegirma/aksiya funksiyasi butunlay olib tashlandi.

-- DropForeignKey
ALTER TABLE "product_discounts" DROP CONSTRAINT IF EXISTS "product_discounts_product_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "product_discounts";

-- DropEnum
DROP TYPE IF EXISTS "DiscountType";
