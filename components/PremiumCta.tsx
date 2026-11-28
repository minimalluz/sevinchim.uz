"use client";

import Link from "next/link";
import { IconCrown } from "./icons";
import { useUser } from "./UserProvider";

const TZ = 5 * 3600e3;
const p2 = (n: number) => String(n).padStart(2, "0");
const date = (ms: number) => {
  const d = new Date(ms + TZ);
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

/** Premium саҳифасидаги асосий тугма: ким киргани ва обуна ҳолатига қараб */
export function PremiumCta({ ready: payReady, className = "" }: { ready: boolean; className?: string }) {
  const { user, ready } = useUser();
  const base = "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-bold transition active:scale-[0.98]";
  const gold = `${base} bg-gradient-to-r from-gold to-brand text-bg shadow-xl shadow-gold/20 hover:brightness-110`;

  if (!ready) return <div className={`h-14 w-64 animate-pulse rounded-full bg-white/5 ${className}`} aria-hidden />;

  if (user?.premium && user.premiumUntil) {
    return (
      <div className={className}>
        <p className="font-semibold text-gold">★ Сиз PREMIUM обуначисиз — {date(user.premiumUntil)} гача. Раҳмат!</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/profil/premium" className={gold}><IconCrown width={20} height={20} /> Обунани узайтириш</Link>
          <Link href="/arxiv" className={`${base} border border-white/15 hover:bg-white/5`}>Архивга ўтиш</Link>
        </div>
      </div>
    );
  }

  if (!payReady) {
    return <p className={`text-muted ${className}`}>Premium обуна тез орада очилади.</p>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <Link href={user ? "/profil/premium" : "/profil?tab=register&next=/profil/premium"} className={gold}>
        <IconCrown width={20} height={20} /> PREMIUM сотиб олиш
      </Link>
      {!user && (
        <Link href="/profil?next=/profil/premium" className="min-h-11 px-2 py-3 text-sm font-semibold text-muted hover:text-ink">
          Аккаунтим бор — кириш
        </Link>
      )}
    </div>
  );
}
