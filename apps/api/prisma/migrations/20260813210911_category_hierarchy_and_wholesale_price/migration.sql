-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "wholesale_price" BIGINT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
