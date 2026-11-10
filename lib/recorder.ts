import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AUDIO_DIR, DATA_DIR, ensureDataDir, getContent, updateContent } from "./content";
import { formatDate } from "./format";

/**
 * Эфирни ёзиб олиш (фақат бошловчининг буйруғи билан).
 *
 * Админ «Ёзишни бошлаш» тугмасини босганда ffmpeg расмий радио оқимини
 * MP3 файлга ёза бошлайди. «Тўхтатиш» босилганда ёки энг кўп вақт
 * (стандарт 3 соат 30 дақиқа) ўтганда ёзув тўхтайди ва архивга
 * ҚОРАЛАМА бўлиб тушади — сайтда кўринмайди, админ текшириб чоп этади.
 *
 * Оқим узилса — 5 сониядан кейин қайта уланади ва янги қисм ёзади;
 * охирида барча қисмлар битта файлга бирлаштирилади. Сервер қайта ишга
 * тушса, ёзилган қисмлар йўқолмайди: қораламага сақланади.
 */

export const RECORD_MAX_SECONDS = Number(process.env.RECORD_MAX_SECONDS) || 3.5 * 3600;
const BITRATE = process.env.RECORD_BITRATE || "128k";
const MIN_FREE_BYTES = 1024 ** 3; // 1 ГБ бўш жой бўлмаса — бошламаймиз
const RETRY_DELAY_MS = 5000;
const STATE_FILE = path.join(DATA_DIR, "recording.json");

type State = {
  id: string;
  rubric: string;
  startedAt: number;
  maxSeconds: number;
  source: string;
  parts: string[];
};

type Runtime = {
  state: State | null;
  child: ChildProcess | null;
  stopping: boolean;
  finalizing: Promise<void> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  reconnects: number;
  lastError: string | null;
  lastDraft: { id: string; title: string } | null;
  recovered: boolean;
  /** Файл охирги марта қачон ўсган — оқим «қотиб» қолганини аниқлаш учун */
  lastBytes: number;
  lastGrowthAt: number;
};

export type RecordingStatus = {
  active: boolean;
  finalizing: boolean;
  rubric?: string;
  startedAt?: number;
  elapsed?: number;
  maxSeconds: number;
  bytes?: number;
  reconnects?: number;
  connected?: boolean;
  lastError: string | null;
  lastDraft: { id: string; title: string } | null;
};

// Битта Node жараёни ичида ягона ҳолат (Next.js модулларни қайта юкласа ҳам сақланади)
const g = globalThis as unknown as { __sevinchimRecorder?: Runtime };
const rt: Runtime = (g.__sevinchimRecorder ??= {
  state: null,
  child: null,
  stopping: false,
  finalizing: null,
  retryTimer: null,
  stopTimer: null,
  reconnects: 0,
  lastError: null,
  lastDraft: null,
  recovered: false,
  lastBytes: 0,
  lastGrowthAt: 0,
});
// Эски версиядан қолган ҳолатда янги майдонлар бўлмаслиги мумкин
rt.lastBytes ??= 0;
rt.lastGrowthAt ??= 0;
const STALL_MS = 8000;

const tashkentDate = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const partPath = (id: string, n: number) => path.join(AUDIO_DIR, `.rec-${id}-${n}.mp3`);
const elapsedSec = (s: State) => (Date.now() - s.startedAt) / 1000;

async function saveState() {
  if (rt.state) await fs.writeFile(STATE_FILE, JSON.stringify(rt.state), "utf8");
  else await fs.unlink(STATE_FILE).catch(() => undefined);
}

async function fileSize(p: string) {
  return (await fs.stat(p).catch(() => null))?.size ?? 0;
}

function run(cmd: string, args: string[]) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ code: -1, out, err: String(e) }));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

/* ---------- Ёзиш жараёни ---------- */

function spawnPart() {
  const s = rt.state;
  if (!s || rt.stopping) return;
  const remaining = s.maxSeconds - elapsedSec(s);
  if (remaining <= 5) {
    void finalize();
    return;
  }

  const file = partPath(s.id, s.parts.length + 1);
  s.parts.push(file);
  void saveState();

  const isHls = /\.m3u8(\?|$)/i.test(s.source);
  const args = [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    // Icecast оқими реал вақтда келади: стандарт 5 МБ лик формат аниқлаш
    // бир неча дақиқа кутиб қолади ва файл ўша вақтгача бўш туради
    ...(isHls ? [] : [
      "-probesize", "32768", "-analyzeduration", "2000000",
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "10",
    ]),
    "-rw_timeout", "30000000",
    "-i", s.source,
    "-t", String(Math.ceil(remaining)),
    "-vn", "-ac", "2", "-c:a", "libmp3lame", "-b:a", BITRATE,
    // Ҳар бир пакет дарҳол дискка: ҳажм жонли кўринади, кескин ўчишда ҳам йўқолмайди
    "-flush_packets", "1",
    "-f", "mp3", file,
  ];
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  rt.child = child;
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
  child.on("error", (e) => {
    rt.lastError = (e as NodeJS.ErrnoException).code === "ENOENT"
      ? "Серверда ffmpeg ўрнатилмаган (sudo apt install ffmpeg)"
      : String(e);
  });

  child.on("close", () => {
    if (rt.child === child) rt.child = null;
    const st = rt.state;
    if (!st) return;
    if (rt.stopping || st.maxSeconds - elapsedSec(st) <= 5) {
      void finalize();
      return;
    }
    // Кутилмаганда тўхтади (оқим узилди) — қайта уланамиз
    rt.reconnects += 1;
    const msg = stderr.trim().split("\n").pop();
    if (msg) rt.lastError = `Оқим узилди, қайта уланмоқда… (${msg.slice(0, 160)})`;
    rt.retryTimer = setTimeout(() => {
      rt.retryTimer = null;
      spawnPart();
    }, RETRY_DELAY_MS);
  });
}

/** Ёзилган қисмларни битта файлга йиғиб, архивга қоралама қўшиш */
function finalize(note?: string): Promise<void> {
  if (rt.finalizing) return rt.finalizing;
  rt.finalizing = (async () => {
    const s = rt.state;
    if (rt.retryTimer) clearTimeout(rt.retryTimer);
    if (rt.stopTimer) clearTimeout(rt.stopTimer);
    rt.retryTimer = rt.stopTimer = null;
    if (!s) return;
    try {
      const parts: string[] = [];
      for (const p of s.parts) if ((await fileSize(p)) > 0) parts.push(p);
      if (parts.length === 0) {
        rt.lastError = "Ҳеч нарса ёзилмади: радио оқимига уланиб бўлмади. Оқим манзилини текширинг.";
        return;
      }

      const date = tashkentDate();
      const name = `${date}-efir-${randomBytes(4).toString("hex")}.mp3`;
      const out = path.join(AUDIO_DIR, name);
      if (parts.length === 1) {
        await fs.rename(parts[0], out);
      } else {
        const list = path.join(AUDIO_DIR, `.rec-${s.id}.txt`);
        await fs.writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
        const r = await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-y", out]);
        await fs.unlink(list).catch(() => undefined);
        if (r.code !== 0) {
          // Бирлаштириб бўлмаса — энг узун қисмни сақлаймиз, бошқалари ҳам дискда қолади
          rt.lastError = "Қисмларни бирлаштириб бўлмади: " + r.err.slice(-200);
          const sizes = await Promise.all(parts.map(fileSize));
          await fs.rename(parts[sizes.indexOf(Math.max(...sizes))], out);
        }
      }
      for (const p of parts) await fs.unlink(p).catch(() => undefined);

      const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]);
      const duration = Math.round(Number(probe.out.trim()) || elapsedSec(s));

      const id = "e" + Date.now().toString(36) + randomBytes(2).toString("hex");
      const title = `${s.rubric} — ${formatDate(date)}`;
      await updateContent((c) => {
        c.episodes.unshift({
          id, title, rubric: s.rubric, date, duration,
          description: note ?? "",
          audio: `/api/audio/${name}`,
          draft: true,
        });
        if (!c.rubrics.includes(s.rubric)) c.rubrics.push(s.rubric);
      });
      rt.lastDraft = { id, title };
      if (!note && rt.reconnects === 0) rt.lastError = null;
    } finally {
      rt.state = null;
      rt.child = null;
      rt.stopping = false;
      await saveState();
    }
  })().finally(() => {
    rt.finalizing = null;
  });
  return rt.finalizing;
}

/** Сервер қайта ишга тушганда чала қолган ёзувни қораламага сақлаш */
async function recover() {
  if (rt.recovered) return;
  rt.recovered = true;
  await ensureDataDir();
  const raw = await fs.readFile(STATE_FILE, "utf8").catch(() => null);
  if (!raw || rt.state) return;
  try {
    rt.state = JSON.parse(raw) as State;
  } catch {
    await fs.unlink(STATE_FILE).catch(() => undefined);
    return;
  }
  rt.lastError = "Сервер қайта ишга тушгани учун ёзиш тўхтади. Ёзилган қисми қораламага сақланди.";
  await finalize("Ёзиш сервер қайта ишга тушгани сабабли эрта тўхтаган.");
}

/* ---------- Ташқи API (фақат админ амалларидан чақирилади) ---------- */

export async function startRecording(rubric: string) {
  await recover();
  if (rt.state || rt.finalizing) throw new Error("Ёзиш аллақачон кетяпти");
  const content = await getContent();
  const source = content.streams[0]?.url;
  if (!source) throw new Error("Аввал «FM оқим» бўлимига радионинг расмий оқим манзилини киритинг");
  if (!rubric.trim()) throw new Error("Рукнни танланг");

  const st = await fs.statfs(DATA_DIR);
  if (st.bavail * st.bsize < MIN_FREE_BYTES) throw new Error("Серверда бўш жой 1 ГБ дан кам — аввал эски ёзувларни ўчиринг");

  rt.state = {
    id: randomBytes(6).toString("hex"),
    rubric: rubric.trim().slice(0, 80),
    startedAt: Date.now(),
    maxSeconds: RECORD_MAX_SECONDS,
    source,
    parts: [],
  };
  rt.stopping = false;
  rt.reconnects = 0;
  rt.lastError = null;
  rt.lastDraft = null;
  rt.lastBytes = 0;
  rt.lastGrowthAt = Date.now();
  await saveState();
  spawnPart();
  // Тўхтатиш эсдан чиқса — энг кўп вақтдан кейин ўзи тўхтайди
  rt.stopTimer = setTimeout(() => void stopRecording(), RECORD_MAX_SECONDS * 1000 + 15000);
}

export async function stopRecording() {
  await recover();
  if (!rt.state) return;
  rt.stopping = true;
  if (rt.retryTimer) {
    clearTimeout(rt.retryTimer);
    rt.retryTimer = null;
  }
  const child = rt.child;
  if (!child) {
    await finalize();
    return;
  }
  // SIGINT — ffmpeg файлни тўғри ёпиб чиқади
  await new Promise<void>((resolve) => {
    const kill = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.once("close", () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill("SIGINT");
  });
  await finalize();
}

export async function recordingStatus(): Promise<RecordingStatus> {
  await recover();
  const s = rt.state;
  const base = {
    maxSeconds: RECORD_MAX_SECONDS,
    finalizing: Boolean(rt.finalizing),
    lastError: rt.lastError,
    lastDraft: rt.lastDraft,
  };
  if (!s) return { active: false, ...base };
  let bytes = 0;
  for (const p of s.parts) bytes += await fileSize(p);
  const now = Date.now();
  if (bytes > rt.lastBytes) {
    rt.lastBytes = bytes;
    rt.lastGrowthAt = now;
  }
  return {
    active: true,
    ...base,
    rubric: s.rubric,
    startedAt: s.startedAt,
    elapsed: Math.floor(elapsedSec(s)),
    bytes,
    reconnects: rt.reconnects,
    // ffmpeg ўзи қайта уланаётганда жараён тирик, лекин файл ўсмайди
    connected: Boolean(rt.child) && now - rt.lastGrowthAt < STALL_MS,
  };
}
