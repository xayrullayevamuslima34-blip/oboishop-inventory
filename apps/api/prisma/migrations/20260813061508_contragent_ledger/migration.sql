-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INVOICE', 'PAYMENT', 'PREPAYMENT', 'ADJUSTMENT', 'CANCEL_REVERSAL');

-- CreateTable
CREATE TABLE "contragent_ledger_entries" (
    "id" TEXT NOT NULL,
    "contragent_id" TEXT NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reference_document_type" TEXT,
    "reference_document_id" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contragent_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contragent_ledger_entries_contragent_id_created_at_idx" ON "contragent_ledger_entries"("contragent_id", "created_at");

-- AddForeignKey
ALTER TABLE "contragent_ledger_entries" ADD CONSTRAINT "contragent_ledger_entries_contragent_id_fkey" FOREIGN KEY ("contragent_id") REFERENCES "contragents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
