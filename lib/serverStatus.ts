import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AUDIO_DIR, DATA_DIR } from "./content";
import { FM90_DIR } from "./recorder";

/**
 * Админ-панел «Сервер ҳолати»: SSH'сиз текшириш учун.
 * Фақат ўқийди — серверда ҳеч нарса ўзгартирмайди.
 */

const run = promisify(execFile);

export type UpdateEvent = { state: string; text: string; commit: string; from: string; msg: string; at: number };

export type ServerStatus = {
  now: number;
  version: { commit: string; message: string; date: number } | null;
  update: { checkedAt: number | null; fetchError: string | null; last: UpdateEvent | null; history: UpdateEvent[] };
  disk: { free: number; total: number } | null;
  memory: { total: number; available: number; swapTotal: number; swapFree: number };
  load: number[];
  cpus: number;
  uptime: number;
  appUptime: number;
  node: string;
  sizes: { audio: number; fm90: number; receipts: number; database: number };
  cert: { validTo: number; issuer: string } | null;
  warnings: string[];
};

/** Ишлаётган версия: сайт папкасидаги git коммит */
async function version() {
  try {
    const { stdout } = await run("git", ["-C", process.cwd(), "log", "-1", "--format=%h%x1f%s%x1f%ct"], { timeout: 5000 });
    const [commit, message, ct] = stdout.trim().split("\x1f");
    return commit ? { commit, message, date: Number(ct) * 1000 } : null;
  } catch {
    return null;
  }
}

async function readUpdate(): Promise<ServerStatus["update"]> {
  try {
    const d = JSON.parse(await fs.readFile(path.join(DATA_DIR, "update-status.json"), "utf8"));
    return { checkedAt: d.checkedAt ?? null, fetchError: d.fetchError ?? null, last: d.last ?? null, history: d.history ?? [] };
  } catch {
    return { checkedAt: null, fetchError: null, last: null, history: [] };
  }
}

/** /proc/meminfo — «available» хотира free'дан аниқроқ (кэш ҳам бўшатилади) */
async function memory() {
  const total = os.totalmem();
  try {
    const t = await fs.readFile("/proc/meminfo", "utf8");
    const kb = (k: string) => Number(new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(t)?.[1] ?? 0) * 1024;
    return { total, available: kb("MemAvailable") || os.freemem(), swapTotal: kb("SwapTotal"), swapFree: kb("SwapFree") };
  } catch {
    return { total, available: os.freemem(), swapTotal: 0, swapFree: 0 };
  }
}

/** Папкадаги файллар ҳажми (бир даража + ички папкалар) */
async function dirSize(dir: string, depth = 2): Promise<number> {
  let sum = 0;
  const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isFile()) sum += (await fs.stat(p).catch(() => null))?.size ?? 0;
    else if (it.isDirectory() && depth > 0) sum += await dirSize(p, depth - 1);
  }
  return sum;
}

const fileSize = async (p: string) => (await fs.stat(p).catch(() => null))?.size ?? 0;

/** HTTPS сертификати қачон тугайди (сайтнинг ўзига уланиб текширамиз) */
function cert(host: string): Promise<ServerStatus["cert"]> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 5000, rejectUnauthorized: false }, () => {
      const c = sock.getPeerCertificate();
      sock.end();
      resolve(c?.valid_to ? { validTo: Date.parse(c.valid_to), issuer: String(c.issuer?.O || c.issuer?.CN || "") } : null);
    });
    sock.on("error", () => resolve(null));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(null);
    });
  });
}

const GB = 1024 ** 3;

export async function serverStatus(): Promise<ServerStatus> {
  const host = (process.env.NEXT_PUBLIC_SITE_URL || "https://sevinchim.uz").replace(/^https?:\/\//, "").replace(/[/:].*$/, "");
  const [ver, update, mem, st, audio, fm90, receipts, db, wal, crt] = await Promise.all([
    version(),
    readUpdate(),
    memory(),
    fs.statfs(DATA_DIR).catch(() => null),
    dirSize(AUDIO_DIR, 0),
    dirSize(FM90_DIR, 0),
    dirSize(path.join(DATA_DIR, "receipts"), 0),
    fileSize(path.join(DATA_DIR, "app.db")),
    fileSize(path.join(DATA_DIR, "app.db-wal")),
    process.env.NODE_ENV === "production" ? cert(host) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const disk = st ? { free: st.bavail * st.bsize, total: st.blocks * st.bsize } : null;

  const warnings: string[] = [];
  if (disk && disk.free < 2 * GB) warnings.push(`Дискда ${(disk.free / GB).toFixed(1)} ГБ жой қолди — эски ёзувларни ўчиринг (эфир ёзиш учун камида 1 ГБ керак).`);
  if (mem.available < 150 * 1024 ** 2) warnings.push("Оператив хотира жуда кам қолган — сайт секинлашиши мумкин.");
  if (update.last?.state === "failed" || update.last?.state === "rolled-back") warnings.push("Охирги янгиланиш муваффақиятсиз тугади — сайт олдинги версияда ишлаяпти.");
  if (update.fetchError) warnings.push("Сервер GitHub'га уланолмаяпти — янгиланишлар келмайди.");
  if (update.checkedAt && now - update.checkedAt > 30 * 60e3) warnings.push("Автоматик янгилаш 30 дақиқадан бери текширмаган — таймер ўчган бўлиши мумкин.");
  if (crt && crt.validTo - now < 14 * 86400e3) warnings.push("HTTPS сертификати 14 кундан кам вақтда тугайди.");

  return {
    now,
    version: ver,
    update,
    disk,
    memory: mem,
    load: os.loadavg(),
    cpus: os.cpus().length,
    uptime: os.uptime(),
    appUptime: process.uptime(),
    node: process.version,
    sizes: { audio, fm90, receipts, database: db + wal },
    cert: crt,
    warnings,
  };
}
