"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditLogEntry } from "@oboishop/shared";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { describeAction, describeEntity, extractItems, toReadableFields } from "@/lib/audit-labels";



// Bitta yozuvning "oldin"/"keyin" holati — texnik JSON o'rniga
// maydon nomlari o'zbekcha, summalar va sanalar formatlangan ro'yxat.
function DetailBlock({ title, data }: { title: string; data: unknown }) {
  const fields = toReadableFields(data);
  const items = extractItems(data);

  if (fields.length === 0 && items.length === 0) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</p>
        <p className="rounded bg-white px-3 py-2 text-sm text-slate-400">—</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</p>
      <div className="max-h-72 space-y-2 overflow-auto rounded bg-white p-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {fields.map((f) => (
            <Fragment key={f.label}>
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="text-right font-medium text-slate-800">{f.value}</dd>
            </Fragment>
          ))}
        </dl>
        {items.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-1 text-xs font-semibold text-slate-500">Mahsulotlar</p>
            <ul className="space-y-0.5 text-sm text-slate-700">
              {items.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logQuery = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => apiFetch<AuditLogEntry[]>("/audit-log?limit=200"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Faoliyat tarixi</h1>
          <p className="mt-1 text-sm text-slate-500">Tizimda kim, qachon va nimani o&apos;zgartirgani.</p>
        </div>
        <ExportCsvButton
          filename="faoliyat-tarixi"
          columns={["Sana", "Foydalanuvchi", "Amal", "Obyekt turi", "Obyekt ID"]}
          rows={(logQuery.data ?? []).map((e) => [
            new Date(e.createdAt).toLocaleString("uz-UZ"),
            e.userFullName ?? "",
            describeAction(e.action, e.beforeData, e.afterData),
            describeEntity(e.entityType),
            e.entityId ?? "",
          ])}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Sana</th>
                <th className="px-4 py-3">Foydalanuvchi</th>
                <th className="px-4 py-3">Amal</th>
                <th className="px-4 py-3">Obyekt turi</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {logQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Yozuv topilmadi
                  </td>
                </tr>
              )}
              {logQuery.data?.map((entry) => (
                <Fragment key={entry.id}>
                  <tr>
                    <td className="px-4 py-3 text-slate-500">{new Date(entry.createdAt).toLocaleString("uz-UZ")}</td>
                    <td className="px-4 py-3">{entry.userFullName ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {describeAction(entry.action, entry.beforeData, entry.afterData)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{describeEntity(entry.entityType)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs font-medium text-brand-600 hover:underline"
                        onClick={() => setExpandedId((id) => (id === entry.id ? null : entry.id))}
                      >
                        {expandedId === entry.id ? "Yopish" : "Batafsil"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr>
                      <td colSpan={5} className="bg-slate-50 px-4 py-3">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <DetailBlock title="Oldin" data={entry.beforeData} />
                          <DetailBlock title="Keyin" data={entry.afterData} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
