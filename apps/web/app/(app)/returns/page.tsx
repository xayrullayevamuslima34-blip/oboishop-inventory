"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contragent, CreateStockOutDocumentInput, Product, StockOutDocument } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CustomerPicker } from "@/components/customer-picker";
import { ProductPicker } from "@/components/product-picker";

interface ReturnLine {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  /** Mijozga qaytariladigan narx (bir birlik uchun). */
  refundPrice: number;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Qoralama",
  CONFIRMED: "Tasdiqlangan",
  CANCELLED: "Bekor qilingan",
};

// Mijozdan qaytaruv — sotilgan tovar qaytib kelganda. Tasdiqlanganda ombor
// qoldig'i ortadi (yangi partiya ochiladi) va qaytarilgan pul kassadan
// chiqim sifatida yoziladi. Yetkazib beruvchiga qaytaruv bu yerda yo'q —
// u bo'lim mijoz talabiga ko'ra olib tashlangan.
export default function CustomerReturnsPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [draftProductId, setDraftProductId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftPrice, setDraftPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["contragents", "CUSTOMER"],
    queryFn: () => apiFetch<Contragent[]>("/contragents?type=CUSTOMER"),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "returns"],
    queryFn: () => apiFetch<(Product & { qtyOnHand: string })[]>("/products"),
  });
  const returnsQuery = useQuery({
    queryKey: ["stock-out", "CUSTOMER_RETURN"],
    queryFn: () => apiFetch<StockOutDocument[]>("/stock-out?docType=CUSTOMER_RETURN"),
  });

  const draftProduct = productsQuery.data?.find((p) => p.id === draftProductId) ?? null;
  const total = lines.reduce((sum, l) => sum + l.qty * l.refundPrice, 0);

  function selectDraftProduct(id: string) {
    setDraftProductId(id);
    setDraftQty("1");
    const p = productsQuery.data?.find((x) => x.id === id);
    setDraftPrice(p?.defaultSalePrice ? String(Math.round(Number(p.defaultSalePrice))) : "0");
  }

  function addLine() {
    if (!draftProduct) return;
    const qty = Number(draftQty) || 0;
    if (qty <= 0) {
      setError("Soni noldan katta bo'lishi kerak");
      return;
    }
    const refundPrice = Number(draftPrice) || 0;

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === draftProduct.id);
      if (existing) {
        return prev.map((l) => (l.productId === draftProduct.id ? { ...l, qty: l.qty + qty, refundPrice } : l));
      }
      return [...prev, { productId: draftProduct.id, name: draftProduct.name, sku: draftProduct.sku, qty, refundPrice }];
    });

    setDraftProductId("");
    setDraftQty("1");
    setDraftPrice("");
    setError(null);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function handleConfirm() {
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const input: CreateStockOutDocumentInput = {
      docType: "CUSTOMER_RETURN",
      contragentId: customerId || null,
      documentDate: new Date().toISOString(),
      // salePrice — mijozga qaytariladigan summa. Tan-narxni (unitCost)
      // bermaymiz: backend uni mahsulotning joriy tan-narxidan hisoblaydi.
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, salePrice: l.refundPrice })),
    };

    let draft: StockOutDocument | undefined;
    try {
      draft = await apiFetch<StockOutDocument>("/stock-out", { method: "POST", body: input });
      const confirmed = await apiFetch<StockOutDocument>(`/stock-out/${draft.id}/confirm`, { method: "POST" });
      setSuccess(`Qaytaruv qabul qilindi — ${confirmed.docNumber}`);
      setLines([]);
      setCustomerId("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-out"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Qaytaruvni tasdiqlashda xatolik");
      // Tasdiqlash o'tmasa, yarim qolgan qoralama hujjatni qoldirmaymiz.
      if (draft) await apiFetch(`/stock-out/${draft.id}`, { method: "DELETE" }).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mijozdan qaytaruv</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qaytarilgan tovar omborga qayta kiritiladi, qaytarilgan pul kassadan chiqim sifatida yoziladi.
        </p>
      </div>

      {success && <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mijoz (ixtiyoriy)</label>
            <CustomerPicker customers={customersQuery.data ?? []} value={customerId} onChange={setCustomerId} />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardBody className="flex h-full flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Mahsulot</label>
              <ProductPicker products={productsQuery.data ?? []} value={draftProductId} onChange={selectDraftProduct} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Qaytariladigan narx</label>
              <div className="flex">
                <Input
                  type="number"
                  min={0}
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                  className="rounded-r-none text-right"
                />
                <span className="flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 text-xs text-slate-500">
                  so&apos;m
                </span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Soni</label>
              <Input
                type="number"
                min={0.001}
                step="any"
                value={draftQty}
                onChange={(e) => setDraftQty(e.target.value)}
                className="text-right"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-auto flex items-center justify-between gap-3 pt-2">
              <Button onClick={addLine} disabled={!draftProductId}>
                Qo&apos;shish
              </Button>
              <p className="text-sm text-slate-500">
                Jami: <span className="text-base font-semibold text-slate-900">{formatMoney(String(Math.round(total)))}</span>
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 w-10">№</th>
                    <th className="px-2 py-2">Nomi</th>
                    <th className="px-2 py-2 text-right">Soni</th>
                    <th className="px-2 py-2 text-right">Narx</th>
                    <th className="px-2 py-2 text-right">Summa</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-10 text-center text-slate-400">
                        Qaytarilgan tovarni chap tomondan tanlab qo&apos;shing.
                      </td>
                    </tr>
                  )}
                  {lines.map((line, i) => (
                    <tr key={line.productId}>
                      <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium text-slate-900">{line.name}</p>
                        <p className="text-xs text-slate-500">{line.sku}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatQuantity(String(line.qty))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatMoney(String(line.refundPrice))}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {formatMoney(String(Math.round(line.qty * line.refundPrice)))}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => removeLine(line.productId)}
                          aria-label="Qatorni o'chirish"
                          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-4 border-t border-slate-200 pt-3">
              <span className="text-sm text-slate-500">
                Qaytariladigan summa:{" "}
                <span className="text-lg font-semibold text-slate-900">{formatMoney(String(Math.round(total)))}</span>
              </span>
              <Button onClick={handleConfirm} disabled={lines.length === 0 || submitting}>
                {submitting ? "Tasdiqlanmoqda..." : "Qaytaruvni qabul qilish"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Oxirgi qaytaruvlar</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Hujjat</th>
                <th className="px-4 py-3">Sana</th>
                <th className="px-4 py-3">Mijoz</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3 text-right">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Hali qaytaruv bo&apos;lmagan
                  </td>
                </tr>
              )}
              {returnsQuery.data?.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{doc.docNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(doc.documentDate)}</td>
                  <td className="px-4 py-3">{doc.contragentName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{STATUS_LABEL[doc.status] ?? doc.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(doc.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
