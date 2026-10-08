"use client";

import { useEffect } from "react";

// Sozlamalardagi "Profil" va "Parolni o'zgartirish" oynalari uchun umumiy
// qobiq. Fon bosilganda va Esc bosilganda yopiladi — ⌘K qidiruv oynasi
// bilan bir xil xatti-harakat, foydalanuvchi ikki xil qoidani o'rganmasin.
const WIDTH_CLASS = { md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "md",
  printable = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Ikki ustunli formalar uchun kengroq oyna kerak bo'ladi. */
  width?: keyof typeof WIDTH_CLASS;
  /** Oyna ichidagi hujjatni chop etish kerak bo'lsa — oyna bosma varaqda
      yashirilmaydi (odatda modal chop etishda umuman chiqmaydi). */
  printable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10 ${
        printable ? "print:static print:block print:overflow-visible print:bg-transparent print:p-0" : "print:hidden"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${WIDTH_CLASS[width]} rounded-xl bg-white shadow-xl ring-1 ring-slate-200 ${
          printable ? "print:max-w-none print:rounded-none print:shadow-none print:ring-0" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 print:hidden">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Yopish"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
