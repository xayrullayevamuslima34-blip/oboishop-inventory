-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockOutDocType" AS ENUM ('SALE', 'CUSTOMER_RETURN', 'RETURN_TO_SUPPLIER', 'WRITEOFF');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCK_IN', 'SALE', 'WRITEOFF', 'RETURN_TO_SUPPLIER', 'CUSTOMER_RETURN', 'CANCEL_REVERSAL');

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "batch_number" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "purchase_price" BIGINT NOT NULL,
    "qty_received" DECIMAL(12,3) NOT NULL,
    "qty_remaining" DECIMAL(12,3) NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_in_documents" (
    "id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "supplier_id" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "document_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_in_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_in_document_items" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "purchase_price" BIGINT NOT NULL,
    "line_total" BIGINT NOT NULL,
    "batch_id" TEXT,

    CONSTRAINT "stock_in_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_out_documents" (
    "id" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "doc_type" "StockOutDocType" NOT NULL,
    "contragent_id" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "document_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_out_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_out_document_items" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "sale_price" BIGINT,
    "unit_cost" BIGINT,
    "line_total" BIGINT,
    "cost_of_goods_total" BIGINT,

    CONSTRAINT "stock_out_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_out_allocations" (
    "id" TEXT NOT NULL,
    "stock_out_item_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "qty_taken" DECIMAL(12,3) NOT NULL,
    "unit_cost_at_allocation" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_out_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "movement_type" "MovementType" NOT NULL,
    "qty_delta" DECIMAL(12,3) NOT NULL,
    "reference_document_type" TEXT NOT NULL,
    "reference_document_id" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stock_balance" (
    "product_id" TEXT NOT NULL,
    "qty_on_hand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "avg_cost" BIGINT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stock_balance_pkey" PRIMARY KEY ("product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_batch_number_key" ON "batches"("batch_number");

-- CreateIndex
CREATE INDEX "batches_product_id_received_at_idx" ON "batches"("product_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_in_documents_doc_number_key" ON "stock_in_documents"("doc_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_out_documents_doc_number_key" ON "stock_out_documents"("doc_number");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "contragents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_documents" ADD CONSTRAINT "stock_in_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "contragents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_document_items" ADD CONSTRAINT "stock_in_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_in_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_document_items" ADD CONSTRAINT "stock_in_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_in_document_items" ADD CONSTRAINT "stock_in_document_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_documents" ADD CONSTRAINT "stock_out_documents_contragent_id_fkey" FOREIGN KEY ("contragent_id") REFERENCES "contragents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_document_items" ADD CONSTRAINT "stock_out_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_out_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_document_items" ADD CONSTRAINT "stock_out_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_allocations" ADD CONSTRAINT "stock_out_allocations_stock_out_item_id_fkey" FOREIGN KEY ("stock_out_item_id") REFERENCES "stock_out_document_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_out_allocations" ADD CONSTRAINT "stock_out_allocations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock_balance" ADD CONSTRAINT "product_stock_balance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
