"use client";

import Link from "next/link";
import { IconCrown } from "./icons";
import { useUser } from "./UserProvider";

/** Бош саҳифа: сайтни қўллаб-қувватлашга чақириқ (Premium обуначига — раҳмат) */
export function SupportPremium() {
  const { user } = useUser();
  const premium = Boolean(user?.premium);

  return (
    <section
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-gold/30 bg-gradient-to-br from-gold/12 via-surface to-brand/10 p-6 md:p-10"
      aria-labelledby="support-h"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-gold/15 blur-3xl" aria-hidden />
      <div className="relative max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-gold">
          <IconCrown width={18} height={18} /> PREMIUM
        </p>
        <h2 id="support-h" className="mt-2 font-display text-2xl font-extrabold leading-tight md:text-3xl">
          Сайтимизни қўллаб-қувватланг!
        </h2>

        {premium ? (
          <p className="mt-4 leading-relaxed text-muted md:text-lg">
            Сиз PREMIUM обуначисиз — сайтимизнинг ривожланиши ва барқарор ишлашига ҳисса қўшаётганингиз учун{" "}
            <b className="text-ink">катта раҳмат!</b> 💛
          </p>
        ) : (
          <>
            <p className="mt-4 leading-relaxed text-muted md:text-lg">
              Sevinchim.uz сайтининг домен ва сервер харажатларини қоплаш, шунингдек, сайтнинг узлуксиз ва барқарор ишлашини
              таъминлаш мақсадида <b className="text-ink">PREMIUM аккаунтини сотиб олишингизни тавсия қиламиз.</b>
            </p>
            <p className="mt-3 leading-relaxed text-muted md:text-lg">
              PREMIUM аккаунтини харид қилиш орқали сиз нафақат барча дастурлардан тўлиқ фойдаланиш имкониятига эга бўласиз, балки
              сайтимизнинг ривожланиши ва келгусида ҳам фаолият юритишини қўллаб-қувватлаган бўласиз.
            </p>
            <p className="mt-3 leading-relaxed text-muted md:text-lg">
              <b className="text-ink">PREMIUM аккаунтини сотиб олиш ихтиёрий.</b> Сайтдан бепул фойдаланиш имконияти ҳам сақланиб қолади.
            </p>
            <p className="mt-3 font-semibold text-ink md:text-lg">Қўллаб-қувватлаганингиз учун катта раҳмат!</p>
            <Link
              href={user ? "/profil/premium" : "/profil?next=/profil/premium"}
              className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-r from-gold to-brand px-7 text-base font-bold text-bg shadow-xl shadow-gold/20 transition hover:brightness-110 active:scale-[0.98]"
            >
              <IconCrown width={20} height={20} /> PREMIUM сотиб олиш
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
