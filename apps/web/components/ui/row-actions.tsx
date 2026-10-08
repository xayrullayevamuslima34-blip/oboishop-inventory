"use client";

import { useEffect, useRef, useState } from "react";

// Jadval qatoridagi "⋯" tugmasi — bosilganda tahrirlash/o'chirish menyusi
// ochiladi. Har bir qatorga ikkita tugmani yonma-yon qo'yish o'rniga bitta
// ixcham nuqta ishlatiladi (mahsulotlar va mijozlar jadvalida bir xil).
export function RowActions({
  onEdit,
  onDelete,
  deleteLabel = "O'chirish",
  editLabel = "Tahrirlash",
  extraActions = [],
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  editLabel?: string;
  /** Tahrirlash/O'chirishdan oldin chiqadigan qo'shimcha amallar. */
  extraActions?: { label: string; onClick: () => void }[];
}) {
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

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Amallar"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${
          open ? "bg-slate-100 text-slate-700" : ""
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-left shadow-lg">
          {extraActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {action.label}
            </button>
          ))}
          {extraActions.length > 0 && <div className="my-1 border-t border-slate-100" />}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            {editLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            {deleteLabel}
          </button>
        </div>
      )}
    </div>
  );
}
