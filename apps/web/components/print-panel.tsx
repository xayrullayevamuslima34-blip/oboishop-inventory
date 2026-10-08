"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Same print-isolation trick as apps/web/app/(app)/products/labels/page.tsx —
// `body * { visibility: hidden }` then re-reveal only #app-print-area, so
// nav/buttons/other page content never leak into the printed page. Only one
// PrintPanel is ever mounted at a time per page (callers gate it behind a
// single `printMode` state), so a fixed id is safe to reuse across pages.
export function PrintPanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #app-print-area, #app-print-area * { visibility: visible; }
          #app-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="mb-3 flex justify-end gap-3 print:hidden">
        <Button onClick={() => window.print()}>Chop etish</Button>
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      </div>
      <Card>
        <div id="app-print-area" className="p-6">
          {children}
        </div>
      </Card>
    </div>
  );
}
