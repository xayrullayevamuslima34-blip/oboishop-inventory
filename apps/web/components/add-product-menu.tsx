"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// "Yangi mahsulot qo'shish" tugmasi ikki yo'lni taklif qiladi: bitta
// mahsulotni to'liq forma bilan qo'shish yoki bir necha mahsulotni jadval
// ko'rinishida ketma-ket kiritish.
export function AddProductMenu({ onSingle, onBulk }: { onSingle: () => void; onBulk: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((v) => !v)}>+ Yangi mahsulot qo&apos;shish</Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => pick(onSingle)}
            className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Mahsulotni donalab qo&apos;shish
          </button>
          <button
            type="button"
            onClick={() => pick(onBulk)}
            className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Mahsulotlarni ko&apos;p miqdorda qo&apos;shish
          </button>
        </div>
      )}
    </div>
  );
}
