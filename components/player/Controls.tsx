"use client";

import { formatTime } from "@/lib/format";
import { IconBack15, IconFwd15, IconPause, IconPlay } from "../icons";
import { usePlayer } from "./PlayerProvider";

export const RATES = [1, 1.25, 1.5];

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-6 animate-spin rounded-full border-[3px] border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

/** Катта ёки кичик ижро/пауза тугмаси — жорий трекни бошқаради */
export function PlayPauseButton({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const { status, toggle } = usePlayer();
  const playing = status === "playing";
  const loading = status === "loading";
  const dims = size === "lg" ? "size-20" : size === "md" ? "size-14" : "size-12";
  const icon = size === "lg" ? 34 : 24;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing || loading ? "Пауза" : "Ижро этиш"}
      className={`grid shrink-0 place-items-center rounded-full bg-ink text-bg shadow-lg transition active:scale-95 ${dims} ${className}`}
    >
      {loading ? <Spinner /> : playing ? <IconPause width={icon} height={icon} /> : <IconPlay width={icon} height={icon} className="translate-x-[2px]" />}
    </button>
  );
}

export function SeekBar() {
  const { currentTime, duration, seek } = usePlayer();
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div>
      <input
        type="range"
        className="seek"
        min={0}
        max={duration || 0}
        step={1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Эшиттириш вақти"
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
        style={{ ["--p" as string]: `${pct}%` }}
      />
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
        <span>{formatTime(currentTime)}</span>
        <span>−{formatTime(Math.max(0, duration - currentTime))}</span>
      </div>
    </div>
  );
}

export function SkipButton({ delta }: { delta: 15 | -15 }) {
  const { skip } = usePlayer();
  const Icon = delta < 0 ? IconBack15 : IconFwd15;
  return (
    <button
      type="button"
      onClick={() => skip(delta)}
      className="grid size-12 place-items-center rounded-full text-ink transition hover:bg-white/10 active:scale-95"
      aria-label={delta < 0 ? "15 сония орқага" : "15 сония олдинга"}
    >
      <Icon width={30} height={30} />
    </button>
  );
}

export function RateSelector() {
  const { rate, setRate } = usePlayer();
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Тинглаш тезлиги">
      {RATES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRate(r)}
          aria-pressed={rate === r}
          className={`min-h-11 min-w-14 rounded-full px-3 text-sm font-semibold tabular-nums transition ${
            rate === r ? "bg-ink text-bg" : "bg-white/8 text-muted hover:text-ink"
          }`}
        >
          {String(r).replace(".", ",")}x
        </button>
      ))}
    </div>
  );
}

export function QualitySelector() {
  const { qualities, quality, setQuality } = usePlayer();
  if (qualities.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Овоз сифати" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${qualities.length}, minmax(0, 1fr))` }}>
      {qualities.map((q) => {
        const on = q.id === quality;
        return (
          <button
            key={q.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setQuality(q.id)}
            className={`min-h-12 rounded-2xl border px-3 py-2 text-left transition ${
              on ? "border-brand bg-brand/10" : "border-line bg-surface hover:border-white/20"
            }`}
          >
            <span className="block text-sm font-semibold">{q.label}</span>
            <span className="block text-xs text-muted">{q.bitrate}</span>
          </button>
        );
      })}
    </div>
  );
}
