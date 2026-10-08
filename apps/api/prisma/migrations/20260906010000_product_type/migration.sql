-- Turkum/brend o'rniga bitta erkin matnli "turi" maydoni.
ALTER TABLE "products" ADD COLUMN "type" TEXT;
CREATE INDEX "products_type_idx" ON "products"("type");
