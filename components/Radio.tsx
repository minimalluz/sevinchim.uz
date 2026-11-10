"use client";

import { useEffect, useState } from "react";
import type { Weekday } from "@/lib/types";
import { WEEKDAYS, WEEKDAYS_SHORT, slotsForDay, tashkentNow } from "@/lib/format";
import { usePlayer } from "./player/PlayerProvider";
import { PlayPauseButton, QualitySelector, Spinner } from "./player/Controls";
import { Equalizer, IconExternal, IconPause, IconPlay } from "./icons";
import { useOnAir, useSiteData } from "./SiteData";

/** «FM Радиони тинглаш» тезкор тугмаси */
export function ListenLiveButton({ className = "" }: { className?: string }) {
  const { track, status, playLive, toggle } = usePlayer();
  const { hasStream, liveFallback } = useSiteData();
  const isLive = track?.kind === "live";
  const playing = isLive && status === "playing";
  const loading = isLive && status === "loading";
  const cls = `group inline-flex min-h-14 items-center gap-3 rounded-full bg-brand-gradient py-2 pl-2 pr-6 text-base font-semibold text-white shadow-xl shadow-brand/25 transition hover:brightness-110 active:scale-[0.98] ${className}`;

  // Расмий оқим уланмагунча — эфир ташқи платформада (янги ойнада)
  if (!hasStream && liveFallback) {
    return (
      <a href={liveFallback.url} target="_blank" rel="noopener noreferrer" className={cls}>
        <span className="grid size-10 place-items-center rounded-full bg-white text-brand">
          <IconPlay width={20} height={20} className="translate-x-px" />
        </span>
        FM Радиони тинглаш
        <IconExternal width={16} height={16} className="opacity-80" />
        <span className="sr-only">({liveFallback.label}, янги ойнада)</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (isLive ? toggle() : playLive())}
      className={cls}
    >
      <span className="grid size-10 place-items-center rounded-full bg-white text-brand">
        {loading ? <Spinner className="size-5 border-2" /> : playing ? <IconPause width={20} height={20} /> : <IconPlay width={20} height={20} className="translate-x-px" />}
      </span>
      {playing ? "Эфирни тўхтатиш" : "FM Радиони тинглаш"}
    </button>
  );
}

/** «Ҳозир эфирда» ва навбатдаги дастур */
export function NowOnAirCard({ compact = false }: { compact?: boolean }) {
  const air = useOnAir();
  const { station, frequency } = useSiteData();
  const { track, status } = usePlayer();
  const listening = track?.kind === "live" && status === "playing";

  return (
    <div className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-live">
          <span className="size-2 rounded-full bg-live animate-pulse-dot" />
          Ҳозир эфирда
        </span>
        <span className="text-xs text-muted">{station} • {frequency}</span>
      </div>

      {air === null ? (
        <div className="mt-3 h-14 animate-pulse rounded-xl bg-white/5" />
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2 font-display text-xl font-bold leading-snug">
            {air.current?.title ?? "Мусиқий эфир"}
            {listening && <Equalizer className="text-brand" />}
          </p>
          {air.current ? (
            <>
              <p className="mt-1 text-sm text-muted">
                {air.current.start} — {air.current.end}
                {air.current.own && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">Муаллифлик дастури</span>}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(air.progress * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Радиостанциянинг мусиқий эфири</p>
          )}
          {!compact && air.next && (
            <p className="mt-4 border-t border-white/8 pt-4 text-sm text-muted">
              Кейинги: <span className="font-semibold text-ink">{air.next.title}</span>
              {" "}• {air.next.day !== tashkentNow().day ? `${WEEKDAYS[air.next.day]}, ` : ""}{air.next.start}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** /fm-radio саҳифасидаги катта жонли эфир плеери */
export function LivePlayerHero() {
  const { track, status, error, playLive, qualities } = usePlayer();
  const { name, station, frequency, hasStream, liveFallback } = useSiteData();
  const air = useOnAir();
  const isLive = track?.kind === "live";
  const playing = isLive && status === "playing";

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-gradient-to-br from-[#3a1830] via-surface to-surface p-6 sm:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-live/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-live">
          <span className="size-2 rounded-full bg-live animate-pulse-dot" /> Жонли эфир
        </span>
        <p className="mt-4 font-display text-4xl font-extrabold sm:text-5xl">{frequency}</p>
        <p className="mt-1 text-muted">{station} • бошловчи {name}</p>

        <div className="relative my-10 grid size-40 place-items-center">
          {playing && (
            <>
              <span className="absolute inset-0 rounded-full border-2 border-brand/50 animate-ring" />
              <span className="absolute inset-0 rounded-full border-2 border-brand/50 animate-ring [animation-delay:-1.2s]" />
            </>
          )}
          <span className="absolute inset-3 rounded-full bg-brand-gradient opacity-90 blur-[2px]" aria-hidden />
          {!hasStream && liveFallback ? (
            <a
              href={liveFallback.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Жонли эфирни ${liveFallback.label}'да тинглаш (янги ойнада)`}
              className="relative grid size-28 place-items-center rounded-full bg-white text-bg shadow-xl transition active:scale-95"
            >
              <IconPlay width={40} height={40} className="translate-x-1" />
            </a>
          ) : isLive ? (
            <PlayPauseButton size="lg" className="relative size-28 bg-white" />
          ) : (
            <button
              type="button"
              onClick={playLive}
              aria-label="Жонли эфирни тинглаш"
              className="relative grid size-28 place-items-center rounded-full bg-white text-bg shadow-xl transition active:scale-95"
            >
              <IconPlay width={40} height={40} className="translate-x-1" />
            </button>
          )}
        </div>

        {!hasStream ? (
          liveFallback ? (
            <>
              <p className="font-display text-lg font-bold">Тинглаш учун босинг</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Жонли эфир ҳозирча <b className="text-ink">{liveFallback.label}</b> платформасида, янги ойнада очилади.
              </p>
            </>
          ) : (
            <p className="max-w-sm text-sm text-muted">Онлайн эфир тез орада уланади. Ҳозирча радиони {frequency} тўлқинида тингланг.</p>
          )
        ) : (
          <>
            <p className="font-display text-lg font-bold" aria-live="polite">
              {playing ? air?.current?.title ?? "Эфирдасиз" : status === "loading" && isLive ? "Уланмоқда…" : "Тинглаш учун босинг"}
            </p>
            {isLive && error && (
              <p className="mt-2 max-w-sm text-sm text-live" role="status">
                {error}
                {liveFallback && (
                  <>
                    {" "}
                    <a href={liveFallback.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
                      {liveFallback.label}'да тинглаш
                    </a>
                  </>
                )}
              </p>
            )}
          </>
        )}

        {hasStream && qualities.length > 1 && (
          <div className="mt-8 w-full max-w-md text-left">
            <p className="mb-2 text-sm font-semibold text-muted">Овоз сифати</p>
            <QualitySelector />
            <p className="mt-2 text-xs text-muted">Мобил интернетда трафикни тежаш учун «Тежамкор» сифатни танланг.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** Ҳафталик эфир сеткаси */
export function ScheduleGrid() {
  const { schedule } = useSiteData();
  const air = useOnAir();
  const [day, setDay] = useState<Weekday>(1);
  const [today, setToday] = useState<Weekday | null>(null);

  useEffect(() => {
    const d = tashkentNow().day;
    setDay(d);
    setToday(d);
  }, []);

  const slots = slotsForDay(schedule, day);
  const days = [1, 2, 3, 4, 5, 6, 7] as Weekday[];

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Ҳафта куни">
        {days.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={`flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${
              d === day ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"
            }`}
          >
            <span>{WEEKDAYS_SHORT[d]}</span>
            {d === today && <span className={`mt-0.5 text-[10px] ${d === day ? "text-[#b4361a]" : "text-brand"}`}>бугун</span>}
          </button>
        ))}
      </div>

      <h3 className="mt-6 mb-3 font-display text-lg font-bold">{WEEKDAYS[day]}</h3>
      {slots.length === 0 ? (
        <p className="rounded-2xl bg-surface p-5 text-muted">Бу кунда махсус дастурлар йўқ — кун бўйи мусиқий эфир.</p>
      ) : (
        <ol className="grid gap-2">
          {slots.map((s) => {
            const now = air?.current?.id === s.id;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-4 rounded-2xl border p-4 ${
                  now ? "border-brand/60 bg-brand/10" : "border-white/5 bg-surface"
                }`}
              >
                <span className="w-28 shrink-0 whitespace-nowrap font-semibold tabular-nums text-muted">{s.start}–{s.end}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  {s.own && <span className="text-xs font-semibold text-gold">Муаллифлик дастури</span>}
                </span>
                {now && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[11px] font-bold text-white">
                    <span className="size-1.5 rounded-full bg-white animate-pulse-dot" /> ЭФИРДА
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
