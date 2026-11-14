import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AUDIO_DIR, DATA_DIR, ensureDataDir, getContent, updateContent } from "./content";
import { formatDate } from "./format";

/**
 * Радио оқимини ёзиб олиш (фақат админ буйруғи билан).
 *
 * Иккита мустақил «канал» бор, улар бир вақтда ишлай олади:
 *   • sevinchim — Севинчнинг эфири: оқим «FM оқим» бўлимидан, ёзув сайт
 *     архивига ҚОРАЛАМА бўлиб тушади (сайтда кўринмайди, админ чоп этади);
 *   • fm90 — FM 90.8: оқим «FM90.8» бўлимидан, ёзув DATA_DIR/FM90 папкасига
 *     алоҳида файл бўлиб тушади (сайтда умуман кўринмайди).
 *
 * Иккаласида ҳам: ffmpeg оқимни MP3 га ёзади; «Тўхтатиш» ёки энг кўп вақт
 * ўтганда тўхтайди. Оқим узилса — 5 сониядан кейин қайта уланиб янги қисм
 * ёзади, охирида қисмлар битта файлга бирлаштирилади. Сервер қайта ишга
 * тушса, ёзилган қисмлар йўқолмайди.
 */

export const RECORD_MAX_SECONDS = Number(process.env.RECORD_MAX_SECONDS) || 3.5 * 3600;
const BITRATE = process.env.RECORD_BITRATE || "128k";
const MIN_FREE_BYTES = 1024 ** 3; // 1 ГБ бўш жой бўлмаса — бошламаймиз
const RETRY_DELAY_MS = 5000;
const STALL_MS = 8000;

export const FM90_DIR = path.join(DATA_DIR, "FM90");

export type ChannelId = "sevinchim" | "fm90";

type State = {
  id: string;
  /** sevinchim: рукн; fm90: ёзув номи */
  label: string;
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

/** Ёзув тугагач Telegram'га юбориладиган натижа */
export type FinishResult =
  | { channel: "sevinchim"; ok: true; id: string; title: string; duration: number; note?: string }
  | { channel: "fm90"; ok: true; file: string; path: string; size: number; duration: number; note?: string }
  | { channel: ChannelId; ok: false; error: string };

type ChannelConfig = {
  id: ChannelId;
  outDir: string;
  stateFile: string;
  /** Оқим манзили ва энг кўп давомийлик */
  source(): Promise<{ url?: string; maxSeconds: number; missing: string }>;
  /** Тайёр файлни жойлаштириш ва натижа */
  save(merged: string, s: State, duration: number, note?: string): Promise<FinishResult & { ok: true }>;
};

/* ---------- Ёрдамчилар ---------- */

const tashkent = (ms = Date.now()) => new Date(ms + 5 * 3600e3).toISOString();
const elapsedSec = (s: State) => (Date.now() - s.startedAt) / 1000;

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

/** Telegram ботга хабар (бот уланмаган бўлса ҳеч нарса қилмайди) */
function notify(r: FinishResult) {
  void import("./telegram")
    .then((m) => m.notifyRecordingFinished(r))
    .catch((e) => console.error("[telegram] notify:", e));
}

/* ---------- Канал ---------- */

class Recorder {
  private rt: Runtime;

  constructor(private cfg: ChannelConfig) {
    const g = globalThis as unknown as Record<string, Runtime | undefined>;
    const key = `__svRecorder_${cfg.id}`;
    this.rt = g[key] ??= {
      state: null, child: null, stopping: false, finalizing: null, retryTimer: null, stopTimer: null,
      reconnects: 0, lastError: null, lastDraft: null, recovered: false, lastBytes: 0, lastGrowthAt: 0,
    };
  }

  private partPath(id: string, n: number) {
    return path.join(this.cfg.outDir, `.rec-${id}-${n}.mp3`);
  }

  private async saveState() {
    const { rt, cfg } = this;
    if (rt.state) await fs.writeFile(cfg.stateFile, JSON.stringify(rt.state), "utf8");
    else await fs.unlink(cfg.stateFile).catch(() => undefined);
  }

  private spawnPart() {
    const { rt } = this;
    const s = rt.state;
    if (!s || rt.stopping) return;
    const remaining = s.maxSeconds - elapsedSec(s);
    if (remaining <= 5) {
      void this.finalize();
      return;
    }

    const file = this.partPath(s.id, s.parts.length + 1);
    s.parts.push(file);
    void this.saveState();

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
        void this.finalize();
        return;
      }
      // Кутилмаганда тўхтади (оқим узилди) — қайта уланамиз
      rt.reconnects += 1;
      const msg = stderr.trim().split("\n").pop();
      if (msg) rt.lastError = `Оқим узилди, қайта уланмоқда… (${msg.slice(0, 160)})`;
      rt.retryTimer = setTimeout(() => {
        rt.retryTimer = null;
        this.spawnPart();
      }, RETRY_DELAY_MS);
    });
  }

  /** Ёзилган қисмларни битта файлга йиғиш ва каналга хос жойлаштириш */
  private finalize(note?: string): Promise<void> {
    const { rt, cfg } = this;
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
          notify({ channel: cfg.id, ok: false, error: rt.lastError });
          return;
        }

        const merged = path.join(cfg.outDir, `.rec-${s.id}-merged.mp3`);
        if (parts.length === 1) {
          await fs.rename(parts[0], merged);
        } else {
          const list = path.join(cfg.outDir, `.rec-${s.id}.txt`);
          await fs.writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
          const r = await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-y", merged]);
          await fs.unlink(list).catch(() => undefined);
          if (r.code !== 0) {
            // Бирлаштириб бўлмаса — энг узун қисмни сақлаймиз
            rt.lastError = "Қисмларни бирлаштириб бўлмади: " + r.err.slice(-200);
            const sizes = await Promise.all(parts.map(fileSize));
            await fs.rename(parts[sizes.indexOf(Math.max(...sizes))], merged);
          }
        }
        for (const p of parts) await fs.unlink(p).catch(() => undefined);

        const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", merged]);
        const duration = Math.round(Number(probe.out.trim()) || elapsedSec(s));

        const result = await cfg.save(merged, s, duration, note);
        if (result.channel === "sevinchim") rt.lastDraft = { id: result.id, title: result.title };
        else rt.lastDraft = { id: result.file, title: result.file };
        notify(result);
        if (!note && rt.reconnects === 0) rt.lastError = null;
      } finally {
        rt.state = null;
        rt.child = null;
        rt.stopping = false;
        await this.saveState();
      }
    })().finally(() => {
      rt.finalizing = null;
    });
    return rt.finalizing;
  }

  /** Сервер қайта ишга тушганда чала қолган ёзувни сақлаш */
  private async recover() {
    const { rt, cfg } = this;
    if (rt.recovered) return;
    rt.recovered = true;
    await ensureDataDir();
    await fs.mkdir(cfg.outDir, { recursive: true });
    const raw = await fs.readFile(cfg.stateFile, "utf8").catch(() => null);
    if (!raw || rt.state) return;
    try {
      rt.state = JSON.parse(raw) as State;
      // Эски версиядаги ҳолат файлида «rubric» майдони бўлган
      rt.state.label ??= (rt.state as unknown as { rubric?: string }).rubric ?? "Эфир";
    } catch {
      await fs.unlink(cfg.stateFile).catch(() => undefined);
      return;
    }
    rt.lastError = "Сервер қайта ишга тушгани учун ёзиш тўхтади. Ёзилган қисми сақланди.";
    await this.finalize("Ёзиш сервер қайта ишга тушгани сабабли эрта тўхтаган.");
  }

  async start(label: string) {
    const { rt, cfg } = this;
    await this.recover();
    if (rt.state || rt.finalizing) throw new Error("Ёзиш аллақачон кетяпти");
    const src = await cfg.source();
    if (!src.url) throw new Error(src.missing);
    if (!label.trim()) throw new Error("Номини танланг");

    const st = await fs.statfs(DATA_DIR);
    if (st.bavail * st.bsize < MIN_FREE_BYTES) throw new Error("Серверда бўш жой 1 ГБ дан кам — аввал эски ёзувларни ўчиринг");

    rt.state = {
      id: randomBytes(6).toString("hex"),
      label: label.trim().slice(0, 80),
      startedAt: Date.now(),
      maxSeconds: src.maxSeconds,
      source: src.url,
      parts: [],
    };
    rt.stopping = false;
    rt.reconnects = 0;
    rt.lastError = null;
    rt.lastDraft = null;
    rt.lastBytes = 0;
    rt.lastGrowthAt = Date.now();
    await this.saveState();
    this.spawnPart();
    // Тўхтатиш эсдан чиқса — энг кўп вақтдан кейин ўзи тўхтайди
    rt.stopTimer = setTimeout(() => void this.stop(), src.maxSeconds * 1000 + 15000);
  }

  async stop() {
    const { rt } = this;
    await this.recover();
    if (!rt.state) return;
    rt.stopping = true;
    if (rt.retryTimer) {
      clearTimeout(rt.retryTimer);
      rt.retryTimer = null;
    }
    const child = rt.child;
    if (!child) {
      await this.finalize();
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
    await this.finalize();
  }

  async status(): Promise<RecordingStatus> {
    const { rt, cfg } = this;
    await this.recover();
    const s = rt.state;
    const base = {
      maxSeconds: s?.maxSeconds ?? (await cfg.source()).maxSeconds,
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
      rubric: s.label,
      startedAt: s.startedAt,
      elapsed: Math.floor(elapsedSec(s)),
      bytes,
      reconnects: rt.reconnects,
      // ffmpeg ўзи қайта уланаётганда жараён тирик, лекин файл ўсмайди
      connected: Boolean(rt.child) && now - rt.lastGrowthAt < STALL_MS,
    };
  }
}

/* ---------- Канал 1: Севинчнинг эфири → сайт архивига қоралама ---------- */

const sevinchim = new Recorder({
  id: "sevinchim",
  outDir: AUDIO_DIR,
  stateFile: path.join(DATA_DIR, "recording.json"),
  async source() {
    const content = await getContent();
    return {
      url: content.streams[0]?.url,
      maxSeconds: RECORD_MAX_SECONDS,
      missing: "Аввал «FM оқим» бўлимига радионинг расмий оқим манзилини киритинг",
    };
  },
  async save(merged, s, duration, note) {
    const date = tashkent(s.startedAt).slice(0, 10);
    const name = `${date}-efir-${randomBytes(4).toString("hex")}.mp3`;
    await fs.rename(merged, path.join(AUDIO_DIR, name));
    const id = "e" + Date.now().toString(36) + randomBytes(2).toString("hex");
    const title = `${s.label} — ${formatDate(date)}`;
    await updateContent((c) => {
      c.episodes.unshift({ id, title, rubric: s.label, date, duration, description: note ?? "", audio: `/api/audio/${name}`, draft: true });
      if (!c.rubrics.includes(s.label)) c.rubrics.push(s.label);
    });
    return { channel: "sevinchim", ok: true, id, title, duration, note };
  },
});

export const startRecording = (rubric: string) => sevinchim.start(rubric);
export const stopRecording = () => sevinchim.stop();
export const recordingStatus = () => sevinchim.status();

/* ---------- Канал 2: FM 90.8 → DATA_DIR/FM90 папкаси ---------- */

const fm90 = new Recorder({
  id: "fm90",
  outDir: FM90_DIR,
  stateFile: path.join(DATA_DIR, "recording-fm90.json"),
  async source() {
    const { getFm90Settings } = await import("./fm90");
    const st = await getFm90Settings();
    return {
      url: st.streamUrl || undefined,
      maxSeconds: Math.max(5, st.maxMinutes * 60),
      missing: "Аввал «FM90.8» бўлимига оқим манзилини киритинг",
    };
  },
  async save(merged, s, duration, note) {
    const { registerFm90File } = await import("./fm90");
    // FM90_2026-11-15_19-00.mp3 (бошланган вақт, Тошкент); бир хил ном бўлса — суффикс
    const stamp = tashkent(s.startedAt).slice(0, 16).replace("T", "_").replace(":", "-");
    let name = `FM90_${stamp}.mp3`;
    for (let i = 2; await fs.stat(path.join(FM90_DIR, name)).then(() => true, () => false); i++) name = `FM90_${stamp}_${i}.mp3`;
    const full = path.join(FM90_DIR, name);
    await fs.rename(merged, full);
    const size = await fileSize(full);
    await registerFm90File(name, { duration, startedAt: s.startedAt, note });
    return { channel: "fm90", ok: true, file: name, path: full, size, duration, note };
  },
});

export const startFm90 = () => fm90.start("FM 90.8");
export const stopFm90 = () => fm90.stop();
export const fm90Status = () => fm90.status();
