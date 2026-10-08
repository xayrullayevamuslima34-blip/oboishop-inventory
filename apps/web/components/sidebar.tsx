"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "oboishop_sidebar_collapsed";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

// Nav guruhlari bosqichma-bosqich to'ldirib borilgan — yangi bo'lim qo'shilganda
// tegishli guruhga (yoki yangi guruhga) qo'shiladi.
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Sotuv",
    items: [
      { href: "/pos", label: "Tezkor sotuv", icon: BoltIcon },
      { href: "/operations", label: "Operatsiyalar", icon: ListIcon },
      { href: "/returns", label: "Qaytaruv", icon: ReturnIcon },
      { href: "/customers", label: "Mijozlar", icon: UsersIcon },
    ],
  },
  {
    heading: "Ombor",
    items: [{ href: "/products", label: "Mahsulotlar", icon: PackageIcon }],
  },
  {
    heading: "Hisobot",
    items: [
      { href: "/reports", label: "Hisobotlar", icon: ChartIcon },
      { href: "/audit-log", label: "Tarix", icon: HistoryIcon },
    ],
  },
];

// Boshqa joylarda ham (masalan qidiruv oynasida) "sahifaga o'tish" ro'yxati sifatida qayta
// ishlatish uchun — chap menyudagi guruhlarni tekis ro'yxatga aylantiradi, Bosh sahifani qo'shib.
export const PAGE_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Bosh sahifa" },
  ...NAV_GROUPS.flatMap((group) => group.items.map(({ href, label }) => ({ href, label }))),
];

export function Sidebar({
  mobileOpen,
  onMobileClose,
  onLogout,
  userFullName,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  onLogout: () => void;
  userFullName?: string | null;
}) {
  const pathname = usePathname();
  // Standart holat — yig'ilgan (faqat ikonkalar); sichqoncha olib borilganda vaqtincha yoyiladi.
  const [collapsed, setCollapsed] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  // Mobil drawer'da hover tushunchasi yo'q — ochilganda har doim to'liq (yozuvlar bilan) ko'rsatamiz.
  const effectiveCollapsed = collapsed && !hovering && !mobileOpen;

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [accountMenuOpen]);

  // localStorage server'da mavjud emas — foydalanuvchining oldingi tanlovini
  // faqat mijoz tomonida, birinchi render'dan keyin o'qiymiz (hydration mos kelishi uchun).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "0") setCollapsed(false);
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={onMobileClose} />}
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`group/sidebar fixed inset-y-0 left-0 z-40 flex ${
          effectiveCollapsed ? "w-16" : "w-60"
        } shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-150 print:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:sticky md:top-0 md:h-screen md:translate-x-0 ${collapsed && hovering ? "md:shadow-lg" : ""}`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2" onClick={onMobileClose}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              O
            </span>
            {!effectiveCollapsed && <span className="truncate text-sm font-semibold text-brand-700">Oboishop Sklad</span>}
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.heading}>
              {!effectiveCollapsed && (
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.heading}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item, ii) => {
                  const active = pathname?.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      id={gi === 0 && ii === 0 ? "onboarding-nav" : undefined}
                      href={item.href}
                      onClick={onMobileClose}
                      title={effectiveCollapsed ? item.label : undefined}
                      className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium ${
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                      } ${effectiveCollapsed ? "justify-center" : ""}`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div ref={accountMenuRef} className="relative shrink-0 border-t border-slate-200 p-3">
          {accountMenuOpen && (
            <div
              className={`absolute bottom-full mb-2 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg ${
                effectiveCollapsed ? "left-2" : "left-3 right-3 w-auto"
              }`}
            >
              <Link
                href="/profile"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onMobileClose();
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <UserCircleIcon className="h-4 w-4" />
                Profil
              </Link>
              <button
                onClick={onLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOutIcon className="h-4 w-4" />
                Chiqish
              </button>
            </div>
          )}
          <button
            onClick={() => setAccountMenuOpen((v) => !v)}
            title={effectiveCollapsed ? userFullName ?? "Hisob" : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 ${
              effectiveCollapsed ? "justify-center" : ""
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {(userFullName ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            {!effectiveCollapsed && <span className="min-w-0 flex-1 truncate text-left">{userFullName ?? "Hisob"}</span>}
          </button>
        </div>

        {/* Sidebar'ni yig'ish/yoyish strelkasi — faqat sidebar'ga sichqonchani olib borganda ko'rinadi. */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Menyuni yoyish" : "Menyuni yig'ish"}
          className="absolute -right-3 top-16 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 opacity-0 shadow-sm transition-opacity hover:text-slate-700 group-hover/sidebar:opacity-100 md:flex"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </aside>
    </>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      {collapsed ? <polyline points="9 6 15 12 9 18" /> : <polyline points="15 6 9 12 15 18" />}
    </svg>
  );
}

function BoltIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function PackageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

function UsersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ListIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ReturnIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function ChartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function HistoryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function LogOutIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function UserCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19.5C7.5 17 9.5 15.5 12 15.5s4.5 1.5 5.5 4" />
    </svg>
  );
}
