-- Turkum va brend butunlay olib tashlandi — o'rniga products.type maydoni.
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_category_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_brand_id_fkey";

ALTER TABLE "products" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "brand_id";

DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "brands";
