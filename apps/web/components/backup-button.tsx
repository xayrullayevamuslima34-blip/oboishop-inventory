"use client";

import { useState } from "react";
import { apiDownload, ApiClientError } from "@/lib/api-client";

// Zaxira nusxa ikki joydan olinadi: header'dagi doimiy 💾 ikon-tugmasi
// (istalgan sahifadan, bir bosishda) va Sozlamalar sahifasidagi tushuntirish
// matni bilan birga turgan to'liq tugma. Ikkalasi ham shu hook orqali bir xil
// yuklab olish oqimini ishlatadi.
export function useBackupDownload() {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      await apiDownload("/backup/download", "oboishop-sklad-backup.sql.gz");
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Zaxira nusxa olishda xatolik yuz berdi");
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading };
}

export function BackupButton() {
  const { download, downloading } = useBackupDownload();

  return (
    <button
      onClick={download}
      disabled={downloading}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      aria-label="Zaxira nusxani yuklab olish"
      title="Zaxira nusxani yuklab olish"
    >
      {downloading ? "⏳" : "💾"}
    </button>
  );
}
