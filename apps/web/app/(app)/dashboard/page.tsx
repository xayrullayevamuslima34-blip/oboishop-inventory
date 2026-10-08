"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { BusinessIndicators } from "@oboishop/shared";
import { useAuth } from "@/lib/use-auth";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export default function DashboardPage() {
  const { user } = useAuth();

  const indicatorsQuery = useQuery({
    queryKey: ["reports", "business-indicators"],
    queryFn: () => apiFetch<BusinessIndicators>("/reports/business-indicators"),
    refetchInterval: 60_000,
  });
  const indicators = indicatorsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Xush kelibsiz{user ? `, ${user.fullName}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-slate-500">Biznesning joriy holati bir qarashda.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Ombordagi qiymat</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {indicators ? formatMoney(indicators.stockValuation) : "..."}
            </p>
          </CardBody>
        </Card>
        <Card className="border-brand-200 bg-brand-50">
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-brand-700">Umumiy balans</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-brand-700">
              {indicators ? formatMoney(indicators.netBalance) : "..."}
            </p>
            <p className="mt-0.5 text-[11px] text-brand-600">Ombor qiymati + kassa − bizning qarzimiz</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Bugungi savdo</h2>
          </CardHeader>
          <CardBody className="flex items-end justify-between">
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {indicators ? formatMoney(indicators.todaySalesRevenue) : "..."}
              </p>
              <p className="text-xs text-slate-500">{indicators?.todayTransactionCount ?? 0} ta sotuv hujjati</p>
            </div>
            <Link href="/reports" className="text-sm font-medium text-brand-600 hover:underline">
              Hisobotlarga →
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Kam qoldiq ogohlantirishi</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Mahsulot</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Qoldiq</th>
                <th className="px-4 py-3 text-right">Minimal chegara</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {indicators?.lowStockItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Kam qoldiqli mahsulot yo&apos;q
                  </td>
                </tr>
              )}
              {indicators?.lowStockItems.map((item) => (
                <tr key={item.productId}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${item.productId}`} className="font-medium text-brand-600 hover:underline">
                      {item.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{item.sku}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatQuantity(item.qtyOnHand)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {formatQuantity(item.minStockThreshold)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Mahsulotlar</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-500">Katalog, narxlar, qoldiq va shtrix-kod boshqaruvi.</p>
            <Link href="/products" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              Mahsulotlarga o&apos;tish →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Mijozlar</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-500">Mijozlar ro&apos;yxati va ular bilan hisob-kitob.</p>
            <Link href="/customers" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
              Mijozlarga o&apos;tish →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
