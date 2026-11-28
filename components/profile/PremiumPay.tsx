"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { IconCopy } from "../icons";
import { FormMessage, btnGhost, btnPrimary, card, fmtDateTime, fmtSum, inputCls } from "./ui";

export function PremiumPay({ price, days, card: cardNo, holder, bank, note, pending, premiumUntil }: {
  price: number;
  days: number;
  card: string;
  holder: string;
  bank: string;
  note: string;
  pending: { id: number; created_at: number; amount: number } | null;
  premiumUntil: number | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; message?: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* эски браузерлар: фойдаланувчи қўлда кўчиради */
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(null);
    if (!file) return setMsg({ error: "Тўлов чеки ёки скриншотини танланг" });
    if (file.size > 10 * 1024 * 1024) return setMsg({ error: "Файл 10 МБ дан катта бўлмасин" });
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await fetch("/api/profil/receipt", { method: "POST", body: fd });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error || "Юклаб бўлмади. Интернетни текшириб, қайта уриниб кўринг.");
      router.push("/profil/premium?yuborildi=1");
      router.refresh();
    } catch (err) {
      setMsg({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const extending = Boolean(premiumUntil && premiumUntil > Date.now());
  const pretty = cardNo.replace(/(\d{4})(?=\d)/g, "$1 ");

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <section className={`${card} border-gold/40 bg-gradient-to-br from-gold/10 to-surface text-center`}>
        <p className="text-sm font-semibold text-gold">PREMIUM обуна</p>
        <p className="mt-2 font-display text-4xl font-extrabold">{fmtSum(price)}</p>
        <p className="mt-1 text-muted">{days} кунлик фойдаланиш</p>
        <ul className="mx-auto mt-4 grid max-w-xs gap-1.5 text-left text-sm">
          <li>★ 102.7 FM эфиридан ёзилган дастурларни тинглаш</li>
          <li>★ Барча дастурларни юклаб олиш</li>
          <li>★ Барча Premium материаллар</li>
        </ul>
        {extending && (
          <p className="mt-4 text-sm text-muted">
            Обунангиз {fmtDateTime(premiumUntil!)} гача фаол. Янги тўлов шу санадан бошлаб {days} кунга қўшилади.
          </p>
        )}
      </section>

      {pending ? (
        <section className={card} role="status">
          <h2 className="font-display text-lg font-bold text-gold">Тўловингиз текширилмоқда</h2>
          <p className="mt-2 text-muted">
            #{pending.id} рақамли тўлов ({fmtSum(pending.amount)}) {fmtDateTime(pending.created_at)} да юборилди. Администратор чекни текшириб
            тасдиқлагач, Premium ўзи фаоллашади. Одатда бу бир неча соат ичида бўлади.
          </p>
          <Link href="/profil" className={`${btnGhost} mt-4`}>Профилга қайтиш</Link>
        </section>
      ) : !cardNo ? (
        <section className={card}>
          <p className="text-muted">Тўлов вақтинча қабул қилинмаяпти. Кейинроқ уриниб кўринг.</p>
        </section>
      ) : (
        <>
          <section className={card} aria-labelledby="step1">
            <h2 id="step1" className="font-display text-lg font-bold">1. Картага {fmtSum(price)} ўтказинг</h2>
            <div className="mt-4 rounded-2xl bg-bg p-4">
              <p className="text-xs text-muted">Карта рақами{bank ? ` • ${bank}` : ""}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-xl font-bold tabular-nums tracking-wider md:text-2xl">{pretty}</p>
                <button type="button" className={`${btnGhost} min-h-11`} onClick={() => copy(cardNo, "card")}>
                  <IconCopy width={16} height={16} /> {copied === "card" ? "Нусхаланди ✓" : "Нусхалаш"}
                </button>
              </div>
              {holder && <p className="mt-2 text-sm">Қабул қилувчи: <b>{holder}</b></p>}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg p-4">
              <div>
                <p className="text-xs text-muted">Сумма</p>
                <p className="font-display text-xl font-bold">{fmtSum(price)}</p>
              </div>
              <button type="button" className={`${btnGhost} min-h-11`} onClick={() => copy(String(price), "sum")}>
                <IconCopy width={16} height={16} /> {copied === "sum" ? "Нусхаланди ✓" : "Нусхалаш"}
              </button>
            </div>
            {note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{note}</p>}
            <p className="mt-3 text-sm text-muted">Click, Payme, банк иловаси ёки банкомат орқали ўтказишингиз мумкин.</p>
          </section>

          <form className={card} onSubmit={submit} aria-labelledby="step2">
            <h2 id="step2" className="font-display text-lg font-bold">2. Тўлов чекини юкланг</h2>
            <p className="mt-1 text-sm text-muted">Ўтказма тасдиғи: чек, квитанция ёки иловадаги скриншот (расм ёки PDF, 10 МБ гача).</p>
            <input
              ref={fileRef}
              type="file"
              name="receipt"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="sr-only"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/15 p-4 text-center transition hover:border-brand/60"
            >
              {file ? (
                <>
                  <span className="font-semibold break-all">{file.name}</span>
                  <span className="text-xs text-muted">{(file.size / 1048576).toFixed(1)} МБ • бошқасини танлаш учун босинг</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Файлни танлаш</span>
                  <span className="text-xs text-muted">Расм ёки PDF</span>
                </>
              )}
            </button>
            <label className="mt-4 grid gap-1.5">
              <span className="text-sm font-semibold">Изоҳ (ихтиёрий)</span>
              <input name="comment" className={inputCls} maxLength={300} placeholder="Масалан: тўлов Humo картасидан" />
            </label>
            <div className="mt-4"><FormMessage state={msg} /></div>
            <button className={`${btnPrimary} mt-4 w-full`} disabled={busy}>{busy ? "Юкланмоқда…" : "Текширишга юбориш"}</button>
            <p className="mt-3 text-xs text-muted">
              Premium тўлов администратор томонидан тасдиқлангандан кейин фаоллашади ва {days} кун амал қилади.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
