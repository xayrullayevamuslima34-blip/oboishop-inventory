"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

const ROLE_LABEL: Record<string, string> = {
  SKLAD_MENEJERI: "Sklad menejeri",
};

// Bitta umumiy login barcha xodimlar (menejer, sotuvchi) o'rtasida taqsimlanadi
// (alohida rol/ruxsat tizimi yo'q) — shuning uchun bu yerdagi ism va parol ham
// o'sha umumiy hisobga tegishli, shaxsiy emas. Shu sababli bu yerda shaxsiy
// telefon/email maydonlari yo'q: do'konning telefoni "Do'kon ma'lumotlari"
// bo'limida, chunki u chekda chiqadi va hisobga emas, magazinga tegishli.
export function AccountSection() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  // Modal saqlangandan keyin yopiladi — tasdiq xabari esa sahifada qoladi,
  // aks holda foydalanuvchi natijani ko'rmay qolardi.
  const [flash, setFlash] = useState<string | null>(null);

  function showFlash(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 3000);
  }

  return (
    <>
      {flash && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {flash}
        </p>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Shaxsiy ma&apos;lumotlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">Hisobdagi ism va login</p>
          </div>
          <Button variant="secondary" onClick={() => setProfileOpen(true)}>
            Tahrirlash
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          <Row label="To'liq ism" value={user?.fullName ?? "—"} />
          <Row label="Login" value={user?.username ?? "—"} hint="Login o'zgartirilmaydi." />
          <Row label="Lavozim" value={(user && ROLE_LABEL[user.role]) ?? "—"} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Parol</h2>
            <p className="mt-0.5 text-xs text-slate-500">Tizimga kirishda ishlatiladigan parol</p>
          </div>
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
            O&apos;zgartirish
          </Button>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500">
            Parol umumiy hisobga tegishli — o&apos;zgartirilsa, keyingi kirishda barcha xodimlar yangisidan
            foydalanadi.
          </p>
        </CardBody>
      </Card>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
      {hint && <p className="w-full text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [error, setError] = useState<string | null>(null);

  // Oyna har ochilganda hozirgi qiymatdan boshlansin — foydalanuvchi oldingi
  // saqlanmagan tahririni ko'rib qolmasligi uchun.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setFullName(user?.fullName ?? "");
      setError(null);
    }
  }

  const mutation = useMutation({
    mutationFn: (input: { fullName: string }) => apiFetch<AuthUser>("/auth/me", { method: "PATCH", body: input }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["auth", "me"], updated);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  return (
    <Modal open={open} onClose={onClose} title="Profil">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate({ fullName });
        }}
        className="space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">To&apos;liq ism</label>
          <Input required autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Login</label>
          <Input value={user?.username ?? ""} disabled className="bg-slate-50 text-slate-500" />
          <p className="mt-1 text-xs text-slate-400">Login o&apos;zgartirilmaydi.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={mutation.isPending || !fullName.trim()}>
            {mutation.isPending ? "Saqlanmoqda..." : "Profilni saqlash"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) reset();
  }

  const mutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<AuthUser>("/auth/change-password", { method: "POST", body: input }),
    onSuccess: () => {
      reset();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yangi parol va tasdiqlash mos kelmadi");
      return;
    }
    mutation.mutate({ currentPassword, newPassword });
  }

  return (
    <>
      {success && (
        <p className="text-sm text-emerald-600" role="status">
          Parol muvaffaqiyatli almashtirildi
        </p>
      )}
      <Modal open={open} onClose={onClose} title="Parolni o'zgartirish">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Joriy parol</label>
            <Input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              placeholder="Joriy parolni kiriting"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Yangi parol</label>
            <Input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Kamida 6 ta belgi"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Yangi parolni takrorlang</label>
            <Input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Parolni takrorlang"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saqlanmoqda..." : "Parolni o'zgartirish"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
