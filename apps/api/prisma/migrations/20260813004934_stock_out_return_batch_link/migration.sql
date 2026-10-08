-- AlterTable
ALTER TABLE "stock_out_document_items" ADD COLUMN     "batch_id" TEXT;

-- AddForeignKey
ALTER TABLE "stock_out_document_items" ADD CONSTRAINT "stock_out_document_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
