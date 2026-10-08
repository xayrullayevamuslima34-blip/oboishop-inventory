"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Batch, CurrencyCode, Product, ProductStockBalance, StockMovement, UpdateProductInput } from "@oboishop/shared";
import { apiFetch, apiUpload, ApiClientError, resolveUploadUrl } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyHint } from "@/components/currency-hint";
import { useExchangeRates } from "@/lib/use-exchange-rates";

// Ombor harakati turlari — mahsulot sahifasidagi "Harakatlar" jadvali uchun.
const MOVEMENT_LABELS: Record<string, string> = {
  STOCK_IN: "Kirim",
  SALE: "Sotuv",
  WRITEOFF: "Hisobdan chiqarish",
  RETURN_TO_SUPPLIER: "Yetkazib beruvchiga qaytaruv",
  CUSTOMER_RETURN: "Mijozdan qaytaruv",
  CANCEL_REVERSAL: "Bekor qilish (qaytarilgan)",
  INVENTORY_ADJ_PLUS: "Reviziya (ortiqcha)",
  INVENTORY_ADJ_MINUS: "Reviziya (kamomad)",
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toUzs } = useExchangeRates();
  const [tab, setTab] = useState<"batches" | "movements">("batches");
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateProductInput>({});
  const [editError, setEditError] = useState<string | null>(null);

  const productQuery = useQuery({
    queryKey: ["products", params.id],
    queryFn: () => apiFetch<Product>(`/products/${params.id}`),
  });
  const typesQuery = useQuery({ queryKey: ["product-types"], queryFn: () => apiFetch<string[]>("/products/types") });

  function invalidateProduct() {
    queryClient.invalidateQueries({ queryKey: ["products", params.id] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => apiUpload<Product>(`/products/${params.id}/image`, file),
    onSuccess: () => {
      invalidateProduct();
      setImageError(null);
    },
    onError: (err) => setImageError(err instanceof ApiClientError ? err.message : "Rasm yuklashda xatolik"),
  });

  const addStockMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(stockQty);
      if (!(qty > 0)) throw new Error("Miqdor noldan katta bo'lishi kerak");
      // Partiya tannarxi bazada so'mda saqlanadi — valyutada kiritilgan
      // narxni joriy Markaziy bank kursi bo'yicha o'giramiz.
      const costUzs = stockCost ? toUzs(Number(stockCost), stockCurrency) : null;
      return apiFetch(`/products/${params.id}/stock`, {
        method: "POST",
        body: { qty, unitCost: costUzs === null ? null : Math.round(costUzs) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowStockForm(false);
      setStockQty("");
      setStockCost("");
      setStockError(null);
    },
    onError: (err) =>
      setStockError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Xatolik"),
  });

  const deleteImageMutation = useMutation({
    mutationFn: () => apiFetch<Product>(`/products/${params.id}/image`, { method: "DELETE" }),
    onSuccess: () => invalidateProduct(),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateProductInput) => apiFetch<Product>(`/products/${params.id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      invalidateProduct();
      setEditing(false);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  const wantsEdit = searchParams.get("edit") === "1";
  const loadedProduct = productQuery.data;
  useEffect(() => {
    if (wantsEdit && loadedProduct) startEditing(loadedProduct);
    // Faqat mahsulot yuklangandan keyin bir marta — keyin foydalanuvchi o'zi boshqaradi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsEdit, loadedProduct?.id]);

  function startEditing(product: Product) {
    setEditForm({
      name: product.name,
      type: product.type,
      defaultSalePrice: product.defaultSalePrice ? Number(product.defaultSalePrice) : null,
      wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
      purchasePrice: product.purchasePrice ? Number(product.purchasePrice) : null,
      purchaseCurrency: product.purchaseCurrency,
      minStockThreshold: product.minStockThreshold ? Number(product.minStockThreshold) : null,
      barcode: product.barcode,
    });
    setEditError(null);
    setEditing(true);
  }
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockQty, setStockQty] = useState("");
  const [stockCost, setStockCost] = useState("");
  const [stockCurrency, setStockCurrency] = useState<CurrencyCode>("UZS");
  const [stockError, setStockError] = useState<string | null>(null);

  const balanceQuery = useQuery({
    queryKey: ["products", params.id, "balance"],
    queryFn: () => apiFetch<ProductStockBalance>(`/products/${params.id}/balance`),
  });
  const batchesQuery = useQuery({
    queryKey: ["products", params.id, "batches"],
    queryFn: () => apiFetch<Batch[]>(`/products/${params.id}/batches`),
    enabled: tab === "batches",
  });
  const movementsQuery = useQuery({
    queryKey: ["products", params.id, "movements"],
    queryFn: () => apiFetch<StockMovement[]>(`/products/${params.id}/movements`),
    enabled: tab === "movements",
  });

  if (productQuery.isLoading) return <p className="text-sm text-slate-400">Yuklanmoqda...</p>;
  const product = productQuery.data;
  if (!product) return <p className="text-sm text-red-600">Mahsulot topilmadi</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveUploadUrl(product.imageUrl) ?? undefined} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">Rasm yo&apos;q</div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadImageMutation.isPending}
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              {uploadImageMutation.isPending ? "Yuklanmoqda..." : "O'zgartirish"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImageMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{product.name}</h1>
            <p className="text-sm text-slate-500">Artikul: {product.sku}</p>
            {product.imageUrl && (
              <button
                type="button"
                onClick={() => deleteImageMutation.mutate()}
                disabled={deleteImageMutation.isPending}
                className="mt-1 text-xs text-red-600 hover:underline"
              >
                Rasmni o&apos;chirish
              </button>
            )}
            {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Joriy qoldiq</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {formatQuantity(balanceQuery.data?.qtyOnHand ?? "0")}
          </p>
          {balanceQuery.data?.avgCost && (
            <p className="text-xs text-slate-500">o&apos;rtacha tan narx: {formatMoney(balanceQuery.data.avgCost)}</p>
          )}
          {/* Kirim hujjatlari bo'limi yo'q — omborga tovar kelganda qoldiq
              shu yerdan oshiriladi (yangi partiya ochiladi). */}
          {!showStockForm ? (
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                // Mahsulotning o'z kirim narxi va valyutasini oldindan
                // to'ldiramiz — odatda tovar o'sha narxda kelaveradi.
                setStockCost(product.purchasePrice ? String(Number(product.purchasePrice)) : "");
                setStockCurrency(product.purchaseCurrency ?? "UZS");
                setShowStockForm(true);
              }}
            >
              + Qoldiq qo&apos;shish
            </Button>
          ) : (
            <div className="mt-2 w-64 space-y-2 rounded-md border border-slate-200 p-3 text-left">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nechta keldi</label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tan narxi</label>
                <div className="flex">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={stockCost}
                    onChange={(e) => setStockCost(e.target.value)}
                    className="rounded-r-none"
                  />
                  <select
                    className="rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-600"
                    value={stockCurrency}
                    onChange={(e) => setStockCurrency(e.target.value as CurrencyCode)}
                  >
                    {["UZS", "USD", "EUR", "RUB"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <CurrencyHint amount={stockCost} currency={stockCurrency} />
              </div>
              {stockError && <p className="text-xs text-red-600">{stockError}</p>}
              <div className="flex gap-2">
                <Button onClick={() => addStockMutation.mutate()} disabled={addStockMutation.isPending}>
                  {addStockMutation.isPending ? "..." : "Saqlash"}
                </Button>
                <Button variant="secondary" onClick={() => setShowStockForm(false)}>
                  Bekor
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Umumiy ma&apos;lumot</h2>
          {!editing && (
            <Button variant="secondary" onClick={() => startEditing(product)}>
              Tahrirlash
            </Button>
          )}
        </CardHeader>
        {!editing ? (
          <CardBody className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Shtrix-kod</dt>
              <dd className="font-mono">{product.barcode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Turi</dt>
              <dd>{product.type ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Chakana narx</dt>
              <dd className="tabular-nums">{formatMoney(product.defaultSalePrice)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Ulgurji narx</dt>
              <dd className="tabular-nums">{formatMoney(product.wholesalePrice)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Min. qoldiq</dt>
              <dd className="tabular-nums">{formatQuantity(product.minStockThreshold)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Baza materiali</dt>
              <dd>{product.baseMaterial}</dd>
            </div>
            <div>
              <dt className="text-slate-500">O&apos;lcham</dt>
              <dd>
                {product.sizeWidthM ?? "—"} x {product.sizeLengthM ?? "—"} m
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Birlik</dt>
              <dd>{product.unit}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Kirim narxi (tan narx)</dt>
              <dd className="tabular-nums">
                {product.purchasePrice ? `${Number(product.purchasePrice).toLocaleString("uz-UZ")} ${product.purchaseCurrency ?? "UZS"}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">O&apos;ram (qadoq)</dt>
              <dd>
                {product.packSize
                  ? `${product.packName || "o'ram"} — ${formatQuantity(product.packSize)} ta`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Qo&apos;shilgan sana</dt>
              <dd>{formatDateTime(product.createdAt)}</dd>
            </div>
          </CardBody>
        ) : (
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nomi</label>
              <Input value={editForm.name ?? ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Shtrix-kod</label>
              <Input value={editForm.barcode ?? ""} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value || null })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Turi</label>
              <Input
                list="product-types-edit"
                placeholder="oboy, kley..."
                value={editForm.type ?? ""}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value || null })}
              />
              <datalist id="product-types-edit">
                {typesQuery.data?.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Chakana narx (so&apos;m)</label>
              <Input
                type="number"
                min={0}
                value={editForm.defaultSalePrice ?? ""}
                onChange={(e) => setEditForm({ ...editForm, defaultSalePrice: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Ulgurji narx (so&apos;m)</label>
              <Input
                type="number"
                min={0}
                value={editForm.wholesalePrice ?? ""}
                onChange={(e) => setEditForm({ ...editForm, wholesalePrice: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Kirim narxi (tan narx)</label>
              <div className="flex">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editForm.purchasePrice ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, purchasePrice: e.target.value ? Number(e.target.value) : null })}
                  className="rounded-r-none"
                />
                <select
                  className="rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-600"
                  value={editForm.purchaseCurrency ?? "UZS"}
                  onChange={(e) => setEditForm({ ...editForm, purchaseCurrency: e.target.value as CurrencyCode })}
                >
                  {["UZS", "USD", "EUR", "RUB"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Qadoq nomi</label>
              <Input
                placeholder="quti, pachka..."
                value={editForm.packName ?? ""}
                onChange={(e) => setEditForm({ ...editForm, packName: e.target.value || null })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Qadoq ichidagi miqdor</label>
              <Input
                type="number"
                step="any"
                min={0}
                value={editForm.packSize ?? ""}
                onChange={(e) => setEditForm({ ...editForm, packSize: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Min. qoldiq chegarasi</label>
              <Input
                type="number"
                min={0}
                value={editForm.minStockThreshold ?? ""}
                onChange={(e) => setEditForm({ ...editForm, minStockThreshold: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            {editError && <p className="text-sm text-red-600 sm:col-span-2">{editError}</p>}
            <div className="flex gap-3 sm:col-span-2">
              <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Bekor qilish
              </Button>
            </div>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader className="flex gap-1 border-b-0 pb-0">
          <button
            onClick={() => setTab("batches")}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === "batches" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Partiyalar (FIFO)
          </button>
          <button
            onClick={() => setTab("movements")}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === "movements" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Harakatlar tarixi
          </button>
        </CardHeader>

        {tab === "batches" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Partiya №</th>
                  <th className="px-4 py-3">Kelgan sana</th>
                  <th className="px-4 py-3 text-right">Kelgan narx</th>
                  <th className="px-4 py-3 text-right">Kelgan</th>
                  <th className="px-4 py-3 text-right">Qolgan</th>
                  <th className="px-4 py-3">Holati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchesQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Hali partiya yo&apos;q
                    </td>
                  </tr>
                )}
                {batchesQuery.data?.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono text-xs">{b.batchNumber}</td>
                    <td className="px-4 py-3">{new Date(b.receivedAt).toLocaleDateString("uz-UZ")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(b.purchasePrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(b.qtyReceived)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(b.qtyRemaining)}</td>
                    <td className="px-4 py-3">
                      {b.isClosed ? (
                        <span className="text-xs text-slate-400">yopilgan</span>
                      ) : Number(b.qtyRemaining) > 0 ? (
                        <span className="text-xs text-emerald-600">faol</span>
                      ) : (
                        <span className="text-xs text-slate-400">tugagan</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "movements" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sana</th>
                  <th className="px-4 py-3">Turi</th>
                  <th className="px-4 py-3 text-right">O&apos;zgarish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movementsQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                      Hali harakat yo&apos;q
                    </td>
                  </tr>
                )}
                {movementsQuery.data?.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">{new Date(m.createdAt).toLocaleString("uz-UZ")}</td>
                    <td className="px-4 py-3">{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        Number(m.qtyDelta) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {Number(m.qtyDelta) >= 0 ? "+" : ""}
                      {formatQuantity(m.qtyDelta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
