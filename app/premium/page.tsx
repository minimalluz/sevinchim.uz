import type { Metadata } from "next";
import Link from "next/link";
import { getPublicContent } from "@/lib/content";
import { getPremiumSettings, formatSum } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { ArchiveBrowser } from "@/components/Archive";
import { IconCrown } from "@/components/icons";

// Нарх ва муддат админ-панелдан ўзгаради — ҳар доим янги қиймат
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PREMIUM обуна",
  description: "Sevinchim.uz PREMIUM: барча дастурларни тинглаш ва юклаб олиш, сайтни қўллаб-қувватлаш.",
  alternates: { canonical: "/premium" },
};

const yes = <span className="font-bold text-mint" aria-label="Ҳа">✓</span>;
const no = <span className="text-muted" aria-label="Йўқ">—</span>;

export default async function PremiumLanding() {
  const st = getPremiumSettings();
  const { episodes: all, rubrics, profile } = await getPublicContent();
  const episodes = all.filter((e) => e.access === "premium");
  const premiumCount = episodes.length;
  const usedRubrics = rubrics.filter((r) => episodes.some((e) => e.rubric === r));
  const payReady = Boolean(st.cardNumber);

  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ["Жонли эфирни тинглаш", yes, yes],
    ["Архив дастурларини тинглаш", yes, yes],
    [`${profile.frequency} эфиридан ёзилган дастурлар`, no, yes],
    ["Дастурларни юклаб олиш", no, yes],
    ["Premium материаллар", no, yes],
    ["Сайтни қўллаб-қувватлаш", no, <span key="h" aria-label="Ҳа">💛</span>],
  ];

  const steps = [
    ["Рўйхатдан ўтинг", "Исм-фамилия, телефон рақами ва пароль — 1 дақиқа. SMS керак эмас."],
    ["Картага ўтказинг", `${formatSum(st.price)}ни кўрсатилган картага Click, Payme ёки банк иловаси орқали ўтказинг.`],
    ["Чекни юкланг", "Тўлов чеки ёки скриншотини «Менинг профилим» орқали юборинг."],
    ["Тинглашни бошланг", `Администратор тасдиқлагач, PREMIUM ${st.days} кунга ўзи фаоллашади.`],
  ];

  const faq = [
    ["PREMIUM мажбурийми?", "Йўқ. PREMIUM ихтиёрий — жонли эфир ва архивдаги дастурлар ҳамма учун бепул қолади."],
    ["Обуна қачон фаоллашади?", "Тўлов администратор томонидан тасдиқлангандан кейин. Одатда бу бир неча соат ичида бўлади; Telegram уланган бўлса, хабар келади."],
    ["Муддат тугагач нима бўлади?", `${st.days} кундан кейин аккаунт ўзи FREE ҳолатига қайтади — ҳеч нарса ечиб олинмайди. Хоҳласангиз, қайта тўлаб узайтирасиз.`],
    ["Муддат тугамасдан узайтирсам?", "Янги муддат жорий обунанинг охиридан бошлаб қўшилади — бирорта кун йўқолмайди."],
    ["Юклаб олинган дастурлардан қандай фойдаланса бўлади?", "Шахсий тинглаш учун ва манба (sevinchim.uz) кўрсатилган ҳолда улашиш мумкин. Тижорат мақсадида фойдаланиш тақиқланади — батафсил «Фойдаланиш шартлари»да."],
  ];

  return (
    <div className="pb-10">
      {/* Бош қисм */}
      <section className="relative mt-6 overflow-hidden rounded-[2rem] border border-gold/30 bg-gradient-to-br from-gold/15 via-surface to-brand/15 px-6 py-10 md:mt-10 md:px-12 md:py-14">
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-gold/20 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-gold"><IconCrown width={18} height={18} /> PREMIUM</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight md:text-5xl">«{profile.station}» эфиридан дастурлар</h1>
            <p className="mt-4 max-w-xl text-muted md:text-lg">
              {profile.frequency} тўлқинидаги эфирлардан ёзиб олинган дастурларни исталган вақтда тингланг ва юклаб олинг. Обунангиз
              сайтнинг домен ва сервер харажатларини қоплашга, унинг узлуксиз ишлашига ёрдам беради.
            </p>
            <PremiumCta ready={payReady} className="mt-7" />
          </div>
          <div className="rounded-3xl border border-white/10 bg-bg/60 px-8 py-7 text-center backdrop-blur">
            <p className="font-display text-4xl font-extrabold md:text-5xl">{formatSum(st.price).replace(" сўм", "")}</p>
            <p className="mt-1 font-semibold">сўм</p>
            <p className="mt-2 text-sm text-muted">{st.days} кунлик обуна</p>
            {premiumCount > 0 && <p className="mt-3 text-xs font-semibold text-gold">{premiumCount} та Premium дастур</p>}
          </div>
        </div>
      </section>

      {/* PREMIUM дастурлар (архивдан алоҳида) */}
      <section className="mt-12" aria-labelledby="list-h">
        <h2 id="list-h" className="font-display text-xl font-bold md:text-2xl">PREMIUM дастурлар</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          {profile.frequency} эфиридан ёзиб олинган. Тинглаш ва юклаб олиш — PREMIUM обуначилар учун.{" "}
          <Link href="/arxiv" className="font-semibold text-ink underline underline-offset-2">Архив дастурлари</Link> эса ҳамма учун очиқ.
        </p>
        <ArchiveBrowser episodes={episodes} rubrics={usedRubrics} emptyText="PREMIUM дастурлар тез орада қўшилади." />
      </section>

      {/* FREE / PREMIUM */}
      <section className="mt-12" aria-labelledby="cmp-h">
        <h2 id="cmp-h" className="font-display text-xl font-bold md:text-2xl">FREE ва PREMIUM</h2>
        <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-white/8 bg-surface">
          <table className="w-full text-left text-sm md:text-base">
            <thead>
              <tr className="border-b border-white/8">
                <th scope="col" className="px-4 py-3 font-semibold text-muted md:px-6">Имконият</th>
                <th scope="col" className="w-20 px-2 py-3 text-center font-bold md:w-32">FREE</th>
                <th scope="col" className="w-24 bg-gold/10 px-2 py-3 text-center font-extrabold text-gold md:w-36">PREMIUM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, f, p]) => (
                <tr key={label} className="border-b border-white/5 last:border-0">
                  <th scope="row" className="px-4 py-3 font-medium md:px-6">{label}</th>
                  <td className="px-2 py-3 text-center">{f}</td>
                  <td className="bg-gold/5 px-2 py-3 text-center">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">Рўйхатдан ўтиш бепул. FREE аккаунт ҳам шахсий кабинет беради.</p>
      </section>

      {/* Қандай сотиб олинади */}
      <section className="mt-12" aria-labelledby="how-h">
        <h2 id="how-h" className="font-display text-xl font-bold md:text-2xl">Қандай сотиб олинади</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
              <span className="grid size-10 place-items-center rounded-full bg-brand-gradient font-display font-extrabold text-white">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Саволлар */}
      <section className="mt-12" aria-labelledby="faq-h">
        <h2 id="faq-h" className="font-display text-xl font-bold md:text-2xl">Кўп бериладиган саволлар</h2>
        <div className="mt-4 grid gap-2">
          {faq.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-white/8 bg-surface px-5 py-4">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {q}
                <span className="text-muted transition group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          Батафсил: <Link href="/shartlar" className="font-semibold text-ink underline underline-offset-2">Фойдаланиш шартлари</Link>
          {st.support ? <> • Саволлар бўйича: <b className="text-ink">{st.support}</b></> : null}
        </p>
      </section>

      {/* Пастки чақириқ */}
      <section className="mt-12 rounded-[var(--radius-card)] border border-gold/30 bg-gradient-to-r from-gold/10 to-brand/10 p-6 text-center md:p-10">
        <h2 className="font-display text-2xl font-extrabold">Қўллаб-қувватлаганингиз учун катта раҳмат!</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">PREMIUM сотиб олиш ихтиёрий. Сайтдан бепул фойдаланиш имконияти ҳам сақланиб қолади.</p>
        <div className="mt-6 flex justify-center"><PremiumCta ready={payReady} /></div>
      </section>
    </div>
  );
}
