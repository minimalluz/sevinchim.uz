"use client";

import { useUser } from "../UserProvider";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { loginAction, registerAction } from "@/app/profil/actions";
import { Field, FormMessage, PasswordInput, btnPrimary, card, inputCls } from "./ui";

type Tab = "login" | "register";

export function AuthForms({ initialTab, next }: { initialTab: Tab; next: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // Кириш/чиқишдан кейин сарлавҳадаги профил тугмаси янгилансин (манзил ўзгармайди)
  const { refresh } = useUser();
  useEffect(() => refresh(), [refresh]);
  const tabCls = (on: boolean) =>
    `min-h-12 flex-1 rounded-full text-sm font-semibold transition ${on ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;

  return (
    <div className={`${card} mx-auto max-w-md`}>
      <div className="flex gap-1 rounded-full bg-bg p-1" role="tablist" aria-label="Кириш ёки рўйхатдан ўтиш">
        <button type="button" role="tab" aria-selected={tab === "login"} className={tabCls(tab === "login")} onClick={() => setTab("login")}>
          Кириш
        </button>
        <button type="button" role="tab" aria-selected={tab === "register"} className={tabCls(tab === "register")} onClick={() => setTab("register")}>
          Рўйхатдан ўтиш
        </button>
      </div>
      <div className="mt-5">{tab === "login" ? <LoginForm next={next} /> : <RegisterForm next={next} />}</div>
    </div>
  );
}

function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Телефон рақами ёки логин">
        <input name="identifier" defaultValue={state?.values?.identifier} className={inputCls} required autoComplete="username" inputMode="text" placeholder="90 123 45 67" />
      </Field>
      <Field label="Пароль">
        <PasswordInput name="password" required autoComplete="current-password" />
      </Field>
      <FormMessage state={state} />
      <button className={btnPrimary} disabled={pending}>{pending ? "Текширилмоқда…" : "Кириш"}</button>
      <Link href="/profil/tiklash" className="justify-self-center py-2 text-sm font-semibold text-brand hover:underline">
        Паролни унутдингизми?
      </Link>
    </form>
  );
}

function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Исм ва фамилия">
        <input name="name" defaultValue={state?.values?.name} className={inputCls} required minLength={3} maxLength={80} autoComplete="name" placeholder="Масалан: Дилноза Каримова" />
      </Field>
      <Field label="Телефон рақами" hint="Шу рақам ва пароль билан кирасиз. SMS юборилмайди.">
        <input name="phone" defaultValue={state?.values?.phone} className={inputCls} required type="tel" inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
      </Field>
      <Field label="Пароль" hint="Камида 8 белги">
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Паролни такрорланг">
        <PasswordInput name="password2" required minLength={8} autoComplete="new-password" />
      </Field>

      <details className="rounded-2xl border border-white/8 px-4 py-3" open={Boolean(state?.values?.login || state?.values?.email) || undefined}>
        <summary className="min-h-8 cursor-pointer text-sm font-semibold text-muted">Логин ва электрон почта (ихтиёрий)</summary>
        <div className="mt-3 grid gap-4">
          <Field label="Логин" hint="Лотин ҳарфлари, рақам, «_» ёки «.» — телефон ўрнига шу билан ҳам кира оласиз">
            <input name="login" defaultValue={state?.values?.login} className={inputCls} maxLength={32} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="dilnoza_k" />
          </Field>
          <Field label="Электрон почта">
            <input name="email" defaultValue={state?.values?.email} type="email" className={inputCls} maxLength={200} autoComplete="email" placeholder="name@example.com" />
          </Field>
        </div>
      </details>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]" />
        <span className="text-muted">
          <Link href="/shartlar" target="_blank" className="font-semibold text-ink underline underline-offset-2">Фойдаланиш шартлари</Link> билан
          танишдим ва шахсий маълумотларим қайта ишланишига розиман
        </span>
      </label>
      <FormMessage state={state} />
      <button className={btnPrimary} disabled={pending}>{pending ? "Аккаунт очилмоқда…" : "Рўйхатдан ўтиш"}</button>
    </form>
  );
}
