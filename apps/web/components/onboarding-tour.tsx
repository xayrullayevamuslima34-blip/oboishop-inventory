"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "oboishop_onboarding_v1";

interface Step {
  title: string;
  body: string;
  /** DOM id of the element to point the popover at — omit to show a centered dialog. */
  anchorId?: string;
  /** Popover joylashuvi: nishonning tagida yoki o'ng tomonida (chap menyu uchun). */
  placement?: "bottom" | "right";
}

const STEPS: Step[] = [
  {
    title: "Xush kelibsiz, Oboishop Sklad!",
    body: "Qisqacha qayerda nima borligini ko'rsatamiz — atigi 20 soniya.",
  },
  {
    title: "Barcha boshqaruv chap menyuda",
    body: "Chap tomondagi menyuda — tezkor sotuv, mijozlar, mahsulotlar va hisobotlar guruhlangan. Hammasi shu yerdan boshqariladi.",
    anchorId: "onboarding-nav",
    placement: "right",
  },
  {
    title: "Tezkor o'tish — ⌘K",
    body: "⌘K (yoki Ctrl+K) bosing va qayerga o'tishni yozing — menyularni qidirib yurish shart emas.",
    anchorId: "onboarding-search",
    placement: "bottom",
  },
  {
    title: "Tayyor!",
    body: "Endi ishni boshlashingiz mumkin. Turni istalgan vaqt header'dagi \"?\" tugmasi orqali qayta ko'rishingiz mumkin.",
  },
];

/** Onboarding'ni birinchi marta ko'rsatish kerakligini tekshiradi (localStorage). */
export function shouldAutoStartOnboarding() {
  if (typeof window === "undefined") return false;
  return !window.localStorage.getItem(STORAGE_KEY);
}

export function OnboardingTour({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = STEPS[step] ?? STEPS[0]!;

  useEffect(() => {
    if (!open) return;
    function measure() {
      const anchorId = current.anchorId;
      const el = anchorId ? document.getElementById(anchorId) : null;
      setRect(el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, current.anchorId]);

  if (!open) return null;

  function complete() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    onOpenChange(false);
  }

  function next() {
    if (step === STEPS.length - 1) complete();
    else setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  const anchored = !!rect;
  const placement = current.placement ?? "bottom";
  const popoverWidth = 320;
  const popoverHeightEstimate = 170;
  let top = 0;
  let left = 0;
  let arrowStyle: React.CSSProperties = {};
  let arrowSide: "top" | "left" = "top";

  if (anchored && rect) {
    if (placement === "right") {
      arrowSide = "left";
      const maxTop = window.innerHeight - popoverHeightEstimate - 16;
      top = Math.min(Math.max(rect.top, 16), Math.max(maxTop, 16));
      left = rect.right + 12;
      const arrowTop = Math.min(Math.max(rect.top + rect.height / 2 - top - 6, 12), popoverHeightEstimate - 24);
      arrowStyle = { top: arrowTop };
    } else {
      arrowSide = "top";
      const maxLeft = window.innerWidth - popoverWidth - 16;
      top = rect.bottom + 12;
      left = Math.min(Math.max(rect.left, 16), Math.max(maxLeft, 16));
      const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left - 6, 12), popoverWidth - 24);
      arrowStyle = { left: arrowLeft };
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={complete}>
      {!anchored && <div className="absolute inset-0 bg-slate-900/40" />}
      <div
        className={anchored ? "absolute" : "absolute inset-0 flex items-center justify-center px-4"}
        style={anchored ? { top, left } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {anchored && (
          <div
            className={`absolute h-3 w-3 rotate-45 rounded-sm bg-white ring-1 ring-slate-200 ${
              arrowSide === "top" ? "-top-1.5" : "-left-1.5"
            }`}
            style={arrowStyle}
          />
        )}
        <div className="w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200" role="dialog" aria-modal="true">
          <h2 className="text-base font-semibold text-slate-900">{current.title}</h2>
          <p className="mt-2 text-sm text-slate-500">{current.body}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {step + 1} / {STEPS.length}
            </span>
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button onClick={back} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                  Orqaga
                </button>
              )}
              {step < STEPS.length - 1 && (
                <button onClick={complete} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                  O&apos;tkazib yuborish
                </button>
              )}
              <button onClick={next} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                {step === STEPS.length - 1 ? "Ishni boshlash" : "Keyingi"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
