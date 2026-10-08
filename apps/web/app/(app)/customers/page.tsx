"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contragent, CreateContragentInput } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { RowActions } from "@/components/ui/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const emptyForm: CreateContragentInput = { name: "", type: "CUSTOMER", phone: "", address: "" };

// Mijozlar ro'yxati — bu do'konda nasiyaga sotuv yuritilmaydi, shuning uchun bu yerda
// qarz/balans tushunchasi yo'q: ro'yxat shunchaki "kim nima sotib olgan"ni kuzatish uchun.
// Har bir yozuv doim CUSTOMER turida yaratiladi.
export default function CustomersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateContragentInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contragent | null>(null);

  const customersQuery = useQuery({
    queryKey: ["contragents", "CUSTOMER"],
    queryFn: () => apiFetch<Contragent[]>("/contragents?type=CUSTOMER"),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateContragentInput) => apiFetch<Contragent>("/contragents", { method: "POST", body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contragents"] });
      setForm(emptyForm);
      setShowForm(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/contragents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contragents"] });
      setDeleteTarget(null);
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "O'chirishda xatolik"),
  });

  function handleDelete(customer: Contragent) {
    setDeleteTarget(customer);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mijozlar</h1>
          <p className="mt-1 text-sm text-slate-500">Mijozlar ro&apos;yxati va ular bilan hisob-kitob.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ExportCsvButton
            filename="mijozlar"
            columns={["Nomi", "Telefon", "Manzil", "Qo'shilgan sana"]}
            rows={(customersQuery.data ?? []).map((c) => [c.name, c.phone ?? "", c.address ?? "", formatDateTime(c.createdAt)])}
          />
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Bekor qilish" : "+ Yangi mijoz"}</Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Yangi mijoz qo&apos;shish</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nomi</label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Manzil</label>
                <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nomi</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3">Manzil</th>
                <th className="px-4 py-3">Qo&apos;shilgan sana</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customersQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {customersQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Hali mijoz qo&apos;shilmagan
                  </td>
                </tr>
              )}
              {customersQuery.data?.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3">{c.address ?? "—"}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-500">{formatDateTime(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <RowActions onEdit={() => router.push(`/customers/${c.id}?edit=1`)} onDelete={() => handleDelete(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Mijozni o'chirish"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" ro'yxatdan olib tashlanadi. Uning eski xaridlari saqlanib qoladi.`
            : undefined
        }
        confirmLabel="O'chirish"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
