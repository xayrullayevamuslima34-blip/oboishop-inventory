"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { BackupButton } from "@/components/backup-button";
import { OnboardingTour, shouldAutoStartOnboarding } from "@/components/onboarding-tour";
import { Sidebar } from "@/components/sidebar";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Birinchi marta tizimga kirgan foydalanuvchiga tanishtiruv turini avtomatik ko'rsatamiz.
  useEffect(() => {
    if (shouldAutoStartOnboarding()) setOnboardingOpen(true);
  }, []);

  // Sahifa almashganda mobil menyu avtomatik yopilsin.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onLogout={logout}
        userFullName={user?.fullName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 print:hidden">
          <button
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label={mobileNavOpen ? "Menyuni yopish" : "Menyuni ochish"}
            aria-expanded={mobileNavOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 md:hidden"
          >
            {mobileNavOpen ? "✕" : "☰"}
          </button>
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            <button
              id="onboarding-search"
              onClick={() => setSearchOpen(true)}
              aria-label="Qidirish (⌘K)"
              title="Qidirish (⌘K)"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              🔍
            </button>
            <button
              onClick={() => setOnboardingOpen(true)}
              aria-label="Qo'llanma turini ko'rsatish"
              title="Qo'llanma turini ko'rsatish"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              ?
            </button>
            <NotificationBell />
            <BackupButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <OnboardingTour open={onboardingOpen} onOpenChange={setOnboardingOpen} />
    </div>
  );
}
