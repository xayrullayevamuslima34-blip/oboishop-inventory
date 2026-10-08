"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Contragent, Product } from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import { PAGE_LINKS } from "@/components/sidebar";

type ProductResult = Product & { qtyOnHand: string };

const CONTRAGENT_TYPE_LABEL: Record<string, string> = {
  CUSTOMER: "Mijoz",
  SUPPLIER: "Yetkazib beruvchi",
  BOTH: "Mijoz + Yetkazib beruvchi",
};

const UNIT_LABEL: Record<string, string> = {
  RULON: "rulon",
  DONA: "dona",
  METR: "metr",
};

// Global ⌘K / Ctrl+K search — sahifalar orasida tezkor o'tish (har doim ko'rinadi,
// so'rovga qarab filtrlanadi) hamda mahsulot/kontragent qidiruvi (2+ belgidan).
// Mounted once in AppShell so the shortcut works everywhere.
// `open`/`onOpenChange` are controlled by AppShell so its header button and
// the keyboard shortcut can toggle the same instance.
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const setOpen = onOpenChange;
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [contragents, setContragents] = useState<Contragent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const pages = PAGE_LINKS.filter((p) => p.label.toLowerCase().includes(normalizedQuery));

  type FlatItem = { href: string } & (
    | { kind: "page"; label: string }
    | { kind: "product"; product: ProductResult }
    | { kind: "contragent"; contragent: Contragent }
  );
  const flatItems: FlatItem[] = [
    ...pages.map((p): FlatItem => ({ kind: "page", href: p.href, label: p.label })),
    ...products.map((p): FlatItem => ({ kind: "product", href: `/products/${p.id}`, product: p })),
    ...contragents.map((c): FlatItem => ({ kind: "contragent", href: `/customers/${c.id}`, contragent: c })),
  ];

  // Klaviatura tinglovchisi faqat `open` o'zgarganda qayta ulanadi (har bosishda emas) —
  // shuning uchun eng so'nggi ro'yxat/tanlovni "ref" orqali o'qiydi, aks holda Enter
  // eskirgan (oldingi so'rovdagi) ro'yxatga ishora qilib qolishi mumkin edi.
  const flatItemsRef = useRef<FlatItem[]>(flatItems);
  flatItemsRef.current = flatItems;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItemsRef.current.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const item = flatItemsRef.current[selectedIndexRef.current];
        if (item) go(item.href);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setProducts([]);
      setContragents([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setProducts([]);
      setContragents([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        apiFetch<ProductResult[]>(`/products?search=${encodeURIComponent(query)}`).catch(() => []),
        apiFetch<Contragent[]>(`/contragents?search=${encodeURIComponent(query)}`).catch(() => []),
      ])
        .then(([p, c]) => {
          setProducts(p.slice(0, 6));
          setContragents(c.slice(0, 6));
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  const hasEntityResults = products.length > 0 || contragents.length > 0;
  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sahifaga o'tish yoki mahsulot/kontragent qidirish..."
          className="w-full border-b border-slate-200 px-4 py-3 text-sm outline-none"
        />
        <div className="max-h-96 overflow-y-auto p-2">
          {pages.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 text-xs font-semibold uppercase text-slate-400">Sahifalar</p>
              {pages.map((p) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <button
                    key={p.href}
                    onClick={() => go(p.href)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                      idx === selectedIndex ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      {p.label}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{p.href}</span>
                  </button>
                );
              })}
            </div>
          )}

          {normalizedQuery.length >= 2 && loading && <p className="px-3 py-4 text-sm text-slate-400">Qidirilmoqda...</p>}
          {normalizedQuery.length >= 2 && !loading && !hasEntityResults && pages.length === 0 && (
            <p className="px-3 py-4 text-sm text-slate-400">Hech narsa topilmadi</p>
          )}

          {products.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 text-xs font-semibold uppercase text-slate-400">Mahsulotlar</p>
              {products.map((p) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <button
                    key={p.id}
                    onClick={() => go(`/products/${p.id}`)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                      idx === selectedIndex ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{p.name}</span>
                      <span className="block text-xs text-slate-500">{p.sku}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-600">
                      {formatQuantity(p.qtyOnHand)} {UNIT_LABEL[p.unit] ?? p.unit}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {contragents.length > 0 && (
            <div>
              <p className="px-3 py-1 text-xs font-semibold uppercase text-slate-400">Kontragentlar</p>
              {contragents.map((c) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <button
                    key={c.id}
                    onClick={() => go(`/customers/${c.id}`)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      idx === selectedIndex ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100"
                    }`}
                  >
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <span className="text-xs text-slate-500">{CONTRAGENT_TYPE_LABEL[c.type] ?? c.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
