"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contragent } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";

// Kassada mijozni tanlash — oddiy <select> emas, chunki sotuvchi ko'pincha
// yangi mijozni aynan shu payt qo'shishi kerak bo'ladi. Yozib borilganda
// mavjud mijozlar filtrlanadi; ro'yxatda yo'q bo'lsa, o'sha nom bilan
// darhol yangi mijoz yaratiladi va u Mijozlar sahifasida ham paydo bo'ladi.
export function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: Contragent[];
  value: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const trimmed = query.trim();
  const matches = trimmed
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          (c.phone ?? "").toLowerCase().includes(trimmed.toLowerCase()),
      )
    : customers;
  const exactExists = customers.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<Contragent>("/contragents", { method: "POST", body: { name, type: "CUSTOMER" } }),
    onSuccess: (created) => {
      // Mijozlar sahifasi ham shu kalitdan o'qiydi — yangi mijoz u yerda ham darhol ko'rinadi.
      queryClient.invalidateQueries({ queryKey: ["contragents"] });
      onChange(created.id);
      setQuery("");
      setOpen(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Mijoz qo'shishda xatolik"),
  });

  function select(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
    setError(null);
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-800">{selected.name}</span>
        <button
          type="button"
          onClick={() => select("")}
          aria-label="Mijozni bekor qilish"
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
        placeholder="Ism yoki telefon — yozing yoki tanlang"
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
          if (only) select(only.id);
          else if (trimmed && !exactExists && !createMutation.isPending) createMutation.mutate(trimmed);
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {trimmed && !exactExists && (
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate(trimmed)}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-60"
            >
              {createMutation.isPending ? "Qo'shilmoqda..." : `+ "${trimmed}" ni yangi mijoz sifatida qo'shish`}
            </button>
          )}
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c.id)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {c.name}
              {c.phone && <span className="ml-2 text-xs text-slate-400">{c.phone}</span>}
            </button>
          ))}
          {matches.length === 0 && !trimmed && (
            <p className="px-3 py-2 text-sm text-slate-400">Hali mijoz qo&apos;shilmagan</p>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
