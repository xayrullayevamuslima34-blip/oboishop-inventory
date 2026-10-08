"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";

const TYPE_ICON: Record<string, string> = {
  LOW_STOCK: "⚠️",
  DEBT_THRESHOLD: "💰",
};

function entityHref(n: Notification): string | null {
  if (n.entityType === "Product" && n.entityId) return `/products/${n.entityId}`;
  if (n.entityType === "Contragent" && n.entityId) return `/customers/${n.entityId}`;
  return null;
}

// Telegram integratsiyasi olib tashlangandan keyingi o'rniga keldi — faqat
// "harakat kerak" turdagi hodisalar (kam qoldiq, qarz limiti) uchun,
// tizimda faol o'tirgan menejer ularni ko'rishi uchun. Header'da bir marta
// mount qilinadi, shuning uchun har sahifada bir xil holat ko'rinadi.
export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const unreadCountQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });
  const listQuery = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => apiFetch<Notification[]>("/notifications?limit=20"),
    enabled: open,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiFetch<Notification>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });

  const unreadCount = unreadCountQuery.data?.count ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
        aria-label="Bildirishnomalar"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Bildirishnomalar</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Hammasini o&apos;qilgan qilish
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {listQuery.data?.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">Bildirishnoma yo&apos;q</p>
              )}
              {listQuery.data?.map((n) => {
                const href = entityHref(n);
                function handleClick() {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  setOpen(false);
                }
                const content = (
                  <div className={`px-4 py-3 text-sm ${n.isRead ? "" : "bg-brand-50"}`}>
                    <p className="font-medium text-slate-900">
                      {TYPE_ICON[n.type] ?? ""} {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString("uz-UZ")}</p>
                  </div>
                );
                return (
                  <div key={n.id} className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    {href ? (
                      <Link href={href} onClick={handleClick}>
                        {content}
                      </Link>
                    ) : (
                      <div onClick={handleClick}>{content}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
