"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  approvePaymentAction, auditAction, extendPremiumAction, getPremiumSettingsAction, listPaymentsAction, listUsersAction,
  rejectPaymentAction, resetLinkAction, savePremiumSettingsAction, setBlockedAction, setPremiumUntilAction, statsAction, userDetailAction,
} from "@/app/admin/users-actions";
import type { ActionResult } from "@/app/admin/actions";
import type { PremiumSettings } from "@/lib/premium";

/* ---------- Умумий ---------- */

const input =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:opacity-50";
const btnPrimary = `${btn} bg-brand text-white hover:brightness-110`;
const btnGhost = `${btn} border border-white/15 hover:bg-white/5`;
const btnDanger = `${btn} border border-live/40 text-live hover:bg-live/10`;
const box = "rounded-[var(--radius-card)] border border-white/8 bg-surface p-5";

const TZ = 5 * 3600e3;
const p2 = (n: number) => String(n).padStart(2, "0");
const dt = (ms: number | null | undefined) => {
  if (!ms) return "—";
  const d = new Date(ms + TZ);
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
/** datetime-local учун (Тошкент вақти) */
const toLocalInput = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 16);
const sum = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} сўм`;

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Msg({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return (
    <p className={`text-sm font-semibold ${r.ok ? "text-mint" : "text-live"}`} role={r.ok ? "status" : "alert"}>
      {r.ok ? `✓ ${r.message ?? "Тайёр"}` : r.error}
    </p>
  );
}

function Pager({ page, total, per = 30, onPage }: { page: number; total: number; per?: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className={btnGhost} disabled={page <= 1} onClick={() => onPage(page - 1)}>← Олдинги</button>
      <span className="text-muted">{page} / {pages}</span>
      <button className={btnGhost} disabled={page >= pages} onClick={() => onPage(page + 1)}>Кейинги →</button>
    </div>
  );
}

const STATUS = {
  pending: { label: "Кутилмоқда", cls: "bg-gold/15 text-gold" },
  approved: { label: "Тасдиқланган", cls: "bg-mint/15 text-mint" },
  rejected: { label: "Рад этилган", cls: "bg-live/15 text-live" },
} as const;

function TypeBadge({ premium, blocked }: { premium: boolean; blocked?: boolean }) {
  if (blocked) return <span className="rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold text-live">БЛОКЛАНГАН</span>;
  return premium ? (
    <span className="rounded-full bg-gradient-to-r from-gold to-brand px-2 py-0.5 text-[11px] font-extrabold text-bg">PREMIUM</span>
  ) : (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-muted">FREE</span>
  );
}

/* ---------- Фойдаланувчилар ---------- */

type UsersData = Awaited<ReturnType<typeof listUsersAction>>;

export function UsersAdmin() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersData | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listUsersAction(q, filter, page));
    } catch {
      setData({ total: 0, rows: [], now: Date.now() });
    }
  }, [q, filter, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const filters = [
    ["all", "Барчаси"], ["premium", "PREMIUM"], ["free", "FREE"], ["expired", "Муддати тугаган"], ["blocked", "Блокланган"],
  ] as const;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${input} min-w-56 flex-1`}
          type="search"
          placeholder="Исм, телефон ёки логин бўйича қидириш"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          aria-label="Қидириш"
        />
        <select className={`${input} w-auto`} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label="Саралаш">
          {filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {!data ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      ) : data.rows.length === 0 ? (
        <p className={`${box} text-center text-muted`}>Фойдаланувчи топилмади</p>
      ) : (
        <>
          <p className="text-sm text-muted">Жами: {data.total}</p>
          <ul className="grid gap-2">
            {data.rows.map((u) => {
              const prem = !u.blocked && Boolean(u.premium_until && u.premium_until > data.now);
              return (
                <li key={u.id} className={box + " p-0"}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left"
                    aria-expanded={open === u.id}
                    onClick={() => setOpen(open === u.id ? null : u.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {u.name} <TypeBadge premium={prem} blocked={Boolean(u.blocked)} />
                      </span>
                      <span className="block text-sm text-muted">
                        {u.phone}{u.login ? ` • ${u.login}` : ""} • рўйхат: {dt(u.created_at)}
                      </span>
                    </span>
                    <span className="text-right text-xs text-muted">
                      {prem && <span className="block">Premium: {dt(u.premium_until)} гача</span>}
                      {u.paid > 0 && <span className="block">Тўлаган: {sum(u.paid)}</span>}
                    </span>
                  </button>
                  {open === u.id && <UserDetail id={u.id} onChange={load} />}
                </li>
              );
            })}
          </ul>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof userDetailAction>>>;

function UserDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const [u, setU] = useState<Detail | null>(null);
  const [until, setUntil] = useState("");
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await userDetailAction(id);
    setU(d);
    if (d) setUntil(toLocalInput(d.premiumUntil && d.premiumUntil > Date.now() ? d.premiumUntil : Date.now() + 30 * 86400e3));
  }, [id]);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<ActionResult>, ask?: string) => {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setMsg(r);
    await load();
    onChange();
    setBusy(false);
  };

  if (!u) return <div className="mx-4 mb-4 h-24 animate-pulse rounded-2xl bg-white/5" />;
  return (
    <div className="grid gap-4 border-t border-white/8 p-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-muted">Телефон</dt><dd className="font-semibold">{u.phone}</dd></div>
        <div><dt className="text-muted">Логин</dt><dd className="font-semibold">{u.login || "—"}</dd></div>
        <div><dt className="text-muted">Email</dt><dd className="font-semibold break-all">{u.email || "—"}</dd></div>
        <div><dt className="text-muted">Рўйхатдан ўтган</dt><dd className="font-semibold">{dt(u.createdAt)}</dd></div>
        <div><dt className="text-muted">Охирги кириш</dt><dd className="font-semibold">{dt(u.lastLogin)}</dd></div>
        <div><dt className="text-muted">Telegram</dt><dd className="font-semibold">{u.telegram || "уланмаган"}</dd></div>
        <div><dt className="text-muted">Аккаунт</dt><dd><TypeBadge premium={u.premium} blocked={u.blocked} /></dd></div>
        <div><dt className="text-muted">Premium бошланган</dt><dd className="font-semibold">{dt(u.premiumFrom)}</dd></div>
        <div><dt className="text-muted">Premium тугаши</dt><dd className="font-semibold">{dt(u.premiumUntil)}</dd></div>
      </dl>

      <div className="grid gap-3 rounded-2xl bg-bg/50 p-4">
        <p className="text-sm font-semibold">Premium</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Тугаш вақти (Тошкент)">
            <input type="datetime-local" className={input} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <button className={btnPrimary} disabled={busy} onClick={() => act(() => setPremiumUntilAction(u.id, until))}>Муддатни ўрнатиш</button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Кун қўшиш">
            <input type="number" min={1} max={3650} className={`${input} w-28`} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </Field>
          <button className={btnGhost} disabled={busy} onClick={() => act(() => extendPremiumAction(u.id, days))}>+ Узайтириш / фаоллаштириш</button>
          {u.premium && (
            <button className={btnDanger} disabled={busy} onClick={() => act(() => setPremiumUntilAction(u.id, ""), "Premium'ни бекор қилиб, аккаунтни FREE қилайми?")}>
              FREE қилиш
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={u.blocked ? btnGhost : btnDanger}
          disabled={busy}
          onClick={() => act(() => setBlockedAction(u.id, !u.blocked), u.blocked ? undefined : `${u.name} аккаунтини блоклайми? У тизимдан чиқариб юборилади.`)}
        >
          {u.blocked ? "Блокдан чиқариш" : "Блоклаш"}
        </button>
        <button
          className={btnGhost}
          disabled={busy}
          onClick={async () => {
            if (!confirm("Паролни тиклаш ҳаволасини яратайми? (24 соат, бир марталик). Уни фақат шахси тасдиқланган фойдаланувчига беринг.")) return;
            const r = await resetLinkAction(u.id);
            if (r.ok && r.url) setLink(r.url);
            else setMsg(r);
          }}
        >
          Пароль тиклаш ҳаволаси
        </button>
      </div>
      {link && (
        <div className="rounded-2xl bg-gold/10 p-3 text-sm">
          <p className="font-semibold text-gold">Ҳавола (24 соат, бир марталик):</p>
          <p className="mt-1 break-all font-mono text-xs">{link}</p>
          <button className={`${btnGhost} mt-2`} onClick={() => navigator.clipboard?.writeText(link)}>Нусхалаш</button>
        </div>
      )}
      <Msg r={msg} />

      {u.payments.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Тўловлари</p>
          <ul className="grid gap-1 text-sm">
            {u.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg/50 px-3 py-2">
                <span>#{p.id} • {sum(p.amount)} • {dt(p.created_at)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Тўловлар ---------- */

type PaymentsData = Awaited<ReturnType<typeof listPaymentsAction>>;

export function PaymentsAdmin({ onCount }: { onCount?: () => void }) {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaymentsData | null>(null);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listPaymentsAction(status, page));
    } catch {
      setData({ total: 0, rows: [] });
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);

  const act = async (id: number, fn: () => Promise<ActionResult>) => {
    setBusy(id);
    setMsg(null);
    setMsg(await fn());
    await load();
    onCount?.();
    setBusy(null);
  };

  const tabs = [["pending", "Кутилмоқда"], ["approved", "Тасдиқланган"], ["rejected", "Рад этилган"], ["all", "Барчаси"]] as const;

  return (
    <div className="grid gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${status === v ? "bg-ink text-bg" : "bg-surface text-muted"}`}
            aria-pressed={status === v}
            onClick={() => { setStatus(v); setPage(1); }}
          >
            {l}
          </button>
        ))}
      </div>
      <Msg r={msg} />
      {!data ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      ) : data.rows.length === 0 ? (
        <p className={`${box} text-center text-muted`}>{status === "pending" ? "Текширилиши керак бўлган тўлов йўқ" : "Тўлов йўқ"}</p>
      ) : (
        <>
          <ul className="grid gap-3">
            {data.rows.map((p) => (
              <li key={p.id} className={box}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">#{p.id} • {sum(p.amount)} • {p.days} кун</p>
                    <p className="text-sm">{p.user_name} • {p.user_phone}</p>
                    <p className="text-xs text-muted">Юборилган: {dt(p.created_at)}{p.decided_at ? ` • Кўрилган: ${dt(p.decided_at)}` : ""}</p>
                    {p.comment && <p className="mt-1 text-sm text-muted">Изоҳ: {p.comment}</p>}
                    {p.status === "approved" && <p className="text-xs text-muted">Premium: {dt(p.period_from)} — {dt(p.period_until)}</p>}
                    {p.status === "rejected" && p.reject_reason && <p className="text-xs text-live">Сабаб: {p.reject_reason}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                </div>
                {p.hasReceipt && (
                  <a href={`/api/admin/receipts/${p.id}`} target="_blank" rel="noopener" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline">
                    Чекни очиш ↗
                  </a>
                )}
                {p.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className={btnPrimary}
                      disabled={busy === p.id}
                      onClick={() => {
                        if (confirm(`#${p.id}: ${sum(p.amount)} тушганини текширдингизми? Тасдиқласангиз, Premium ${p.days} кунга фаоллашади.`)) {
                          void act(p.id, () => approvePaymentAction(p.id));
                        }
                      }}
                    >
                      ✓ Тасдиқлаш
                    </button>
                    <button
                      className={btnDanger}
                      disabled={busy === p.id}
                      onClick={() => {
                        const reason = prompt("Рад этиш сабаби (фойдаланувчига кўрсатилади):", "Тўлов топилмади ёки чек нотўғри");
                        if (reason !== null) void act(p.id, () => rejectPaymentAction(p.id, reason));
                      }}
                    >
                      ✕ Рад этиш
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/* ---------- Premium: созламалар, статистика, журнал ---------- */

type Stats = Awaited<ReturnType<typeof statsAction>>;
type Audit = Awaited<ReturnType<typeof auditAction>>;

const ACTIONS: Record<string, string> = {
  "payment.approve": "Тўлов тасдиқланди",
  "payment.reject": "Тўлов рад этилди",
  "user.block": "Блокланди",
  "user.unblock": "Блокдан чиқарилди",
  "user.premium.set": "Premium муддати ўрнатилди",
  "user.premium.remove": "FREE қилинди",
  "user.premium.extend": "Premium узайтирилди",
  "user.reset_link": "Пароль тиклаш ҳаволаси",
  "settings.premium": "Premium созламалари",
};

export function PremiumAdmin() {
  const [s, setS] = useState<PremiumSettings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([getPremiumSettingsAction(), statsAction(), auditAction()]);
    setS(a);
    setStats(b);
    setAudit(c);
  }, []);
  useEffect(() => void load(), [load]);

  if (!s || !stats) return <div className="h-60 animate-pulse rounded-[var(--radius-card)] bg-surface" />;
  const maxDay = Math.max(1, ...stats.daily.map((d) => d.sum));
  const maxMonth = Math.max(1, ...stats.monthly.map((d) => d.sum));

  return (
    <div className="grid gap-6">
      {/* Статистика */}
      <section aria-label="Статистика">
        <h2 className="mb-3 font-display text-lg font-bold">Статистика</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Жами фойдаланувчилар", stats.total],
            ["FREE", stats.free],
            ["PREMIUM (фаол)", stats.premium],
            ["Муддати тугаган", stats.expired],
            ["Блокланган", stats.blocked],
            ["Текширилмаган тўлов", stats.pending],
          ].map(([l, v]) => (
            <div key={l as string} className={`${box} p-4`}>
              <p className="text-xs text-muted">{l}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{v}</p>
            </div>
          ))}
          <div className={`${box} col-span-2 border-gold/30 p-4`}>
            <p className="text-xs text-muted">Жами тушум</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-gold">{sum(stats.revenue)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className={box}>
            <p className="text-sm font-semibold">Кунлар бўйича (30 кун)</p>
            {stats.daily.length === 0 ? <p className="mt-2 text-sm text-muted">Ҳали тасдиқланган тўлов йўқ</p> : (
              <ul className="mt-3 grid gap-1.5 text-sm">
                {stats.daily.slice().reverse().map((d) => (
                  <li key={d.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-muted tabular-nums">{d.key.split("-").reverse().join(".")}</span>
                    <span className="h-2 rounded-full bg-brand/80" style={{ width: `${(d.sum / maxDay) * 100}%` }} aria-hidden />
                    <span className="tabular-nums">{d.count} та • {sum(d.sum)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={box}>
            <p className="text-sm font-semibold">Ойлар бўйича (12 ой)</p>
            {stats.monthly.length === 0 ? <p className="mt-2 text-sm text-muted">Ҳали тасдиқланган тўлов йўқ</p> : (
              <ul className="mt-3 grid gap-1.5 text-sm">
                {stats.monthly.slice().reverse().map((d) => (
                  <li key={d.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-muted tabular-nums">{d.key.split("-").reverse().join(".")}</span>
                    <span className="h-2 rounded-full bg-gold/80" style={{ width: `${(d.sum / maxMonth) * 100}%` }} aria-hidden />
                    <span className="tabular-nums">{d.count} та • {sum(d.sum)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Созламалар */}
      <section className={box} aria-label="Premium созламалари">
        <h2 className="font-display text-lg font-bold">Premium обуна ва тўлов</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Обуна нархи (сўм)">
            <input type="number" min={1000} step={1000} className={input} value={s.price} onChange={(e) => setS({ ...s, price: Number(e.target.value) })} />
          </Field>
          <Field label="Обуна муддати (кун)">
            <input type="number" min={1} max={3650} className={input} value={s.days} onChange={(e) => setS({ ...s, days: Number(e.target.value) })} />
          </Field>
          <Field label="Карта рақами (16 хона)">
            <input className={input} inputMode="numeric" value={s.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")} onChange={(e) => setS({ ...s, cardNumber: e.target.value.replace(/\D/g, "").slice(0, 16) })} placeholder="8600 0000 0000 0000" />
          </Field>
          <Field label="Карта эгаси (исм-фамилия)">
            <input className={input} value={s.cardHolder} onChange={(e) => setS({ ...s, cardHolder: e.target.value })} maxLength={80} />
          </Field>
          <Field label="Банк / тўлов тизими">
            <input className={input} value={s.cardBank} onChange={(e) => setS({ ...s, cardBank: e.target.value })} maxLength={60} placeholder="Humo, Uzcard, Visa…" />
          </Field>
          <Field label="Ёрдам учун алоқа (Telegram ёки телефон)">
            <input className={input} value={s.support} onChange={(e) => setS({ ...s, support: e.target.value })} maxLength={100} placeholder="@sevinchim_admin ёки +998 …" />
          </Field>
          <Field label="Тўлов саҳифасидаги қўшимча изоҳ" className="md:col-span-2">
            <textarea className={`${input} min-h-20 py-2`} value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} maxLength={500} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">Нарх ва муддат фақат янги тўловларга таъсир қилади. Карта рақами киритилмагунча тўлов қабул қилинмайди.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className={btnPrimary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(await savePremiumSettingsAction(s));
              await load();
              setBusy(false);
            }}
          >
            Сақлаш
          </button>
          <Msg r={msg} />
        </div>
      </section>

      {/* Журнал */}
      <section className={box} aria-label="Админ амаллари журнали">
        <h2 className="font-display text-lg font-bold">Амаллар журнали</h2>
        {!audit || audit.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ҳали амал йўқ</p>
        ) : (
          <ul className="mt-3 max-h-96 divide-y divide-white/5 overflow-y-auto text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                <span>
                  <b>{ACTIONS[a.action] ?? a.action}</b>
                  {a.target ? <span className="text-muted"> • #{a.target}</span> : null}
                  <span className="text-muted"> • {a.actor.startsWith("telegram:") ? "Telegram" : "Панел"}</span>
                </span>
                <span className="text-xs text-muted tabular-nums">{dt(a.at)}{a.ip ? ` • ${a.ip}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
