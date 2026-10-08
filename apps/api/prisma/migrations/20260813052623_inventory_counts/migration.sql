-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementType" ADD VALUE 'INVENTORY_ADJ_PLUS';
ALTER TYPE "MovementType" ADD VALUE 'INVENTORY_ADJ_MINUS';

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "count_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" TEXT NOT NULL,
    "inventory_count_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "system_qty" DECIMAL(12,3) NOT NULL,
    "counted_qty" DECIMAL(12,3) NOT NULL,
    "adjustment_value" BIGINT,
    "resulting_batch_id" TEXT,

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_allocations" (
    "id" TEXT NOT NULL,
    "inventory_count_item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "qty_taken" DECIMAL(12,3) NOT NULL,
    "unit_cost_at_allocation" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_doc_number_key" ON "inventory_counts"("doc_number");

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_inventory_count_id_fkey" FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_resulting_batch_id_fkey" FOREIGN KEY ("resulting_batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_allocations" ADD CONSTRAINT "inventory_adjustment_allocations_inventory_count_item_id_fkey" FOREIGN KEY ("inventory_count_item_id") REFERENCES "inventory_count_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustment_allocations" ADD CONSTRAINT "inventory_adjustment_allocations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
