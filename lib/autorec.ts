import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, getContent } from "./content";
import { WEEKDAYS } from "./format";
import * as recorder from "./recorder";
import type { ChannelId } from "./recorder";
import type { Weekday } from "./types";

/**
 * Жадвал бўйича автоматик ёзиш — СОАТМА-СОАТ.
 *
 * Эфир соат бошида бошланиб, соат охирида тугайдиган 1 соатлик файлларга
 * бўлиб ёзилади: 19:00–20:00, 20:00–21:00, 21:00–22:00 (3 соатлик дастур —
 * 3 та файл). Соат тугаши билан кейинги соат дарҳол бошланади.
 *
 * Иккита канал, ҳар бири алоҳида ёқилади:
 *   • sevinchim — «Эфир жадвали»даги «ўз дастури» белгиланган эфирлар;
 *     ҳар бир соат архивга алоҳида ҚОРАЛАМА бўлиб тушади;
 *   • fm90 — FM 90.8: танланган кунлар ва вақт (стандарт: Ду–Жу 07:00–10:00);
 *     ҳар бир соат FM90 папкасига алоҳида файл.
 *
 * Қоидалар:
 *  • Админ эфир пайтида «Тўхтатиш»ни босса — шу эфирнинг қолган соатлари
 *    ёзилмайди (кейинги эфирда яна ўзи ёзади).
 *  • Админ ўзи қўлда ёзаётган бўлса — автомат шу эфирга аралашмайди.
 *  • Сервер соат ўртасида қайта ишга тушса — ёзилган қисм сақланади ва ўша
 *    соат ёзиш давом эттирилади.
 *
 * Ҳар дақиқа бошида текширилади (instrumentation.ts) + ёзув тугаган заҳоти.
 */

const TZ = 5 * 3600e3; // Тошкент, UTC+5
const MIN = 60e3;
/** Бир файл узунлиги (синов учун ўзгартириш мумкин) — стандарт 60 дақиқа */
const HOUR = (Number(process.env.AUTOREC_SEGMENT_MIN) || 60) * MIN;
const DAY = 86400e3;
const WEEK = 7 * DAY;
const MIN_LEFT_MS = 20e3; // соат тугашига 20 сониядан кам қолса — бошламаймиз

const FILE = path.join(DATA_DIR, "autorec.json");
/** Эфир ойнаси очиқ — автоматик янгилаш сайтни қайта ишга туширмасин (deploy/auto-update.sh) */
const BUSY_FILE = path.join(DATA_DIR, "autorec-busy");

export type Fm90Schedule = { days: Weekday[]; start: string; end: string };

type Chan = {
  enabled: boolean;
  /** Автомат бошлаган охирги соат («слот@сана#ЧЧ:ДД») ва унинг тугаш вақти */
  seg?: string;
  segEnd?: number;
  /** Тугаган соат */
  segDone?: string;
  /** Қолган соатлари ёзилмайдиган эфир (қўлда тўхтатилган, хато, қўлда ёзилган) */
  closedOcc?: string;
};

type State = { sevinchim: Chan; fm90: Chan; fm90Schedule: Fm90Schedule };

const DEFAULT_FM90: Fm90Schedule = { days: [1, 2, 3, 4, 5], start: "07:00", end: "10:00" };

async function load(): Promise<State> {
  let raw: Partial<State> & { enabled?: boolean } = {};
  try {
    raw = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}
  return {
    // Эски версия: { enabled } — фақат Севинч эфири учун эди
    sevinchim: raw.sevinchim ?? { enabled: Boolean(raw.enabled) },
    fm90: raw.fm90 ?? { enabled: true },
    fm90Schedule: { ...DEFAULT_FM90, ...raw.fm90Schedule },
  };
}

async function save(s: State) {
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s), "utf8");
  await fs.rename(tmp, FILE);
}

/* ---------- Эфирлар ва соатлар ---------- */

type Slot = { id: string; day: Weekday; start: string; end: string; title: string };
type Occurrence = { slot: Slot; key: string; startsAt: number; endsAt: number };
type Segment = { key: string; start: number; end: number; part: string };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const clock = (ms: number) => new Date(ms + TZ).toISOString().slice(11, 16);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function slotsOf(id: ChannelId, s: State): Promise<Slot[]> {
  if (id === "fm90") {
    const { days, start, end } = s.fm90Schedule;
    return days.map((day) => ({ id: `fm90-${day}`, day, start, end, title: "FM 90.8" }));
  }
  const content = await getContent();
  return content.schedule.filter((x) => x.own);
}

/** Ўтган, жорий ва келаси ҳафтадаги эфирлар (реал ms) */
function occurrences(slots: Slot[], now: number): Occurrence[] {
  const local = new Date(now + TZ);
  const dow = local.getUTCDay() || 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - (dow - 1) * DAY - TZ;
  const out: Occurrence[] = [];
  for (const slot of slots) {
    const a = toMin(slot.start);
    let b = toMin(slot.end);
    if (b <= a) b += 1440; // ярим тундан ўтадиган эфир
    for (const w of [-1, 0, 1]) {
      const base = monday + w * WEEK + (slot.day - 1) * DAY;
      const startsAt = base + a * MIN;
      out.push({
        slot,
        key: `${slot.id}@${new Date(startsAt + TZ).toISOString().slice(0, 10)}`,
        startsAt,
        endsAt: base + b * MIN,
      });
    }
  }
  return out.sort((x, y) => x.startsAt - y.startsAt);
}

/** t вақтидаги соат: соат боши ва охири билан чекланган (эфир чегарасида кесилади) */
function segmentAt(o: Occurrence, t: number): Segment | null {
  if (t < o.startsAt || t >= o.endsAt) return null;
  const hour = Math.floor((t + TZ) / HOUR) * HOUR - TZ;
  const start = Math.max(o.startsAt, hour);
  const end = Math.min(o.endsAt, hour + HOUR);
  return { key: `${o.key}#${clock(start)}`, start, end, part: `${clock(start)}–${clock(end)}` };
}

/* ---------- Telegram ---------- */

function tg(text: string) {
  void import("./telegram")
    .then((m) => m.notifyAdmins(text))
    .catch((e) => console.error("[autorec] telegram:", e));
}

const NAMES: Record<ChannelId, string> = { sevinchim: "Севинчим эфири", fm90: "FM 90.8" };
const STOP_CMD: Record<ChannelId, string> = { sevinchim: "/toxta", fm90: "/fm90_toxta" };

/* ---------- Асосий текширув ---------- */

async function tickChannel(id: ChannelId, s: State, now: number): Promise<number | null> {
  const ch = s[id];
  const rec = recorder.channels[id];
  // Ёзув соат чегарасидан бир лаҳза кейин тугайди — 2 сония олдинга қараймиз
  const t = now + 2000;
  const occ = occurrences(await slotsOf(id, s), now).find((o) => t >= o.startsAt && t < o.endsAt) ?? null;
  const seg = occ ? segmentAt(occ, t) : null;
  const st = await rec.status(); // сервер қайта ишга тушган бўлса, чала ёзувни ҳам сақлайди
  const owned = Boolean(ch.seg && ch.segDone !== ch.seg);

  if (owned) {
    if (st.active || st.finalizing) {
      // Соат тугади, лекин ёзув ҳали кетяпти — тўхтатамиз (одатда ўзи тўхтайди)
      if (st.active && seg?.key !== ch.seg) await rec.stop();
      return occ && ch.enabled ? occ.endsAt : null;
    }
    // Ёзув тугаган: соат охирига етдими ёки сервер қайта ишга тушдими?
    const crashed = seg?.key === ch.seg && now < (ch.segEnd ?? 0) - 10e3;
    if (!crashed) {
      ch.segDone = ch.seg;
      await save(s);
    }
  }

  if (!occ || !seg) return null;
  const busy = ch.enabled && ch.closedOcc !== occ.key ? occ.endsAt : null;
  if (!ch.enabled || ch.closedOcc === occ.key || st.finalizing) return busy;

  if (st.active) {
    // Админ шу эфирни қўлда ёзяпти — автомат аралашмайди
    if (!owned) {
      ch.closedOcc = occ.key;
      await save(s);
    }
    return null;
  }
  if (ch.segDone === seg.key || seg.end - Date.now() < MIN_LEFT_MS) return busy;

  // Соатни бошлаймиз
  const resumed = ch.seg === seg.key;
  const first = seg.start === occ.startsAt;
  ch.seg = seg.key;
  ch.segEnd = seg.end;
  try {
    await rec.start(occ.slot.title, { maxSeconds: (seg.end - Date.now()) / 1000, part: seg.part });
    await save(s);
    console.log(`[autorec] ${id} ${seg.key}: ${resumed ? "давом эттирилди" : "бошланди"} (${seg.part})`);
    if (resumed || first) {
      tg(
        `🔴 <b>${NAMES[id]}: ${resumed ? "ёзиш давом эттирилди" : "автоматик ёзиш бошланди"}</b>\n` +
          `«${esc(occ.slot.title)}» соатма-соат ёзилади, ${clock(occ.endsAt)} да тугайди.\n` +
          `Эрта тўхтатиш: ${STOP_CMD[id]}`,
      );
    }
  } catch (e) {
    ch.segDone = seg.key;
    ch.closedOcc = occ.key;
    await save(s);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[autorec] ${id} ${seg.key}: бошлаб бўлмади —`, msg);
    tg(`❌ <b>${NAMES[id]}: автоматик ёзишни бошлаб бўлмади</b>\n«${esc(occ.slot.title)}»: ${esc(msg)}`);
    return null;
  }
  return occ.endsAt;
}

let running: Promise<void> | null = null;
let again = false;

export function tick(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const s = await load();
        const now = Date.now();
        let busyUntil = 0;
        for (const id of ["sevinchim", "fm90"] as const) {
          try {
            busyUntil = Math.max(busyUntil, (await tickChannel(id, s, now)) ?? 0);
          } catch (e) {
            console.error(`[autorec] ${id}:`, e);
          }
        }
        if (busyUntil > now) await fs.writeFile(BUSY_FILE, String(Math.ceil(busyUntil / 1000)));
        else await fs.unlink(BUSY_FILE).catch(() => undefined);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Ёзув тугади — кейинги соатни дарҳол бошлаш учун */
export function kick() {
  setTimeout(() => void tick(), 200);
}

/** Админ ёзишни қўлда тўхтатди — шу эфирнинг қолган соатлари ёзилмайди */
export async function noteManualStop(id: ChannelId) {
  const s = await load();
  const ch = s[id];
  if (ch.seg && ch.segDone !== ch.seg) {
    ch.segDone = ch.seg;
    ch.closedOcc = ch.seg.split("#")[0];
    await save(s);
  }
}

/* ---------- Панел ва Telegram учун ---------- */

export type AutoRecInfo = {
  enabled: boolean;
  /** Кейинги автоматик эфир */
  next: { title: string; startsAt: number; endsAt: number; label: string } | null;
  /** Ҳозирги ёзувни автомат бошлаган бўлса — шу соат қачон тугайди */
  segEnd: number | null;
  /** Ҳозирги автомат эфир қачон тугайди */
  occEnd: number | null;
  schedule?: Fm90Schedule;
};

/** «бугун 19:00», «эртага 07:00», «Пайшанба 19:00» */
export function whenLabel(ms: number, now = Date.now()) {
  const d = (x: number) => new Date(x + TZ).toISOString().slice(0, 10);
  const day = d(ms) === d(now) ? "бугун" : d(ms) === d(now + DAY) ? "эртага" : WEEKDAYS[(new Date(ms + TZ).getUTCDay() || 7) as Weekday];
  return `${day} ${clock(ms)}`;
}

export async function getAutoRec(id: ChannelId, now = Date.now()): Promise<AutoRecInfo> {
  const s = await load();
  const ch = s[id];
  const all = occurrences(await slotsOf(id, s), now);
  const owned = Boolean(ch.seg && ch.segDone !== ch.seg);
  const curKey = owned ? ch.seg!.split("#")[0] : null;
  const cur = all.find((o) => o.key === curKey);
  const next = all.find((o) => o.key !== curKey && o.key !== ch.closedOcc && o.endsAt - now >= MIN_LEFT_MS);
  return {
    enabled: ch.enabled,
    next: next ? { title: next.slot.title, startsAt: next.startsAt, endsAt: next.endsAt, label: whenLabel(Math.max(next.startsAt, now), now) } : null,
    segEnd: owned ? ch.segEnd ?? null : null,
    occEnd: cur?.endsAt ?? null,
    schedule: id === "fm90" ? s.fm90Schedule : undefined,
  };
}

export async function setAutoRec(id: ChannelId, enabled: boolean) {
  const s = await load();
  s[id].enabled = enabled;
  await save(s);
  if (enabled) void tick();
}

export async function setFm90Schedule(v: Fm90Schedule) {
  const s = await load();
  s.fm90Schedule = v;
  await save(s);
  void tick();
}

/** Telegram «Ҳолат» учун */
export async function autoRecLine() {
  const lines: string[] = [];
  for (const id of ["sevinchim", "fm90"] as const) {
    const a = await getAutoRec(id);
    lines.push(
      a.enabled
        ? `🤖 ${NAMES[id]} — автоматик ёзиш ёқилган` + (a.next ? `\n   Кейингиси: ${a.next.label}` : "")
        : `🤖 ${NAMES[id]} — автоматик ёзиш ўчиқ`,
    );
  }
  return lines.join("\n");
}

/** Сервер ишга тушганда бир марта: ҳар дақиқа бошида текширамиз */
export function startAutoRecorder() {
  const g = globalThis as unknown as { __svAutoRec?: boolean };
  if (g.__svAutoRec) return;
  g.__svAutoRec = true;
  const loop = () => {
    void tick();
    setTimeout(loop, MIN - (Date.now() % MIN) + 150);
  };
  setTimeout(loop, 3000);
}
