"use client";

import { useUser } from "../UserProvider";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  changePasswordAction, logoutAction, telegramLinkAction, telegramUnlinkAction, updateProfileAction,
} from "@/app/profil/actions";
import type { PublicUser } from "@/lib/users";
import type { PaymentView } from "@/lib/premium";
import { IconCrown } from "../icons";
import { Badge, Field, FormMessage, PasswordInput, btnGhost, btnPrimary, card, fmtDateTime, fmtSum, inputCls, leftLabel } from "./ui";

const STATUS: Record<PaymentView["status"], { label: string; cls: string }> = {
  pending: { label: "Текширилмоқда", cls: "bg-gold/15 text-gold" },
  approved: { label: "Тасдиқланган", cls: "bg-mint/15 text-mint" },
  rejected: { label: "Рад этилган", cls: "bg-live/15 text-live" },
};

export function Cabinet({ user, phone, payments, botReady, restored }: {
  user: PublicUser;
  phone: string;
  payments: PaymentView[];
  botReady: boolean;
  restored: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [open, setOpen] = useState<"edit" | "password" | null>(null);
  // Кириш/чиқишдан кейин сарлавҳадаги профил тугмаси янгилансин (манзил ўзгармайди)
  const { refresh } = useUser();
  useEffect(() => refresh(), [refresh]);
  const premium = Boolean(user.premiumUntil && user.premiumUntil > now);
  const expired = Boolean(user.premiumUntil && user.premiumUntil <= now);
  const pending = payments.find((p) => p.status === "pending");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="grid gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {restored && <p className="rounded-2xl bg-mint/10 px-4 py-3 text-sm font-semibold text-mint" role="status">✓ Пароль янгиланди, тизимга кирдингиз.</p>}

        {/* Профил */}
        <section className={card} aria-label="Профил">
          <div className="flex items-start gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-gradient font-display text-2xl font-extrabold text-white" aria-hidden>
              {user.name.trim()[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold leading-tight break-words">{user.name}</h2>
              <p className="mt-1 text-muted">{phone}</p>
              <div className="mt-2"><Badge premium={premium} /></div>
            </div>
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Логин</dt><dd className="font-semibold">{user.login || "—"}</dd></div>
            <div><dt className="text-muted">Электрон почта</dt><dd className="font-semibold break-all">{user.email || "—"}</dd></div>
            <div><dt className="text-muted">Рўйхатдан ўтган</dt><dd className="font-semibold">{fmtDateTime(user.createdAt)}</dd></div>
            <div><dt className="text-muted">Telegram</dt><dd className="font-semibold">{user.telegram || "уланмаган"}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnGhost} aria-expanded={open === "edit"} onClick={() => setOpen(open === "edit" ? null : "edit")}>
              Профилни таҳрирлаш
            </button>
            <button type="button" className={btnGhost} aria-expanded={open === "password"} onClick={() => setOpen(open === "password" ? null : "password")}>
              Паролни ўзгартириш
            </button>
          </div>
          {open === "edit" && <EditForm user={user} />}
          {open === "password" && <PasswordForm />}
        </section>

        {/* Тўловлар тарихи */}
        <section className={card} aria-labelledby="pay-h">
          <h2 id="pay-h" className="font-display text-lg font-bold">Тўловлар тарихи</h2>
          {payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Ҳали тўлов қилинмаган.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{fmtSum(p.amount)} • {p.days} кун</p>
                    <p className="text-xs text-muted">#{p.id} • {fmtDateTime(p.created_at)}</p>
                    {p.status === "approved" && p.period_until && (
                      <p className="text-xs text-muted">Premium: {fmtDateTime(p.period_from!)} — {fmtDateTime(p.period_until)}</p>
                    )}
                    {p.status === "rejected" && p.reject_reason && <p className="text-xs text-live">Сабаб: {p.reject_reason}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Телефонда обуна энг тепада */}
      <div className="order-first grid gap-5 lg:order-none lg:col-start-2 lg:row-start-1">
        {/* Обуна */}
        <section className={`${card} ${premium ? "border-gold/40 bg-gradient-to-br from-gold/10 to-surface" : ""}`} aria-labelledby="sub-h">
          <h2 id="sub-h" className="flex items-center gap-2 font-display text-lg font-bold">
            <IconCrown width={20} height={20} className="text-gold" /> Обуна
          </h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Аккаунт тури</dt><dd><Badge premium={premium} /></dd></div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Ҳолати</dt>
              <dd className="font-semibold">{premium ? "Фаол" : expired ? "Муддати тугаган" : pending ? "Тўлов текширилмоқда" : "Бепул"}</dd>
            </div>
            {user.premiumFrom && (premium || expired) && (
              <div className="flex justify-between gap-4"><dt className="text-muted">Бошланган</dt><dd className="font-semibold">{fmtDateTime(user.premiumFrom)}</dd></div>
            )}
            {user.premiumUntil && (
              <div className="flex justify-between gap-4"><dt className="text-muted">{premium ? "Тугайди" : "Тугаган"}</dt><dd className="font-semibold">{fmtDateTime(user.premiumUntil)}</dd></div>
            )}
          </dl>
          {premium && (
            <p className="mt-4 rounded-2xl bg-bg/60 px-4 py-3 text-center">
              <span className="block text-xs text-muted">Обуна тугашига</span>
              <span className="font-display text-2xl font-extrabold text-gold">{leftLabel(user.premiumUntil! - now)}</span>
            </p>
          )}
          {pending ? (
            <p className="mt-4 rounded-2xl bg-gold/10 px-4 py-3 text-sm text-gold">
              Тўловингиз (#{pending.id}) администратор томонидан текширилмоқда. Тасдиқлангач, Premium ўзи фаоллашади.
            </p>
          ) : (
            <Link href="/profil/premium" className={`${btnPrimary} mt-4 w-full`}>
              {premium ? "Обунани узайтириш" : "Premium сотиб олиш"}
            </Link>
          )}
          {!premium && (
            <ul className="mt-4 grid gap-1.5 text-sm text-muted">
              <li>★ Барча дастурларни тинглаш</li>
              <li>★ Дастурларни юклаб олиш</li>
              <li>★ Premium материаллар</li>
            </ul>
          )}
        </section>

        <TelegramCard linked={user.telegram} botReady={botReady} />
      </div>

      <form action={logoutAction} className="lg:col-start-2">
        <button className={`${btnGhost} w-full`}>Чиқиш</button>
      </form>
    </div>
  );
}

function EditForm({ user }: { user: PublicUser }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="mt-5 grid gap-4 border-t border-white/8 pt-5">
      <Field label="Исм ва фамилия"><input name="name" defaultValue={user.name} className={inputCls} required minLength={3} maxLength={80} autoComplete="name" /></Field>
      <Field label="Логин (ихтиёрий)"><input name="login" defaultValue={user.login ?? ""} className={inputCls} maxLength={32} autoCapitalize="none" spellCheck={false} /></Field>
      <Field label="Электрон почта (ихтиёрий)"><input name="email" type="email" defaultValue={user.email ?? ""} className={inputCls} maxLength={200} /></Field>
      <p className="text-xs text-muted">Телефон рақамини ўзгартириш учун администраторга мурожаат қилинг.</p>
      <FormMessage state={state} />
      <button className={btnPrimary} disabled={pending}>Сақлаш</button>
    </form>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="mt-5 grid gap-4 border-t border-white/8 pt-5">
      <Field label="Жорий пароль"><PasswordInput name="current" required autoComplete="current-password" /></Field>
      <Field label="Янги пароль" hint="Камида 8 белги"><PasswordInput name="next" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Янги паролни такрорланг"><PasswordInput name="next2" required minLength={8} autoComplete="new-password" /></Field>
      <FormMessage state={state} />
      <button className={btnPrimary} disabled={pending}>Паролни ўзгартириш</button>
    </form>
  );
}

function TelegramCard({ linked, botReady }: { linked: string | null; botReady: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  if (!botReady && !linked) return null;

  const link = () =>
    start(async () => {
      setMsg(null);
      const r = await telegramLinkAction();
      // await дан кейин янги ойна блокланиши мумкин — шу ойнада очамиз (Telegram иловаси очилади)
      if (r?.url) window.location.href = r.url;
      else setMsg(r);
    });
  const unlink = () =>
    start(async () => {
      if (!confirm("Telegram'ни узайми? Паролни тиклаш коди келмай қолади.")) return;
      setMsg(await telegramUnlinkAction());
    });

  return (
    <section className={card} aria-labelledby="tg-h">
      <h2 id="tg-h" className="font-display text-lg font-bold">Telegram</h2>
      <p className="mt-1 text-sm text-muted">
        {linked
          ? <>Уланган: <b className="text-ink">{linked}</b>. Паролни тиклаш коди ва тўлов натижаси шу ерга келади.</>
          : "Улаб қўйинг: паролни унутсангиз, тиклаш коди Telegram'га келади. Тўлов натижаси ҳам хабар қилинади."}
      </p>
      <button type="button" className={`${linked ? btnGhost : btnPrimary} mt-4 w-full`} disabled={pending} onClick={linked ? unlink : link}>
        {linked ? "Telegram'ни узиш" : "Telegram'ни улаш"}
      </button>
      {!linked && <p className="mt-2 text-xs text-muted">Ботда «Start» (Бошлаш) тугмасини босинг, кейин бу саҳифани янгиланг.</p>}
      {msg && <div className="mt-3"><FormMessage state={msg} /></div>}
    </section>
  );
}
