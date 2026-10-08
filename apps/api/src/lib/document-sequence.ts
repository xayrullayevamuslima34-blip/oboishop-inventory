import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Atomically allocates the next sequential number for a document type/year
 * and returns a human-readable doc number like "KIRIM-2026-000123".
 *
 * Uses a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement —
 * Postgres takes the row lock as part of the UPDATE, so concurrent callers
 * are serialized without a separate SELECT ... FOR UPDATE round-trip and
 * without ever handing out the same number twice.
 */
export async function nextDocNumber(tx: Tx, docType: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO document_sequences (doc_type, year, last_number)
    VALUES (${docType}, ${year}, 1)
    ON CONFLICT (doc_type, year)
    DO UPDATE SET last_number = document_sequences.last_number + 1
    RETURNING last_number
  `;
  const lastNumber = rows[0]?.last_number;
  if (lastNumber === undefined) {
    throw new Error(`Hujjat raqamini generatsiya qilib bo'lmadi (doc_type=${docType})`);
  }
  return `${prefix}-${year}-${String(lastNumber).padStart(6, "0")}`;
}
