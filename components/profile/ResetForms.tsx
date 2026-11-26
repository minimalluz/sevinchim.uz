"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestResetAction, resetWithCodeAction, resetWithLinkAction } from "@/app/profil/actions";
import { Field, FormMessage, PasswordInput, btnPrimary, card, inputCls } from "./ui";

/** Telegram орқали тиклаш: 1) телефон/логин → код, 2) код + янги пароль */
export function ResetByTelegram({ support }: { support: string }) {
  const [req, requestAction, pending1] = useActionState(requestResetAction, null);
  const [res, resetAction, pending2] = useActionState(resetWithCodeAction, null);
  const step = res?.step === "code" || req?.step === "code";
  const identifier = res?.identifier || req?.identifier || "";

  return (
    <div className={`${card} mx-auto max-w-md`}>
      {!step ? (
        <form action={requestAction} className="grid gap-4">
          <p className="text-sm text-muted">
            Аккаунтингиз Telegram'га уланган бўлса, тиклаш коди ўша ерга юборилади (SMS ишлатилмайди).
          </p>
          <Field label="Телефон рақами ёки логин">
            <input name="identifier" className={inputCls} required autoComplete="username" placeholder="90 123 45 67" />
          </Field>
          <FormMessage state={req} />
          <button className={btnPrimary} disabled={pending1}>{pending1 ? "Юборилмоқда…" : "Код олиш"}</button>
        </form>
      ) : (
        <form action={resetAction} className="grid gap-4">
          <input type="hidden" name="identifier" value={identifier} />
          <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-muted">
            Агар бу аккаунт Telegram'га уланган бўлса, 6 хонали код <b className="text-ink">сайтнинг Telegram ботига</b> юборилди. Код 15 дақиқа амал қилади.
          </p>
          <Field label="Тасдиқлаш коди">
            <input name="code" className={`${inputCls} text-center font-display text-2xl tracking-[0.4em]`} required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" />
          </Field>
          <Field label="Янги пароль" hint="Камида 8 белги"><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></Field>
          <Field label="Янги паролни такрорланг"><PasswordInput name="password2" required minLength={8} autoComplete="new-password" /></Field>
          <FormMessage state={res} />
          <button className={btnPrimary} disabled={pending2}>{pending2 ? "Сақланмоқда…" : "Паролни янгилаш"}</button>
        </form>
      )}

      <div className="mt-6 border-t border-white/8 pt-4 text-sm text-muted">
        <p className="font-semibold text-ink">Код келмадими ёки Telegram уланмаганми?</p>
        <p className="mt-1">
          Администраторга мурожаат қилинг{support ? <>: <b className="text-ink">{support}</b></> : null}. Шахсингиз тасдиқлангач, паролни
          янгилаш учун бир марталик ҳавола берилади.
        </p>
        <Link href="/profil" className="mt-3 inline-block py-2 font-semibold text-brand hover:underline">← Кириш саҳифасига қайтиш</Link>
      </div>
    </div>
  );
}

/** Администратор берган бир марталик ҳавола: /profil/tiklash?t=… */
export function ResetByLink({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetWithLinkAction, null);
  return (
    <form action={action} className={`${card} mx-auto grid max-w-md gap-4`}>
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted">Янги паролни киритинг. Ҳавола бир марта ишлайди.</p>
      <Field label="Янги пароль" hint="Камида 8 белги"><PasswordInput name="password" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Янги паролни такрорланг"><PasswordInput name="password2" required minLength={8} autoComplete="new-password" /></Field>
      <FormMessage state={state} />
      <button className={btnPrimary} disabled={pending}>{pending ? "Сақланмоқда…" : "Паролни ўрнатиш"}</button>
    </form>
  );
}
