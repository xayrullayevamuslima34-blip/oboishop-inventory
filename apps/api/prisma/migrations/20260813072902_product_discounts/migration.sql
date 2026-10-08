-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "product_discounts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "discount_type" "DiscountType" NOT NULL,
    "percent_value" INTEGER,
    "fixed_amount" BIGINT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_discounts_product_id_start_date_end_date_idx" ON "product_discounts"("product_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "product_discounts" ADD CONSTRAINT "product_discounts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
