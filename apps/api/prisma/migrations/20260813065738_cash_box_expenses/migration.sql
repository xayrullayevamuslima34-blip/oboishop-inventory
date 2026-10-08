-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('SALE_INCOME', 'MANUAL_INCOME', 'EXPENSE', 'CANCEL_REVERSAL');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "expense_category_id" TEXT,
    "reference_document_type" TEXT,
    "reference_document_id" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_transactions_created_at_idx" ON "cash_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
