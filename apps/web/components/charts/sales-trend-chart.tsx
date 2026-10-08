"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SalesTrend } from "@oboishop/shared";

// Phase 15 — vizual hisobotlar. Kunlik tushum trendini chizadi. `moneyOutputSchema`
// dan kelgan qiymatlar string (BigInt), shu sabab bu yerda faqat ko'rsatish uchun
// Number()ga o'tkaziladi — hech qachon API'ga qaytarilmaydi.
const moneyFormatter = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0, notation: "compact" });

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}

export function SalesTrendChart({ data, loading }: { data: SalesTrend | undefined; loading: boolean }) {
  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Yuklanmoqda...</div>;
  }
  if (!data || data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Bu davrda ma&apos;lumot yo&apos;q</div>;
  }

  const chartData = data.map((p) => ({ date: p.date, revenue: Number(p.revenue) }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f6fed" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2f6fed" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayLabel}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => moneyFormatter.format(v)}
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value) => [`${new Intl.NumberFormat("uz-UZ").format(Number(value))} so'm`, "Tushum"]}
            labelFormatter={(label) => formatDayLabel(String(label))}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 13 }}
          />
          <Area type="monotone" dataKey="revenue" stroke="#2559c7" strokeWidth={2} fill="url(#salesTrendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
