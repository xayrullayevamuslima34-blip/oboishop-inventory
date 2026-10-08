"use client";

import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";

export function ExportCsvButton({
  filename,
  columns,
  rows,
  disabled,
}: {
  filename: string;
  columns: string[];
  rows: (string | number)[][];
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="success"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(filename, columns, rows)}
    >
      Excel&apos;ga eksport
    </Button>
  );
}
