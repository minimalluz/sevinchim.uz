"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

export const inputCls =
  "min-h-12 w-full rounded-2xl border border-white/10 bg-bg px-4 text-base text-ink placeholder:text-muted/60 transition focus:border-brand focus:outline-none";
export const btnPrimary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-gradient px-6 text-base font-semibold text-white shadow-lg shadow-brand/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60";
export const btnGhost =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-60";
export const card = "rounded-[var(--radius-card)] border border-white/8 bg-surface p-5 md:p-6";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Паролни кўрсатиш/яшириш тугмаси билан */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? "text" : "password"} className={`${inputCls} pr-24`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-full px-3 text-xs font-semibold text-muted hover:text-ink"
        aria-label={show ? "Паролни яшириш" : "Паролни кўрсатиш"}
      >
        {show ? "Яшириш" : "Кўрсатиш"}
      </button>
    </span>
  );
}

export function FormMessage({ state }: { state: { error?: string; message?: string } | null }) {
  if (!state) return null;
  if (state.error) return <p className="rounded-2xl bg-live/10 px-4 py-3 text-sm font-semibold text-live" role="alert">{state.error}</p>;
  if (state.message) return <p className="rounded-2xl bg-mint/10 px-4 py-3 text-sm font-semibold text-mint" role="status">{state.message}</p>;
  return null;
}

export function Badge({ premium }: { premium: boolean }) {
  return premium ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-gold to-brand px-3 py-1 text-xs font-extrabold tracking-wider text-bg">
      ★ PREMIUM
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold tracking-wider text-muted">FREE</span>
  );
}

const TZ = 5 * 3600e3;
/** «26.11.2026, 18:40» — Тошкент вақти */
export function fmtDateTime(ms: number) {
  const d = new Date(ms + TZ);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export const fmtSum = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} сўм`;

/** «12 кун 4 соат» */
export function leftLabel(ms: number) {
  if (ms <= 0) return "тугаган";
  const d = Math.floor(ms / 86400e3);
  const h = Math.floor((ms % 86400e3) / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  if (d > 0) return `${d} кун ${h} соат`;
  if (h > 0) return `${h} соат ${m} дақиқа`;
  return `${Math.max(1, m)} дақиқа`;
}
