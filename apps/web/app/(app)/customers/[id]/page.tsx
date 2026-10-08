"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contragent, StockOutDocument, UpdateContragentInput } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ExportCsvButton } from "@/components/ui/export-csv-button";

// Mijoz kartasi — qarz/to'lov hisob-kitobi yuritilmaydi (nasiyaga sotuv bu
// do'konda ishlatilmaydi). Bu yerda faqat mijozning aloqa ma'lumotlari va
// undan nima sotib olgani ro'yxati ko'rsatiladi.
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateContragentInput>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const customerQuery = useQuery({
    queryKey: ["contragents", params.id],
    queryFn: () => apiFetch<Contragent>(`/contragents/${params.id}`),
  });
  // Faqat tasdiqlangan sotuvlar — bekor qilingan yoki qoralama hujjatlar
  // "sotib olgan" deb hisoblanmaydi.
  const salesQuery = useQuery({
    queryKey: ["stock-out", "customer", params.id],
    queryFn: () =>
      apiFetch<StockOutDocument[]>(`/stock-out?contragentId=${params.id}&docType=SALE&status=CONFIRMED`),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateContragentInput) =>
      apiFetch<Contragent>(`/contragents/${params.id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contragents"] });
      setEditing(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch<void>(`/contragents/${params.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contragents"] });
      router.push("/customers");
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  // ?edit=1 bilan kelinganda (mijozlar jadvalidagi "⋯ → Tahrirlash") darhol
  // tahrirlash rejimida ochiladi.
  const wantsEdit = searchParams.get("edit") === "1";
  const loaded = customerQuery.data;
  useEffect(() => {
    if (!wantsEdit || !loaded) return;
    setEditForm({ name: loaded.name, phone: loaded.phone, address: loaded.address });
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsEdit, loaded?.id]);

  if (customerQuery.isLoading) return <p className="text-sm text-slate-400">Yuklanmoqda...</p>;
  const customer = customerQuery.data;
  if (!customer) return <p className="text-sm text-red-600">Mijoz topilmadi</p>;

  const sales = salesQuery.data ?? [];
  const totalSpent = sales.reduce((sum, doc) => sum + Number(doc.totalAmount), 0);

  function startEdit() {
    if (!customer) return;
    setEditForm({ name: customer.name, phone: customer.phone, address: customer.address });
    setEditing(true);
    setError(null);
  }

  function handleDelete() {
    if (!customer) return;
    setConfirmDelete(true);
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmDelete}
        title="Mijozni o'chirish"
        message={`"${customer.name}" ro'yxatdan olib tashlanadi. Uning eski xaridlari saqlanib qoladi.`}
        confirmLabel="O'chirish"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setConfirmDelete(false)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm text-brand-600 hover:underline">
            ← Mijozlar
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{customer.name}</h1>
          <p className="text-sm text-slate-500">Qo&apos;shilgan sana: {formatDateTime(customer.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={startEdit}>
            Tahrirlash
          </Button>
          <Button variant="secondary" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "O'chirilmoqda..." : "O'chirish"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Aloqa ma&apos;lumotlari</h2>
        </CardHeader>
        {editing ? (
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nomi</label>
              <Input value={editForm.name ?? ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
              <Input value={editForm.phone ?? ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Manzil</label>
              <Input value={editForm.address ?? ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Bekor qilish
              </Button>
            </div>
          </CardBody>
        ) : (
          <CardBody className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Telefon</dt>
              <dd>{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Manzil</dt>
              <dd>{customer.address ?? "—"}</dd>
            </div>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Sotib olganlari</h2>
            <p className="mt-1 text-xs text-slate-500">
              {sales.length} ta xarid · jami {formatMoney(String(totalSpent))}
            </p>
          </div>
          <ExportCsvButton
            filename={`${customer.name}-xaridlar`}
            columns={["Sana", "Hujjat", "Mahsulotlar", "Summa"]}
            rows={sales.map((doc) => [
              formatDateTime(doc.documentDate),
              doc.docNumber,
              doc.items.map((i) => `${i.productName ?? i.productSku ?? ""} x${formatQuantity(i.qty)}`).join("; "),
              doc.totalAmount,
            ])}
          />
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Sana</th>
                <th className="px-4 py-3">Hujjat</th>
                <th className="px-4 py-3">Mahsulotlar</th>
                <th className="px-4 py-3 text-right">Summa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {salesQuery.isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {!salesQuery.isLoading && sales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Bu mijoz hali hech narsa sotib olmagan
                  </td>
                </tr>
              )}
              {sales.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(doc.documentDate)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{doc.docNumber}</td>
                  <td className="px-4 py-3">
                    {doc.items.map((item) => (
                      <div key={item.id} className="text-slate-600">
                        {item.productName ?? item.productSku ?? "—"}
                        <span className="text-slate-400"> × {formatQuantity(item.qty)}</span>
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(doc.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
