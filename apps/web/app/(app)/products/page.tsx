"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProductInput, CurrencyCode, Product } from "@oboishop/shared";
import { apiFetch, apiUpload, ApiClientError, resolveUploadUrl } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { RowActions } from "@/components/ui/row-actions";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddProductMenu } from "@/components/add-product-menu";
import { CurrencyHint } from "@/components/currency-hint";
import { formatFx, formatUzs, useExchangeRates } from "@/lib/use-exchange-rates";

// Qoldiq raqamining yonida birlik ko'rinib tursin (Hippo'dagi "9 sht" kabi).
const UNIT_LABEL: Record<string, string> = { RULON: "rulon", DONA: "dona", METR: "m" };

const CURRENCIES: CurrencyCode[] = ["UZS", "USD", "EUR", "RUB"];

// Kirim narxi valyutali bo'lgani uchun formatMoney (faqat so'm) yaramaydi.
// Asosiy qatorda kiritilgan summa o'z valyutasida, ostida esa Markaziy
// bankning joriy kursi bo'yicha qiymati ko'rsatiladi (valyutada kiritilsa —
// so'mda, so'mda kiritilsa — dollarda).
function PurchasePriceCell({ value, currency }: { value: string | null; currency: string | null }) {
  const { toUzs, fromUzs } = useExchangeRates();

  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  const n = Number(value);
  const ccy = currency ?? "UZS";
  const main = Number.isInteger(n) ? n.toLocaleString("uz-UZ") : n.toLocaleString("uz-UZ", { minimumFractionDigits: 2 });

  const converted = ccy === "UZS" ? fromUzs(n, "USD") : toUzs(n, ccy);
  const convertedText =
    converted === null
      ? null
      : ccy === "UZS"
        ? formatFx(converted, "USD")
        : formatUzs(converted);

  return (
    <>
      <div className="font-medium">
        {main} <span className="text-[11px] font-normal">{ccy}</span>
      </div>
      {convertedText && <div className="text-[11px] font-normal text-slate-400">≈ {convertedText}</div>}
    </>
  );
}

// O'ram qoldiq: qoldiqni bitta qadoqdagi miqdorga bo'lib, nechta to'liq
// qadoq borligini ko'rsatadi (qolgan dona qavs ichida). Qadoq belgilanmagan
// mahsulotda ustun bo'sh turadi.
function PackQtyCell({
  qtyOnHand,
  packSize,
  packName,
}: {
  qtyOnHand: string;
  packSize: string | null;
  packName: string | null;
}) {
  const size = Number(packSize ?? 0);
  if (!size) return <span className="text-slate-300">—</span>;
  const qty = Number(qtyOnHand);
  const packs = Math.floor(qty / size);
  const rest = Number((qty - packs * size).toFixed(3));
  return (
    <>
      <span className="font-medium text-slate-900">{packs}</span>
      <span className="ml-1 text-xs font-normal text-slate-400">{packName || "o'ram"}</span>
      {rest > 0 && <span className="ml-1 text-xs text-slate-400">(+{formatQuantity(String(rest))})</span>}
    </>
  );
}

function MoneyCell({ value }: { value: string | null }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  return (
    <>
      {formatMoney(value).replace(" so'm", "")}
      <span className="ml-1 text-[11px] font-normal uppercase text-slate-400">so&apos;m</span>
    </>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const emptyForm: CreateProductInput = {
  sku: "",
  name: "",
  type: null,
  baseMaterial: "BOSHQA",
  unit: "RULON",
  tagIds: [],
};

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateProductInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  // Rasm ixtiyoriy: mahsulot avval yaratiladi, keyin (fayl tanlangan bo'lsa)
  // rasm alohida so'rov bilan yuklanadi — rasmsiz ham saqlanaveradi.
  const [imageFile, setImageFile] = useState<File | null>(null);
  // Kirim hujjatlari bo'limi yo'q — mahsulot qo'shilayotganda omborda
  // hozir nechta borligini shu yerda kiritamiz.
  const [initialQty, setInitialQty] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products", search, filterType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterType) params.set("type", filterType);
      const qs = params.toString();
      // Ro'yxatning o'zida "necha dona bor"ni ko'rsatish uchun (mijoz
      // talabi) — API endi har bir mahsulot bilan birga qtyOnHand'ni ham
      // qaytaradi, alohida sahifaga kirish shart emas.
      return apiFetch<(Product & { qtyOnHand: string })[]>(`/products${qs ? `?${qs}` : ""}`);
    },
  });
  // "Turi" — alohida jadval emas, mavjud mahsulotlardagi qiymatlar ro'yxati.
  const typesQuery = useQuery({ queryKey: ["product-types"], queryFn: () => apiFetch<string[]>("/products/types") });
  const { toUzs } = useExchangeRates();

  const createMutation = useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const product = await apiFetch<Product>("/products", { method: "POST", body: input });

      // Boshlang'ich qoldiq berilgan bo'lsa — partiya ochamiz. Partiya
      // tannarxi so'mda saqlanadi, shuning uchun valyutadagi kirim narxini
      // joriy kurs bo'yicha so'mga o'giramiz.
      const qty = Number(initialQty);
      if (qty > 0) {
        const costUzs = input.purchasePrice
          ? toUzs(Number(input.purchasePrice), input.purchaseCurrency ?? "UZS")
          : null;
        await apiFetch(`/products/${product.id}/stock`, {
          method: "POST",
          body: { qty, unitCost: costUzs ? Math.round(costUzs) : null },
        });
      }

      if (imageFile) {
        // Rasm yuklanmasa ham mahsulot saqlangan bo'ladi — shuning uchun
        // bu xato mahsulot yaratilishini bekor qilmaydi, faqat ogohlantiradi.
        try {
          await apiUpload<Product>(`/products/${product.id}/image`, imageFile);
        } catch {
          setError("Mahsulot saqlandi, lekin rasm yuklanmadi — uni mahsulot sahifasidan qo'shishingiz mumkin.");
        }
      }
      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-types"] });
      setForm(emptyForm);
      setImageFile(null);
      setInitialQty("");
      setShowForm(false);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDeleteTarget(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "O'chirishda xatolik"),
  });

  function handleDelete(product: Product) {
    setDeleteTarget(product);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Mahsulotlar</h1>
        <div className="flex flex-wrap gap-3">
          <ExportCsvButton
            filename="mahsulotlar"
            columns={["Artikul", "Nomi", "Turi", "Shtrix-kod", "Qoldiq", "Chakana narx", "Ulgurji narx", "Kirim narxi", "Valyuta", "Min. qoldiq", "Qo'shilgan sana"]}
            rows={(productsQuery.data ?? []).map((p) => [
              p.sku,
              p.name,
              p.type ?? "",
              p.barcode ?? "",
              p.qtyOnHand,
              p.defaultSalePrice ?? "",
              p.wholesalePrice ?? "",
              p.purchasePrice ?? "",
              p.purchaseCurrency ?? "",
              p.minStockThreshold ?? "",
              formatDateTime(p.createdAt),
            ])}
          />
          <Link href="/products/labels">
            <Button variant="secondary">Yorliq chop etish</Button>
          </Link>
          <AddProductMenu onSingle={() => setShowForm(true)} onBulk={() => router.push("/products/bulk-new")} />
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Qidirish</label>
            <Input placeholder="Nomi, SKU yoki shtrix-kod..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Turi</label>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Barchasi</option>
              {typesQuery.data?.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setImageFile(null);
          setError(null);
        }}
        title="Mahsulotni donalab qo'shish"
        width="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Mahsulot haqida ma&apos;lumot</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nomi *</label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Artikul (SKU) *</label>
                    <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Shtrix-kod</label>
                    <Input
                      placeholder="Bo'sh qoldirsangiz avtomatik"
                      value={form.barcode ?? ""}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value || null })}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Turi</label>
                  {/* Erkin matn — avval kiritilgan turlar taklif sifatida chiqadi. */}
                  <Input
                    list="product-types"
                    placeholder="oboy, kley, jihoz..."
                    value={form.type ?? ""}
                    onChange={(e) => setForm({ ...form, type: e.target.value || null })}
                  />
                  <datalist id="product-types">
                    {typesQuery.data?.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Baza materiali</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={form.baseMaterial}
                    onChange={(e) => setForm({ ...form, baseMaterial: e.target.value as CreateProductInput["baseMaterial"] })}
                  >
                    <option value="BOSHQA">Boshqa</option>
                    <option value="VINIL">Vinil</option>
                    <option value="FLIZELIN">Flizelin</option>
                  </select>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Narxlar</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Chakana narx (so&apos;m)</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.defaultSalePrice ?? ""}
                      onChange={(e) => setForm({ ...form, defaultSalePrice: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Ulgurji narx (so&apos;m)</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.wholesalePrice ?? ""}
                      onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Kirim narxi (tan narx)</label>
                    <div className="flex">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.purchasePrice ?? ""}
                        onChange={(e) => setForm({ ...form, purchasePrice: e.target.value ? Number(e.target.value) : null })}
                        className="rounded-r-none"
                      />
                      <select
                        className="rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-600"
                        value={form.purchaseCurrency ?? "UZS"}
                        onChange={(e) => setForm({ ...form, purchaseCurrency: e.target.value as CurrencyCode })}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <CurrencyHint amount={form.purchasePrice} currency={form.purchaseCurrency ?? "UZS"} />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">O&apos;lchov va qoldiq</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">O&apos;lchov birligi</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value as CreateProductInput["unit"] })}
                    >
                      <option value="RULON">Rulon</option>
                      <option value="DONA">Dona</option>
                      <option value="METR">Metr</option>
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Eni (m)</label>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={form.sizeWidthM ?? ""}
                        onChange={(e) => setForm({ ...form, sizeWidthM: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Uzunligi (m)</label>
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={form.sizeLengthM ?? ""}
                        onChange={(e) => setForm({ ...form, sizeLengthM: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Boshlang&apos;ich qoldiq</label>
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      placeholder="Omborda hozir nechta bor"
                      value={initialQty}
                      onChange={(e) => setInitialQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Min. qoldiq chegarasi</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.minStockThreshold ?? ""}
                      onChange={(e) => setForm({ ...form, minStockThreshold: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-900">O&apos;ram (qadoq)</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Ixtiyoriy. To&apos;ldirilsa, kassada qadoq bilan sotish mumkin bo&apos;ladi.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Qadoq nomi</label>
                    <Input
                      placeholder="quti, pachka..."
                      value={form.packName ?? ""}
                      onChange={(e) => setForm({ ...form, packName: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Qadoq ichidagi miqdor</label>
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={form.packSize ?? ""}
                      onChange={(e) => setForm({ ...form, packSize: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-900">Rasm</h3>
                <p className="mb-3 text-xs text-slate-500">Ixtiyoriy — keyinroq ham qo&apos;shishingiz mumkin.</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-400">
                    {imageFile ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={URL.createObjectURL(imageFile)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      "Yo'q"
                    )}
                  </div>
                  <div className="min-w-0">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                    />
                    {imageFile && (
                      <button
                        type="button"
                        onClick={() => setImageFile(null)}
                        className="mt-1 text-xs font-medium text-red-600 hover:underline"
                      >
                        Rasmni olib tashlash
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setImageFile(null);
                setError(null);
              }}
            >
              Bekor qilish
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </div>
        </form>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr className="[&>th]:border-r [&>th]:border-slate-200 [&>th:last-child]:border-r-0">
                <th className="px-4 py-3 w-10">#</th>
                <th className="px-4 py-3">Nomi</th>
                <th className="px-4 py-3 text-right">Qoldiq</th>
                <th className="px-4 py-3 text-right">O&apos;ram qoldiq</th>
                <th className="px-4 py-3 text-right">Ulgurji narx</th>
                <th className="px-4 py-3 text-right">Chakana narx</th>
                <th className="px-4 py-3 text-right">Kirim narxi</th>
                <th className="px-4 py-3 text-right">Min. qoldiq</th>
                <th className="px-4 py-3 text-right">Qo&apos;shilgan sana</th>
                <th className="px-4 py-3 w-24 text-center">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productsQuery.isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {productsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-400">
                    Hali mahsulot qo&apos;shilmagan
                  </td>
                </tr>
              )}
              {productsQuery.data?.map((p, i) => {
                const isLow = p.minStockThreshold != null && Number(p.qtyOnHand) <= Number(p.minStockThreshold);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 [&>td]:border-r [&>td]:border-slate-100 [&>td:last-child]:border-r-0">
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    {/* Nomi, artikul, shtrix-kod va rasm — bitta ustunda birga
                        (Hippo'dagi "NOMI" ustuni kabi), jadval keng cho'zilib
                        ketmasligi uchun. */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Link href={`/products/${p.id}`} className="shrink-0">
                          <div className="h-10 w-10 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolveUploadUrl(p.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                        </Link>
                        <div className="min-w-0">
                          <Link href={`/products/${p.id}`} className="font-semibold text-slate-900 hover:underline">
                            {p.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700">
                              # {p.sku}
                            </span>
                            {p.barcode && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                                ||| {p.barcode}
                              </span>
                            )}
                            {p.type && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{p.type}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${isLow ? "text-red-600" : "text-slate-900"}`}>
                      {formatQuantity(p.qtyOnHand)}
                      <span className="ml-1 text-xs font-normal text-slate-400">{UNIT_LABEL[p.unit] ?? ""}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      <PackQtyCell qtyOnHand={p.qtyOnHand} packSize={p.packSize} packName={p.packName} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      <MoneyCell value={p.wholesalePrice} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                      <MoneyCell value={p.defaultSalePrice} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                      <PurchasePriceCell value={p.purchasePrice} currency={p.purchaseCurrency} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatQuantity(p.minStockThreshold)}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-500">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => router.push(`/products/${p.id}?edit=1`)}
                          aria-label="Tahrirlash"
                          title="Tahrirlash"
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
                        >
                          <PencilIcon />
                        </button>
                        <RowActions
                          extraActions={[
                            {
                              label: "Shtrix-kodni chop etish",
                              onClick: () => router.push(`/products/barcode-print?id=${p.id}`),
                            },
                          ]}
                          onEdit={() => router.push(`/products/${p.id}?edit=1`)}
                          onDelete={() => handleDelete(p)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Mahsulotni o'chirish"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" ro'yxatdan olib tashlanadi. Uning eski sotuvlari va tarixi saqlanib qoladi.`
            : undefined
        }
        confirmLabel="O'chirish"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <InventoryTotals products={productsQuery.data ?? []} />
    </div>
  );
}

// Ro'yxatning tagidagi umumlashtiruvchi panel: omborda turgan tovarning
// uchta narxdagi umumiy qiymati. Filtr qo'yilgan bo'lsa — faqat ekranda
// ko'rinayotgan mahsulotlar bo'yicha hisoblanadi.
function InventoryTotals({ products }: { products: (Product & { qtyOnHand: string })[] }) {
  const { toUzs, fromUzs, rateOf, rateDate } = useExchangeRates();

  const totals = useMemo(() => {
    let wholesale = 0;
    let retail = 0;
    let purchase = 0;
    let qty = 0;
    let purchaseKnown = 0;

    for (const p of products) {
      const q = Number(p.qtyOnHand) || 0;
      qty += q;
      if (q <= 0) continue;
      wholesale += q * Number(p.wholesalePrice ?? 0);
      retail += q * Number(p.defaultSalePrice ?? 0);
      if (p.purchasePrice) {
        const uzs = toUzs(Number(p.purchasePrice), p.purchaseCurrency ?? "UZS");
        if (uzs !== null) {
          purchase += q * uzs;
          purchaseKnown += q;
        }
      }
    }
    return { wholesale, retail, purchase, qty, purchaseKnown };
  }, [products, toUzs]);

  const usdRate = rateOf("USD");
  const cards = [
    { label: "Kirim narxida", value: totals.purchase, tone: "text-amber-700", ring: "border-amber-200 bg-amber-50/60" },
    { label: "Ulgurji narxda", value: totals.wholesale, tone: "text-slate-900", ring: "border-slate-200 bg-white" },
    { label: "Chakana narxda", value: totals.retail, tone: "text-emerald-700", ring: "border-emerald-200 bg-emerald-50/60" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Omborda turgan tovarning umumiy qiymati</h2>
        <p className="text-xs text-slate-500">
          {products.length} ta mahsulot · jami {formatQuantity(String(totals.qty))} birlik
          {usdRate !== null && (
            <span className="ml-2 text-slate-400">
              (1 USD = {formatUzs(usdRate)}
              {rateDate ? `, ${rateDate}` : ""})
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const usd = fromUzs(c.value, "USD");
          return (
            <div key={c.label} className={`rounded-lg border p-4 ${c.ring}`}>
              <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${c.tone}`}>{formatUzs(c.value)}</p>
              {usd !== null && <p className="mt-0.5 text-xs tabular-nums text-slate-400">≈ {formatFx(usd, "USD")}</p>}
            </div>
          );
        })}
      </div>

      {totals.purchaseKnown === 0 && totals.qty > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Kirim narxi kiritilmagan mahsulotlar bu hisobga qo&apos;shilmadi.
        </p>
      )}
    </div>
  );
}
