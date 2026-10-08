-- Mahsulotga ixtiyoriy qadoq (o'ram) ma'lumoti.
ALTER TABLE "products" ADD COLUMN "pack_name" TEXT;
ALTER TABLE "products" ADD COLUMN "pack_size" DECIMAL(12,3);
