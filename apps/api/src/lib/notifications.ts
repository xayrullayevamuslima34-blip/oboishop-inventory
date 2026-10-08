import type { PrismaClient } from "@prisma/client";

/**
 * In-app bildirishnomalar — Telegram integratsiyasi olib tashlangandan
 * keyingi o'rniga keldi (qarang docs/ARCHITECTURE.md). Faqat "harakat
 * kerak" turdagi hodisalar uchun ishlatiladi (kam qoldiq, qarz limiti) —
 * odatiy kirim/chiqim tasdiqlash bu yerga yozilmaydi, aks holda menejer
 * o'zi qilgan har bir amaliyot uchun o'ziga bildirishnoma ko'rgan bo'lardi.
 */
export async function createNotification(
  prisma: Pick<PrismaClient, "notification">,
  input: {
    type: "LOW_STOCK" | "DEBT_THRESHOLD";
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<void> {
  await prisma.notification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}
