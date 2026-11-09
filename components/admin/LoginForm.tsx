"use client";

import { useActionState } from "react";
import { login, type ActionResult } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(login, null);
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="font-display text-2xl font-bold">Бошқарув панели</h1>
      <p className="mt-2 text-muted">Давом этиш учун паролни киритинг.</p>
      <form action={action} className="mt-6 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Парол</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-h-12 rounded-2xl border border-line bg-surface px-4 text-ink focus:border-brand focus:outline-none"
          />
        </label>
        {state && !state.ok && <p className="text-sm text-live" role="alert">{state.error}</p>}
        <button disabled={pending} className="min-h-12 rounded-full bg-brand-gradient font-semibold text-white disabled:opacity-60">
          {pending ? "Текширилмоқда…" : "Кириш"}
        </button>
      </form>
    </section>
  );
}
