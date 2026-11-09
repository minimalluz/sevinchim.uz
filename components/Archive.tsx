"use client";

import { useEffect, useMemo, useState } from "react";
import type { Episode } from "@/lib/types";
import { MONTHS_CAP, formatDate, formatDuration } from "@/lib/format";
import { usePlayer } from "./player/PlayerProvider";
import { RateSelector, SeekBar, SkipButton, PlayPauseButton, Spinner } from "./player/Controls";
import { Equalizer, IconCalendar, IconClock, IconPause, IconPlay } from "./icons";

const RUBRIC_COLORS = ["#ff6a3d", "#e0457b", "#a78bfa", "#3ed6a6", "#ffb547", "#5fb4ff"];
export const rubricColor = (rubric: string, all: string[]) =>
  RUBRIC_COLORS[Math.max(0, all.indexOf(rubric)) % RUBRIC_COLORS.length];

export function EpisodeCard({ ep, rubrics }: { ep: Episode; rubrics: string[] }) {
  const { playEpisode, toggle, isCurrent, status, currentTime, duration } = usePlayer();
  const current = isCurrent(ep.id);
  const playing = current && status === "playing";
  const loading = current && status === "loading";
  const color = rubricColor(ep.rubric, rubrics);
  const pct = current && duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <article
      id={`ep-${ep.id}`}
      className={`group relative flex gap-4 rounded-[var(--radius-card)] border p-4 transition ${
        current ? "border-brand/50 bg-brand/[0.07]" : "border-white/5 bg-surface hover:border-white/15"
      }`}
    >
      <button
        type="button"
        onClick={() => (current ? toggle() : playEpisode(ep))}
        aria-label={playing ? `Пауза: ${ep.title}` : `Тинглаш: ${ep.title}`}
        className="relative grid size-14 shrink-0 place-items-center rounded-2xl text-white transition active:scale-95"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
      >
        {loading ? <Spinner className="size-5 border-2" /> : playing ? <IconPause width={22} height={22} /> : <IconPlay width={22} height={22} className="translate-x-px" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs font-semibold" style={{ color }}>
          {ep.rubric}
          {playing && <Equalizer className="h-3" />}
        </p>
        <h3 className="mt-1 font-semibold leading-snug">{ep.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{ep.description}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><IconCalendar width={14} height={14} />{formatDate(ep.date)}</span>
          <span className="inline-flex items-center gap-1"><IconClock width={14} height={14} />{formatDuration(ep.duration)}</span>
        </p>
        {current && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

/** Архивда жорий эшиттириш учун тўлиқ бошқарув (±15 сония, тезлик) */
function NowPlayingPanel() {
  const { track } = usePlayer();
  if (track?.kind !== "episode") return null;
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-brand/30 bg-gradient-to-br from-brand/15 to-surface p-5" aria-label="Ҳозир тингланмоқда">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Ҳозир тингланмоқда</p>
      <h2 className="mt-1 font-display text-lg font-bold leading-snug">{track.title}</h2>
      <div className="mt-3"><SeekBar /></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SkipButton delta={-15} />
          <PlayPauseButton size="md" />
          <SkipButton delta={15} />
        </div>
        <RateSelector />
      </div>
    </section>
  );
}

type Sort = "new" | "old";

export function ArchiveBrowser({ episodes, rubrics }: { episodes: Episode[]; rubrics: string[] }) {
  const [rubric, setRubric] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("new");

  // Филтрни URL орқали ҳам улашиш мумкин: /arxiv?rukn=…&oy=2026-11
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("rukn");
    const m = q.get("oy");
    if (r && rubrics.includes(r)) setRubric(r);
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, [rubrics]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (rubric !== "all") q.set("rukn", rubric);
    if (month !== "all") q.set("oy", month);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [rubric, month]);

  const months = useMemo(() => {
    const set = new Set(episodes.map((e) => e.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [episodes]);

  const list = useMemo(() => {
    const out = episodes.filter(
      (e) => (rubric === "all" || e.rubric === rubric) && (month === "all" || e.date.startsWith(month)),
    );
    out.sort((a, b) => (sort === "new" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return out;
  }, [episodes, rubric, month, sort]);

  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${MONTHS_CAP[mm - 1]} ${y}`;
  };

  const chip = (on: boolean) =>
    `min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
      on ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"
    }`;

  return (
    <div>
      <NowPlayingPanel />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Рукн бўйича саралаш">
        <button type="button" className={chip(rubric === "all")} aria-pressed={rubric === "all"} onClick={() => setRubric("all")}>
          Барчаси
        </button>
        {rubrics.map((r) => (
          <button key={r} type="button" className={chip(rubric === r)} aria-pressed={rubric === r} onClick={() => setRubric(r)}>
            {r}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Сана бўйича саралаш</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="min-h-12 w-full appearance-none rounded-2xl border border-white/8 bg-surface px-4 pr-10 text-sm font-medium text-ink"
          >
            <option value="all">Барча саналар</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>▾</span>
        </label>
        <label className="relative">
          <span className="sr-only">Тартиб</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-h-12 appearance-none rounded-2xl border border-white/8 bg-surface px-4 pr-10 text-sm font-medium text-ink"
          >
            <option value="new">Аввал янгилари</option>
            <option value="old">Аввал эскилари</option>
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>▾</span>
        </label>
      </div>

      <h2 className="sr-only">Эшиттиришлар рўйхати</h2>
      <p className="mt-5 mb-3 text-sm text-muted" aria-live="polite">{list.length} та эшиттириш</p>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-muted">Танланган шартлар бўйича эшиттириш топилмади.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((ep) => <EpisodeCard key={ep.id} ep={ep} rubrics={rubrics} />)}
        </div>
      )}
    </div>
  );
}
