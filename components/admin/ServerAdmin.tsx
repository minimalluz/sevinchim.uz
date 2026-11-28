"use client";

import { useCallback, useEffect, useState } from "react";
import { serverStatusAction } from "@/app/admin/users-actions";

type Data = Awaited<ReturnType<typeof serverStatusAction>>;

const box = "rounded-[var(--radius-card)] border border-white/8 bg-surface p-5";
const TZ = 5 * 3600e3;
const p2 = (n: number) => String(n).padStart(2, "0");
const dt = (ms: number | null | undefined) => {
  if (!ms) return "—";
  const d = new Date(ms + TZ);
  return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} ГБ` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(0)} МБ` : `${Math.round(b / 1024)} КБ`);
const ago = (ms: number, now: number) => {
  const m = Math.round((now - ms) / 60e3);
  if (m < 1) return "ҳозиргина";
  if (m < 60) return `${m} дақиқа олдин`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} соат олдин`;
  return `${Math.floor(h / 24)} кун олдин`;
};
const dur = (sec: number) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d} кун ${h} соат` : `${h} соат ${Math.floor((sec % 3600) / 60)} дақ.`;
};

const STATES: Record<string, { label: string; cls: string }> = {
  done: { label: "✓ Янгиланди", cls: "text-mint" },
  building: { label: "⏳ Йиғилмоқда", cls: "text-gold" },
  waiting: { label: "⏸ Эфир ёзуви тугашини кутяпти", cls: "text-gold" },
  deploying: { label: "⏳ Ишга туширилмоқда", cls: "text-gold" },
  failed: { label: "✕ Йиғишда хато", cls: "text-live" },
  "rolled-back": { label: "✕ Ишга тушмади — олдинги версия тикланди", cls: "text-live" },
  deferred: { label: "⏸ Кейинга қолдирилди", cls: "text-gold" },
};

function Meter({ label, used, total, warnAt = 0.85 }: { label: string; used: number; total: number; warnAt?: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">{size(total - used)} бўш / {size(total)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-label={label} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct > warnAt ? "bg-live" : pct > 0.7 ? "bg-gold" : "bg-mint"}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

export function ServerAdmin() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setD(await serverStatusAction());
      setErr(false);
    } catch {
      setErr(true);
    }
    setBusy(false);
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!d) return <div className={`${box} h-60 animate-pulse`}>{err && <p className="text-live">Маълумот олиб бўлмади</p>}</div>;
  const st = d.update.last ? STATES[d.update.last.state] : null;
  const inProgress = d.update.last && ["building", "waiting", "deploying"].includes(d.update.last.state);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`font-semibold ${d.warnings.length ? "text-gold" : "text-mint"}`}>
          {d.warnings.length ? `⚠ ${d.warnings.length} та огоҳлантириш` : "✓ Ҳаммаси жойида"}
        </p>
        <button className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold hover:bg-white/5 disabled:opacity-50" disabled={busy} onClick={() => void load()}>
          {busy ? "Янгиланмоқда…" : "↻ Янгилаш"}
        </button>
      </div>
      {d.warnings.length > 0 && (
        <ul className="grid gap-2">
          {d.warnings.map((w) => <li key={w} className="rounded-2xl bg-gold/10 px-4 py-3 text-sm text-gold">{w}</li>)}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Версия ва янгиланиш */}
        <section className={box} aria-label="Сайт версияси">
          <h2 className="font-display text-lg font-bold">Сайт версияси</h2>
          {d.version ? (
            <p className="mt-2 text-sm">
              <code className="rounded bg-white/10 px-1.5 py-0.5">{d.version.commit}</code> {d.version.message}
              <span className="block text-xs text-muted">{dt(d.version.date)}</span>
            </p>
          ) : <p className="mt-2 text-sm text-muted">Аниқлаб бўлмади</p>}

          <h3 className="mt-4 text-sm font-semibold">Автоматик янгилаш (ҳар 5 дақиқада)</h3>
          <p className="mt-1 text-sm text-muted">
            Охирги текширув: {d.update.checkedAt ? `${ago(d.update.checkedAt, d.now)} (${dt(d.update.checkedAt)})` : "ҳали маълумот йўқ"}
          </p>
          {d.update.last && st && (
            <div className="mt-3 rounded-2xl bg-bg/50 p-3 text-sm">
              <p className={`font-semibold ${st.cls}`}>{st.label}{inProgress ? "…" : ""}</p>
              <p className="mt-1 text-muted">
                <code>{d.update.last.from}</code> → <code>{d.update.last.commit}</code> {d.update.last.msg}
              </p>
              <p className="text-xs text-muted">{dt(d.update.last.at)}</p>
              {(d.update.last.state === "failed" || d.update.last.state === "rolled-back") && d.update.last.text && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-2 text-[11px] text-muted">{d.update.last.text}</pre>
              )}
            </div>
          )}
          {d.update.history.length > 1 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-muted">Янгиланишлар тарихи</summary>
              <ul className="mt-2 grid gap-1">
                {d.update.history.map((h) => (
                  <li key={h.at} className="flex flex-wrap justify-between gap-2 text-xs">
                    <span className={STATES[h.state]?.cls}>{STATES[h.state]?.label ?? h.state} <span className="text-muted">— {h.msg}</span></span>
                    <span className="text-muted tabular-nums">{dt(h.at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Ресурслар */}
        <section className={box} aria-label="Сервер ресурслари">
          <h2 className="font-display text-lg font-bold">Сервер</h2>
          <div className="mt-3 grid gap-4">
            {d.disk && <Meter label="Диск" used={d.disk.total - d.disk.free} total={d.disk.total} warnAt={0.9} />}
            <Meter label="Оператив хотира" used={d.memory.total - d.memory.available} total={d.memory.total} warnAt={0.92} />
            {d.memory.swapTotal > 0 && <Meter label="Swap" used={d.memory.swapTotal - d.memory.swapFree} total={d.memory.swapTotal} warnAt={0.8} />}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-muted">Юклама (1/5/15 дақ.)</dt><dd className="font-semibold tabular-nums">{d.load.map((x) => x.toFixed(2)).join(" / ")} <span className="text-xs text-muted">({d.cpus} CPU)</span></dd></div>
            <div><dt className="text-muted">Сервер ишлаяпти</dt><dd className="font-semibold">{dur(d.uptime)}</dd></div>
            <div><dt className="text-muted">Сайт ишлаяпти</dt><dd className="font-semibold">{dur(d.appUptime)}</dd></div>
            <div><dt className="text-muted">Node.js</dt><dd className="font-semibold">{d.node}</dd></div>
            {d.cert && (
              <div className="col-span-2"><dt className="text-muted">HTTPS сертификати</dt><dd className="font-semibold">{dt(d.cert.validTo)} гача <span className="text-xs text-muted">({d.cert.issuer}, ўзи янгиланади)</span></dd></div>
            )}
          </dl>
        </section>

        {/* Маълумотлар ҳажми */}
        <section className={box} aria-label="Маълумотлар">
          <h2 className="font-display text-lg font-bold">Маълумотлар ҳажми</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-muted">Архив ва PREMIUM аудио</dt><dd className="font-semibold">{size(d.sizes.audio)}</dd></div>
            <div><dt className="text-muted">FM90 ёзувлари</dt><dd className="font-semibold">{size(d.sizes.fm90)}</dd></div>
            <div><dt className="text-muted">Тўлов чеклари</dt><dd className="font-semibold">{size(d.sizes.receipts)}</dd></div>
            <div><dt className="text-muted">Фойдаланувчилар базаси</dt><dd className="font-semibold">{size(d.sizes.database)}</dd></div>
          </dl>
        </section>

        {/* Эфир ёзиш */}
        <section className={box} aria-label="Эфир ёзиш">
          <h2 className="font-display text-lg font-bold">Эфир ёзиш</h2>
          <ul className="mt-3 grid gap-3 text-sm">
            {d.recording.map((r) => (
              <li key={r.name} className="rounded-2xl bg-bg/50 p-3">
                <p className="font-semibold">
                  {r.name}:{" "}
                  {r.active ? <span className="text-live">● ёзилмоқда ({size(r.bytes)}, {dt(r.startedAt)} дан)</span> : r.finalizing ? <span className="text-gold">сақланмоқда…</span> : <span className="text-muted">ёзув кетмаяпти</span>}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Автоматик ёзиш: {r.auto ? `ёқилган${r.next ? ` • кейингиси: ${r.next}` : ""}` : "ўчиқ"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Эфир ёзилаётганда сайт янгиланмайди — ёзув тугашини кутади.</p>
        </section>
      </div>
    </div>
  );
}
