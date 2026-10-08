-- Mahsulotning kirim narxi (tan narx) va uning valyutasi.
ALTER TABLE "products" ADD COLUMN "purchase_price" DECIMAL(14,2);
ALTER TABLE "products" ADD COLUMN "purchase_currency" TEXT;
