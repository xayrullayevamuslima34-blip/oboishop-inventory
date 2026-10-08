"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

const ROLE_LABEL: Record<string, string> = {
  SKLAD_MENEJERI: "Sklad menejeri",
};

// Bitta umumiy login barcha xodimlar (menejer, sotuvchi) o'rtasida taqsimlanadi
// (alohida rol/ruxsat tizimi yo'q) — shuning uchun bu yerdagi ism va parol ham
// o'sha umumiy hisobga tegishli, shaxsiy emas.
export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (user) setFullName(user.fullName);
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: (input: { fullName: string }) => apiFetch<AuthUser>("/auth/me", { method: "PATCH", body: input }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["auth", "me"], updated);
      setProfileError(null);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (err) => setProfileError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  const passwordMutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<AuthUser>("/auth/change-password", { method: "POST", body: input }),
    onSuccess: () => {
      setPasswordError(null);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (err) => setPasswordError(err instanceof ApiClientError ? err.message : "Xatolik yuz berdi"),
  });

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    profileMutation.mutate({ fullName });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Yangi parol va tasdiqlash mos kelmadi");
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Profil</h1>
        <p className="mt-1 text-sm text-slate-500">Umumiy hisob ma&apos;lumotlari va parol.</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Shaxsiy ma&apos;lumotlar</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">To&apos;liq ism</label>
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Login</label>
              <Input value={user?.username ?? ""} disabled className="bg-slate-50 text-slate-500" />
              <p className="mt-1 text-xs text-slate-400">Login o&apos;zgartirilmaydi.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lavozim</label>
              <Input value={(user && ROLE_LABEL[user.role]) ?? ""} disabled className="bg-slate-50 text-slate-500" />
            </div>
            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-600">Saqlandi</p>}
            <Button type="submit" disabled={profileMutation.isPending || !fullName.trim()}>
              {profileMutation.isPending ? "Saqlanmoqda..." : "Profilni saqlash"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Parolni o&apos;zgartirish</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Joriy parol</label>
              <Input
                type="password"
                required
                autoComplete="current-password"
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-emerald-600">Parol muvaffaqiyatli almashtirildi</p>}
            <Button type="submit" disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? "Saqlanmoqda..." : "Parolni almashtirish"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
