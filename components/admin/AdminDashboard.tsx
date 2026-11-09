"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import type { Announcement, Episode, ScheduleSlot, SiteContent, StreamQuality, Weekday } from "@/lib/types";
import { WEEKDAYS, formatDate, formatDuration } from "@/lib/format";
import { UPLOAD_CHUNK } from "@/lib/audio";
import {
  addEpisode, deleteEpisode, logout, saveAnnouncements, saveSchedule, saveStreams, updateEpisode,
  type ActionResult,
} from "@/app/admin/actions";

/* ---------- Умумий элементлар ---------- */
const input =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px] text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none";
const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-50";
const btnPrimary = `${btn} bg-brand-gradient text-white`;
const btnGhost = `${btn} border border-line text-ink hover:bg-white/5`;
const btnDanger = `${btn} text-live hover:bg-live/10`;

const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const tmpId = () => "new-" + Math.random().toString(36).slice(2, 8);

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function useSaver() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) after?.();
      setTimeout(() => setResult(null), 4000);
    });
  const status = result && (
    <span role="status" className={`text-sm font-semibold ${result.ok ? "text-mint" : "text-live"}`}>
      {result.ok ? `✓ ${result.message ?? "Сақланди"}` : result.error}
    </span>
  );
  return { pending, run, status };
}

/* ---------- Асосий панел ---------- */
const TABS = [
  { id: "archive", label: "Архив" },
  { id: "schedule", label: "Эфир жадвали" },
  { id: "stream", label: "FM оқим" },
  { id: "news", label: "Анонслар" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AdminDashboard({ content }: { content: SiteContent }) {
  const [tab, setTab] = useState<Tab>("archive");
  return (
    <div className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold md:text-3xl">Бошқарув панели</h1>
        <form action={logout}><button className={btnGhost}>Чиқиш</button></form>
      </div>

      <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-semibold ${tab === t.id ? "bg-ink text-bg" : "bg-surface text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "archive" && <ArchiveAdmin episodes={content.episodes} rubrics={content.rubrics} />}
        {tab === "schedule" && <ScheduleAdmin initial={content.schedule} />}
        {tab === "stream" && <StreamAdmin initial={content.streams} />}
        {tab === "news" && <NewsAdmin initial={content.announcements} />}
      </div>
    </div>
  );
}

/* ---------- Архив: янги аудио юклаш ва таҳрирлаш ---------- */
function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(url); };
    a.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    a.src = url;
  });
}

type ChunkReply = { uploadId?: string; received?: number; url?: string; error?: string };

/** Битта бўлакни юбориш (юклаш жараёнини кўрсатиш учун XHR) */
function sendChunk(file: File, offset: number, uploadId: string, onLoaded: (n: number) => void) {
  return new Promise<ChunkReply>((resolve, reject) => {
    const blob = file.slice(offset, Math.min(offset + UPLOAD_CHUNK, file.size));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/admin/upload");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-File-Size", String(file.size));
    xhr.setRequestHeader("X-Upload-Offset", String(offset));
    if (uploadId) xhr.setRequestHeader("X-Upload-Id", uploadId);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      let data: ChunkReply = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* бўш жавоб */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else if (xhr.status === 409 && typeof data.received === "number") resolve(data);
      else reject(Object.assign(new Error(data.error || `Юклашда хатолик (${xhr.status})`), { fatal: xhr.status < 500 }));
    };
    xhr.onerror = () => reject(Object.assign(new Error("Тармоқ хатолиги"), { fatal: false }));
    xhr.send(blob);
  });
}

/**
 * Файлни 50 МБ лик бўлакларда юклаш. Тармоқ узилса, ўша бўлакдан
 * бошлаб 3 мартагача қайта уринади. Охирида аудио манзилини қайтаради.
 */
async function uploadFile(file: File, onProgress: (p: number) => void) {
  let offset = 0;
  let uploadId = "";
  let retries = 0;
  while (true) {
    try {
      const r = await sendChunk(file, offset, uploadId, (n) => onProgress((offset + n) / file.size));
      if (r.url) {
        onProgress(1);
        return r.url;
      }
      if (r.uploadId) uploadId = r.uploadId;
      if (typeof r.received !== "number") throw Object.assign(new Error("Сервер жавоби нотўғри"), { fatal: true });
      offset = r.received;
      retries = 0;
      onProgress(offset / file.size);
    } catch (e) {
      const fatal = (e as { fatal?: boolean }).fatal;
      if (fatal || retries >= 3 || offset === 0 && !uploadId) throw e;
      retries += 1;
      await new Promise((res) => setTimeout(res, 2000 * retries));
    }
  }
}

function EpisodeFields({ value, onChange, rubrics }: { value: Partial<Episode>; onChange: (v: Partial<Episode>) => void; rubrics: string[] }) {
  const [customRubric, setCustomRubric] = useState(false);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Эшиттириш номи" className="md:col-span-2">
        <input className={input} value={value.title ?? ""} onChange={(e) => onChange({ ...value, title: e.target.value })} required maxLength={200} />
      </Field>
      <Field label="Рукн">
        {customRubric ? (
          <input className={input} value={value.rubric ?? ""} placeholder="Янги рукн номи" onChange={(e) => onChange({ ...value, rubric: e.target.value })} />
        ) : (
          <select
            className={input}
            value={value.rubric ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") { setCustomRubric(true); onChange({ ...value, rubric: "" }); }
              else onChange({ ...value, rubric: e.target.value });
            }}
          >
            <option value="" disabled>Танланг…</option>
            {rubrics.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="__new">+ Янги рукн</option>
          </select>
        )}
      </Field>
      <Field label="Эфир санаси">
        <input type="date" className={input} value={value.date ?? ""} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </Field>
      <Field label="Қисқача тавсиф" className="md:col-span-2">
        <textarea className={`${input} min-h-24 py-2`} value={value.description ?? ""} onChange={(e) => onChange({ ...value, description: e.target.value })} maxLength={2000} />
      </Field>
    </div>
  );
}

function ArchiveAdmin({ episodes, rubrics }: { episodes: Episode[]; rubrics: string[] }) {
  const [draft, setDraft] = useState<Partial<Episode>>({ date: today(), rubric: rubrics[0] ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Episode>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const saver = useSaver();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!file) { setUploadError("Аудио файлни танланг"); return; }
    try {
      const duration = await readDuration(file);
      setProgress(0);
      const audio = await uploadFile(file, setProgress);
      saver.run(() => addEpisode({ ...draft, audio, duration }), () => {
        setDraft({ date: today(), rubric: draft.rubric });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-8">
      <form onSubmit={submit} className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
        <h2 className="font-display text-lg font-bold">Янги эшиттириш қўшиш</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Аудио файл (MP3, M4A, AAC, OGG — 1 ГБ гача)">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-ink file:px-4 file:font-semibold file:text-bg"
            />
          </Field>
          <EpisodeFields value={draft} onChange={setDraft} rubrics={rubrics} />
        </div>
        {progress !== null && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">Юкланмоқда: {Math.round(progress * 100)}%</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={btnPrimary} disabled={progress !== null || saver.pending}>
            {progress !== null ? "Юкланмоқда…" : "Юклаш ва чоп этиш"}
          </button>
          {uploadError && <span className="text-sm font-semibold text-live" role="alert">{uploadError}</span>}
          {saver.status}
        </div>
      </form>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Барча эшиттиришлар ({episodes.length})</h2>
        <ul className="grid gap-2">
          {episodes.map((ep) => (
            <li key={ep.id} className="rounded-2xl border border-white/5 bg-surface p-4">
              {editing === ep.id ? (
                <div className="grid gap-3">
                  <EpisodeFields value={editDraft} onChange={setEditDraft} rubrics={rubrics} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={btnPrimary}
                      disabled={saver.pending}
                      onClick={() => saver.run(() => updateEpisode(ep.id, editDraft), () => setEditing(null))}
                    >
                      Сақлаш
                    </button>
                    <button className={btnGhost} onClick={() => setEditing(null)}>Бекор қилиш</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{ep.title}</p>
                    <p className="text-xs text-muted">{ep.rubric} • {formatDate(ep.date)} • {formatDuration(ep.duration)}</p>
                  </div>
                  <audio controls preload="none" src={ep.audio} className="h-10 w-full max-w-xs" />
                  <button className={btnGhost} onClick={() => { setEditing(ep.id); setEditDraft(ep); }}>Таҳрирлаш</button>
                  <button
                    className={btnDanger}
                    disabled={saver.pending}
                    onClick={() => confirm(`«${ep.title}» ўчирилсинми?`) && saver.run(() => deleteEpisode(ep.id))}
                  >
                    Ўчириш
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- Эфир жадвали ---------- */
function ScheduleAdmin({ initial }: { initial: ScheduleSlot[] }) {
  const [rows, setRows] = useState<ScheduleSlot[]>(() =>
    [...initial].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
  );
  const saver = useSaver();
  const set = (i: number, patch: Partial<ScheduleSlot>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
      <h2 className="font-display text-lg font-bold">Ҳафталик эфир жадвали</h2>
      <p className="mt-1 text-sm text-muted">Вақтлар Тошкент вақти бўйича. «Муаллифлик» белгиси сайтда алоҳида ажратиб кўрсатилади.</p>
      <ul className="mt-4 grid gap-2">
        {rows.map((s, i) => (
          <li key={s.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-bg/60 p-3 md:grid-cols-[9rem_6.5rem_6.5rem_1fr_auto_auto] md:items-end">
            <Field label="Кун">
              <select className={input} value={s.day} onChange={(e) => set(i, { day: Number(e.target.value) as Weekday })}>
                {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2 md:contents">
              <Field label="Бошланиши"><input type="time" className={input} value={s.start} onChange={(e) => set(i, { start: e.target.value })} /></Field>
              <Field label="Тугаши"><input type="time" className={input} value={s.end} onChange={(e) => set(i, { end: e.target.value })} /></Field>
            </div>
            <Field label="Дастур номи" className="col-span-2 md:col-span-1">
              <input className={input} value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={s.own} onChange={(e) => set(i, { own: e.target.checked })} />
              Муаллифлик
            </label>
            <button className={btnDanger} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Ўчириш</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={() => setRows((r) => [...r, { id: tmpId(), day: 1, start: "09:00", end: "10:00", title: "", own: true }])}>
          + Дастур қўшиш
        </button>
        <button
          className={btnPrimary}
          disabled={saver.pending}
          onClick={() => saver.run(() => saveSchedule(rows.map((r) => (r.id.startsWith("new-") ? { ...r, id: "" } : r))))}
        >
          Жадвални сақлаш
        </button>
        {saver.status}
      </div>
    </section>
  );
}

/* ---------- FM радио оқими ---------- */
function StreamAdmin({ initial }: { initial: StreamQuality[] }) {
  const [rows, setRows] = useState<StreamQuality[]>(initial);
  const saver = useSaver();
  const set = (i: number, patch: Partial<StreamQuality>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
      <h2 className="font-display text-lg font-bold">FM радио оқими ҳаволалари</h2>
      <p className="mt-1 text-sm text-muted">
        Icecast/Shoutcast (MP3/AAC) ёки HLS (.m3u8) манзилини киритинг. Биринчи қатор — асосий сифат. Сайт HTTPS'да бўлгани учун оқим манзили ҳам <b>https://</b> бўлиши керак.
      </p>
      <ul className="mt-4 grid gap-2">
        {rows.map((s, i) => (
          <li key={s.id} className="grid gap-2 rounded-2xl bg-bg/60 p-3 md:grid-cols-[10rem_7rem_1fr_auto] md:items-end">
            <Field label="Номи"><input className={input} value={s.label} onChange={(e) => set(i, { label: e.target.value })} /></Field>
            <Field label="Битрейт"><input className={input} value={s.bitrate} onChange={(e) => set(i, { bitrate: e.target.value })} /></Field>
            <Field label="Оқим манзили (URL)">
              <input className={input} type="url" inputMode="url" value={s.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://…" />
            </Field>
            <button className={btnDanger} disabled={rows.length < 2} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Ўчириш</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={() => setRows((r) => [...r, { id: tmpId(), label: "", bitrate: "", url: "" }])}>+ Сифат қўшиш</button>
        <button className={btnPrimary} disabled={saver.pending} onClick={() => saver.run(() => saveStreams(rows))}>Сақлаш</button>
        {saver.status}
      </div>
    </section>
  );
}

/* ---------- Анонслар ---------- */
function NewsAdmin({ initial }: { initial: Announcement[] }) {
  const [rows, setRows] = useState<Announcement[]>(initial);
  const saver = useSaver();
  const set = (i: number, patch: Partial<Announcement>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section className="rounded-[var(--radius-card)] border border-white/8 bg-surface p-5">
      <h2 className="font-display text-lg font-bold">Дастурлар анонси</h2>
      <ul className="mt-4 grid gap-2">
        {rows.map((a, i) => (
          <li key={a.id} className="grid gap-2 rounded-2xl bg-bg/60 p-3 md:grid-cols-[1fr_10rem]">
            <Field label="Сарлавҳа"><input className={input} value={a.title} onChange={(e) => set(i, { title: e.target.value })} /></Field>
            <Field label="Сана"><input type="date" className={input} value={a.date} onChange={(e) => set(i, { date: e.target.value })} /></Field>
            <Field label="Матн" className="md:col-span-2">
              <textarea className={`${input} min-h-20 py-2`} value={a.text} onChange={(e) => set(i, { text: e.target.value })} />
            </Field>
            <div><button className={btnDanger} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Ўчириш</button></div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={() => setRows((r) => [{ id: tmpId(), title: "", date: today(), text: "" }, ...r])}>+ Анонс қўшиш</button>
        <button
          className={btnPrimary}
          disabled={saver.pending}
          onClick={() => saver.run(() => saveAnnouncements(rows.map((r) => (r.id.startsWith("new-") ? { ...r, id: "" } : r))))}
        >
          Сақлаш
        </button>
        {saver.status}
      </div>
    </section>
  );
}
