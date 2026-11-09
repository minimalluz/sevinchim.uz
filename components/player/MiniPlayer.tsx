"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { PlayPauseButton, QualitySelector, RateSelector, SeekBar, SkipButton } from "./Controls";
import { Equalizer, IconArchive, IconChevronDown, IconClose, IconRadio } from "../icons";
import { useOnAir, useSiteData } from "../SiteData";

function Artwork({ live, playing, large = false }: { live: boolean; playing: boolean; large?: boolean }) {
  const Icon = live ? IconRadio : IconArchive;
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-brand-gradient text-white ${
        large ? "aspect-square w-[min(18rem,34vh)] rounded-[2rem] shadow-2xl shadow-brand/20" : "size-12 rounded-xl"
      }`}
      aria-hidden
    >
      {playing && !large ? <Equalizer className="h-5" /> : <Icon width={large ? 96 : 24} height={large ? 96 : 24} />}
      {large && live && playing && (
        <>
          <span className="absolute inset-[18%] rounded-full border-2 border-white/40 animate-ring" />
          <span className="absolute inset-[18%] rounded-full border-2 border-white/40 animate-ring [animation-delay:-1.2s]" />
        </>
      )}
    </div>
  );
}

/** Экраннинг пастки қисмидаги мини-плеер ва ундан очиладиган тўлиқ плеер */
export function MiniPlayer() {
  const { track, status, error, currentTime, duration, stop } = usePlayer();
  const [open, setOpen] = useState(false);

  if (!track) return null;
  const live = track.kind === "live";
  const playing = status === "playing";
  const pct = !live && duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <div
        className="fixed inset-x-2 z-40 md:inset-x-auto md:left-1/2 md:w-[min(720px,calc(100%-2rem))] md:-translate-x-1/2"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b) + 8px)" }}
        data-miniplayer
      >
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface-2/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center gap-3 p-2 pr-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
              aria-label="Тўлиқ плеерни очиш"
            >
              <Artwork live={live} playing={playing} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {live && <span className="rounded bg-live px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">ЭФИР</span>}
                  <span className="truncate">{track.title}</span>
                </span>
                <span className={`block truncate text-xs ${error ? "text-live" : "text-muted"}`}>
                  {error ?? track.subtitle}
                </span>
              </span>
            </button>
            <PlayPauseButton size="sm" />
            <button
              type="button"
              onClick={stop}
              className="grid size-12 shrink-0 place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-ink"
              aria-label="Плеерни ёпиш"
            >
              <IconClose width={20} height={20} />
            </button>
          </div>
          {!live && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10" aria-hidden>
              <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
      {open && <FullPlayer onClose={() => setOpen(false)} />}
    </>
  );
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { track, status, error } = usePlayer();
  const { name, station, frequency } = useSiteData();
  const air = useOnAir();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!track) return null;
  const live = track.kind === "live";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Плеер"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-gradient-to-b from-[#2a1724] via-bg to-bg"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
        <div className="flex items-center justify-between">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-12 place-items-center rounded-full hover:bg-white/10"
            aria-label="Плеерни йиғиш"
          >
            <IconChevronDown width={28} height={28} />
          </button>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">
            {live ? "Жонли эфир" : "Архив"}
          </span>
          <span className="size-12" />
        </div>

        <div className="mt-4 flex justify-center">
          <Artwork live={live} playing={status === "playing"} large />
        </div>

        <div className="mt-8">
          {live && (
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-live/15 px-3 py-1 text-xs font-bold text-live">
              <span className="size-2 rounded-full bg-live animate-pulse-dot" /> {station} • {frequency}
            </span>
          )}
          <h2 className="font-display text-2xl font-bold leading-tight">
            {live ? air?.current?.title ?? "Жонли эфир" : track.title}
          </h2>
          <p className="mt-1 text-muted">{live ? `Бошловчи: ${name}` : track.subtitle}</p>
          {error && <p className="mt-2 text-sm text-live" role="status">{error}</p>}
        </div>

        {!live ? (
          <>
            <div className="mt-6"><SeekBar /></div>
            <div className="mt-4 flex items-center justify-center gap-6">
              <SkipButton delta={-15} />
              <PlayPauseButton size="lg" />
              <SkipButton delta={15} />
            </div>
            <div className="mt-8 flex flex-col items-center gap-2">
              <span className="text-xs text-muted">Тинглаш тезлиги</span>
              <RateSelector />
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 flex justify-center"><PlayPauseButton size="lg" /></div>
            {air?.next && (
              <p className="mt-6 text-center text-sm text-muted">
                Кейинги: <span className="text-ink">{air.next.title}</span> — {air.next.start}
              </p>
            )}
            <div className="mt-8">
              <p className="mb-2 text-xs text-muted">Овоз сифати</p>
              <QualitySelector />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
