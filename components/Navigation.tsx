"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArchive, IconHome, IconImage, IconRadio, IconUser, Equalizer } from "./icons";
import { usePlayer } from "./player/PlayerProvider";
import { useSiteData } from "./SiteData";

export const NAV = [
  { href: "/", label: "Бош саҳифа", icon: IconHome },
  { href: "/fm-radio", label: "FM Радио", icon: IconRadio },
  { href: "/arxiv", label: "Архив", icon: IconArchive },
  { href: "/haqida", label: "Мен ҳақимда", icon: IconUser },
  { href: "/media", label: "Медиа", icon: IconImage },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function SiteHeader({ name }: { name: string }) {
  const path = usePathname();
  const { track, status, playLive, toggle } = usePlayer();
  const { hasStream, liveFallback } = useSiteData();
  const liveOn = track?.kind === "live" && status === "playing";
  const liveBtn =
    "ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-live/15 px-4 text-sm font-semibold text-live transition hover:bg-live/25 md:ml-0";

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold" aria-label="Севинчим — бош саҳифа">
          <img src="/icons/icon.svg" alt="" width={36} height={36} className="rounded-xl" />
          <span className="max-[359px]:sr-only">Севинчим</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Асосий меню">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[15px] font-medium transition-colors ${
                  active ? "bg-white/10 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {hasStream ? (
          <button
            type="button"
            onClick={() => (track?.kind === "live" ? toggle() : playLive())}
            className={liveBtn}
            aria-pressed={liveOn}
          >
            {liveOn ? <Equalizer /> : <span className="size-2 rounded-full bg-live animate-pulse-dot" />}
            Жонли эфир
          </button>
        ) : liveFallback ? (
          // Расмий оқим уланмагунча — жонли эфир ташқи платформада
          <a href={liveFallback.url} target="_blank" rel="noopener noreferrer" className={liveBtn}>
            <span className="size-2 rounded-full bg-live animate-pulse-dot" />
            Жонли эфир
            <span className="sr-only"> ({liveFallback.label}, янги ойнада)</span>
          </a>
        ) : (
          <Link href="/fm-radio" className={liveBtn}>
            <span className="size-2 rounded-full bg-live animate-pulse-dot" />
            Жонли эфир
          </Link>
        )}
      </div>
    </header>
  );
}

export function BottomTabBar() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-surface/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "var(--safe-b)" }}
      aria-label="Пастки меню"
    >
      <ul className="grid h-[var(--tabbar-h)] grid-cols-5">
        {NAV.map((n) => {
          const active = isActive(path, n.href);
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-12 min-w-12 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none transition-colors ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-brand/15" : ""}`}>
                  <Icon width={22} height={22} />
                </span>
                <span className="whitespace-nowrap">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter({ name, socials }: { name: string; socials: { label: string; url: string }[] }) {
  return (
    <footer className="mx-auto mt-8 hidden max-w-6xl border-t border-white/5 px-4 py-8 text-sm text-muted md:flex md:items-center md:justify-between">
      <p>© {new Date().getFullYear()} {name} • sevinchim.uz</p>
      <ul className="flex gap-5">
        {socials.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink">{s.label}</a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
