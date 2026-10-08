"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Brauzerning window.confirm/prompt oynasi ilovaning dizayniga umuman
// o'xshamaydi (qora tizim oynasi). Shu sabab tasdiqlash va sabab so'rash
// uchun ilovaning o'z modal oynasidan foydalanamiz.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Tasdiqlash",
  cancelLabel = "Bekor qilish",
  variant = "danger",
  reasonLabel,
  reasonPlaceholder,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  /** Berilsa — majburiy sabab maydoni chiqadi (masalan hujjatni bekor qilishda). */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const needsReason = !!reasonLabel;
  const reasonMissing = needsReason && !reason.trim();

  function confirm() {
    if (reasonMissing) {
      setTouched(true);
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {message && <p className="text-sm text-slate-600">{message}</p>}

        {needsReason && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{reasonLabel}</label>
            <Input
              autoFocus
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
            />
            {touched && reasonMissing && <p className="mt-1 text-xs text-red-600">Sababini yozing</p>}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={confirm} disabled={pending}>
            {pending ? "Bajarilmoqda..." : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
