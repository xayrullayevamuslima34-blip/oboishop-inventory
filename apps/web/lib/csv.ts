// Client-side CSV export — no backend endpoint needed since every report
// page already has the full dataset in memory after fetching it for the
// table. Opens directly in Excel (UTF-8 BOM so Cyrillic/Uzbek characters
// don't get mangled by Excel's default codepage guess on Windows).
export function downloadCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [columns.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))];
  const csv = "﻿" + lines.join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
