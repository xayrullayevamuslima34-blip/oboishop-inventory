"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProductInput, CurrencyCode, Product } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Bir necha mahsulotni ketma-ket kiritish uchun jadval ko'rinishidagi ekran.
// Har bir qator alohida POST /products so'rovi bo'ladi: biri xato bersa
// qolganlari baribir saqlanadi, xato bergan qator jadvalda sababi bilan
// qoladi va foydalanuvchi tuzatib qayta saqlaydi.
interface Row {
  key: number;
  name: string;
  sku: string;
  barcode: string;
  type: string;
  unit: CreateProductInput["unit"];
  defaultSalePrice: string;
  wholesalePrice: string;
  purchasePrice: string;
  purchaseCurrency: string;
  initialQty: string;
  minStockThreshold: string;
  packName: string;
  packSize: string;
  /** Saqlangandan keyin: "ok" — yaratildi, satr xabari — xato. */
  status: "idle" | "ok" | { error: string };
}

let nextKey = 1;
function emptyRow(): Row {
  return {
    key: nextKey++,
    name: "",
    sku: "",
    barcode: "",
    type: "",
    unit: "RULON",
    defaultSalePrice: "",
    wholesalePrice: "",
    purchasePrice: "",
    purchaseCurrency: "UZS",
    initialQty: "",
    minStockThreshold: "",
    packName: "",
    packSize: "",
    status: "idle",
  };
}

export default function BulkNewProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [saving, setSaving] = useState(false);

  const typesQuery = useQuery({ queryKey: ["product-types"], queryFn: () => apiFetch<string[]>("/products/types") });

  const pending = rows.filter((r) => r.status !== "ok");
  const savedCount = rows.filter((r) => r.status === "ok").length;
  const failedCount = rows.filter((r) => typeof r.status === "object").length;

  function update(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((r) => r.key !== key)));
  }

  function toInput(row: Row): CreateProductInput {
    return {
      name: row.name.trim(),
      sku: row.sku.trim(),
      barcode: row.barcode.trim() || null,
      type: row.type.trim() || null,
      baseMaterial: "BOSHQA",
      unit: row.unit,
      defaultSalePrice: row.defaultSalePrice ? Number(row.defaultSalePrice) : null,
      wholesalePrice: row.wholesalePrice ? Number(row.wholesalePrice) : null,
      purchasePrice: row.purchasePrice ? Number(row.purchasePrice) : null,
      purchaseCurrency: row.purchasePrice ? (row.purchaseCurrency as CurrencyCode) : null,
      minStockThreshold: row.minStockThreshold ? Number(row.minStockThreshold) : null,
      packName: row.packName.trim() || null,
      packSize: row.packSize ? Number(row.packSize) : null,
      tagIds: [],
    };
  }

  async function handleSave() {
    const toSave = rows.filter((r) => r.status !== "ok" && (r.name.trim() || r.sku.trim()));
    if (toSave.length === 0) return;
    setSaving(true);

    for (const row of toSave) {
      if (!row.name.trim() || !row.sku.trim()) {
        update(row.key, { status: { error: "Nomi va artikul majburiy" } });
        continue;
      }
      try {
        const created = await apiFetch<Product>("/products", { method: "POST", body: toInput(row) });
        const qty = Number(row.initialQty);
        if (qty > 0) {
          await apiFetch(`/products/${created.id}/stock`, {
            method: "POST",
            body: { qty, unitCost: row.purchaseCurrency === "UZS" && row.purchasePrice ? Math.round(Number(row.purchasePrice)) : null },
          });
        }
        update(row.key, { status: "ok" });
      } catch (err) {
        update(row.key, { status: { error: err instanceof ApiClientError ? err.message : "Saqlashda xatolik" } });
      }
    }

    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product-types"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/products")}
            aria-label="Yopish"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Mahsulotlarni ko&apos;p miqdorda qo&apos;shish</h1>
        </div>
        <Button onClick={handleSave} disabled={saving || pending.length === 0}>
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Yuklanayotgan mahsulotlar soni</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{pending.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Muvaffaqiyatli yuklangan</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-600">{savedCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Yuklashda xatolik bergan</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-red-600">{failedCount}</p>
        </div>
      </div>

      <datalist id="bulk-product-types">
        {typesQuery.data?.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <Button onClick={() => setRows((prev) => [...prev, emptyRow()])}>+ Yangi qator qo&apos;shish</Button>
          {savedCount > 0 && (
            <button onClick={() => router.push("/products")} className="text-sm font-medium text-brand-600 hover:underline">
              Mahsulotlar ro&apos;yxatiga →
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">
                  Mahsulot nomi <span className="text-red-500">*</span>
                </th>
                <th className="px-3 py-3">
                  Artikul <span className="text-red-500">*</span>
                </th>
                <th className="px-3 py-3">Chakana narx</th>
                <th className="px-3 py-3">Ulgurji narx</th>
                <th className="px-3 py-3">Kirim narxi</th>
                <th className="px-3 py-3">O&apos;lchov birligi</th>
                <th className="px-3 py-3">Turi</th>
                <th className="px-3 py-3">Shtrix-kod</th>
                <th className="px-3 py-3">Qoldiq</th>
                <th className="px-3 py-3">Min. qoldiq</th>
                <th className="px-3 py-3">Qadoq nomi</th>
                <th className="px-3 py-3">Qadoqdagi miqdor</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => {
                const failed = typeof row.status === "object" ? row.status.error : null;
                const done = row.status === "ok";
                return (
                  <tr key={row.key} className={done ? "bg-emerald-50/60" : failed ? "bg-red-50/60" : undefined}>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-44"
                        disabled={done}
                        value={row.name}
                        onChange={(e) => update(row.key, { name: e.target.value, status: "idle" })}
                      />
                      {failed && <p className="mt-1 text-xs text-red-600">{failed}</p>}
                      {done && <p className="mt-1 text-xs text-emerald-600">Saqlandi</p>}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-28"
                        disabled={done}
                        value={row.sku}
                        onChange={(e) => update(row.key, { sku: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-28 text-right"
                        type="number"
                        min={0}
                        disabled={done}
                        value={row.defaultSalePrice}
                        onChange={(e) => update(row.key, { defaultSalePrice: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-28 text-right"
                        type="number"
                        min={0}
                        disabled={done}
                        value={row.wholesalePrice}
                        onChange={(e) => update(row.key, { wholesalePrice: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex">
                        <Input
                          className="min-w-24 rounded-r-none text-right"
                          type="number"
                          step="0.01"
                          min={0}
                          disabled={done}
                          value={row.purchasePrice}
                          onChange={(e) => update(row.key, { purchasePrice: e.target.value, status: "idle" })}
                        />
                        <select
                          className="rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-1 text-xs text-slate-600 disabled:bg-slate-50"
                          disabled={done}
                          value={row.purchaseCurrency}
                          onChange={(e) => update(row.key, { purchaseCurrency: e.target.value, status: "idle" })}
                        >
                          {["UZS", "USD", "EUR", "RUB"].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-50"
                        disabled={done}
                        value={row.unit}
                        onChange={(e) => update(row.key, { unit: e.target.value as Row["unit"], status: "idle" })}
                      >
                        <option value="RULON">Rulon</option>
                        <option value="DONA">Dona</option>
                        <option value="METR">Metr</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-32"
                        list="bulk-product-types"
                        placeholder="oboy, kley..."
                        disabled={done}
                        value={row.type}
                        onChange={(e) => update(row.key, { type: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-32"
                        placeholder="Avtomatik"
                        disabled={done}
                        value={row.barcode}
                        onChange={(e) => update(row.key, { barcode: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-24 text-right"
                        type="number"
                        step="any"
                        min={0}
                        disabled={done}
                        value={row.initialQty}
                        onChange={(e) => update(row.key, { initialQty: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-24 text-right"
                        type="number"
                        min={0}
                        disabled={done}
                        value={row.minStockThreshold}
                        onChange={(e) => update(row.key, { minStockThreshold: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-24"
                        placeholder="quti"
                        disabled={done}
                        value={row.packName}
                        onChange={(e) => update(row.key, { packName: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="min-w-24 text-right"
                        type="number"
                        step="any"
                        min={0}
                        disabled={done}
                        value={row.packSize}
                        onChange={(e) => update(row.key, { packSize: e.target.value, status: "idle" })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeRow(row.key)}
                        aria-label="Qatorni o'chirish"
                        className="rounded-md px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
