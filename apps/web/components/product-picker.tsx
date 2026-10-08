"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@oboishop/shared";
import { formatMoney, formatQuantity } from "@/lib/format";

// Kassadagi mahsulot tanlash ro'yxati — nomi bilan birga narxi va joriy
// qoldig'i ko'rinib turadi, shuning uchun sotuvchi alohida ombor sahifasiga
// kirmasdan tanlaydi. Yozib qidirish nomi, artikul va shtrix-kod bo'yicha.
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: (Product & { qtyOnHand?: string })[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.sku.toLowerCase().includes(trimmed) ||
          (p.barcode ?? "").includes(trimmed),
      )
    : products;

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-800">{selected.name}</span>
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Mahsulotni bekor qilish"
          className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        placeholder="Mahsulot — tanlang yoki yozing"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const only = matches.length === 1 ? matches[0] : null;
          if (only) {
            onChange(only.id);
            setQuery("");
            setOpen(false);
          }
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Mahsulot topilmadi</p>}
          {matches.slice(0, 50).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 truncate font-medium text-slate-800">{p.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-700">
                  {formatMoney(p.defaultSalePrice)}
                </span>
                {p.qtyOnHand !== undefined && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
                    {formatQuantity(p.qtyOnHand)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
