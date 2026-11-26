import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, getContent } from "./content";
import * as recorder from "./recorder";
import { WEEKDAYS } from "./format";
import type { ScheduleSlot, Weekday } from "./types";

/**
 * Эфир жадвали бўйича автоматик ёзиш (админ ёқса).
 *
 * Жадвалдаги «ўз дастури» белгиланган ҳар бир эфир бошланишидан LEAD дақиқа
 * олдин ёзиш ўзи бошланади, тугагандан TAIL дақиқа кейин ўзи тўхтайди.
 * Ёзув одатдагидек архивга ҚОРАЛАМА бўлиб тушади.
 *
 *  • Админ эфир пайтида «Тўхтатиш»ни босса — шу эфир қайта бошланмайди.
 *  • Админ ўзи қўлда ёзаётган бўлса — унга тегилмайди.
 *  • Сервер эфир ўртасида қайта ишга тушса — ёзилган қисм сақланади ва
 *    ёзиш давом эттирилади (иккинчи қоралама бўлиб).
 *
 * Сервер жараёнида ҳар 30 сонияда текширилади (instrumentation.ts).
 */

export const LEAD_MIN = 2;
export const TAIL_MIN = 5;
const TICK_MS = 30_000;
const MIN_LEFT_MS = 5 * 60_000; // эфир тугашига 5 дақиқадан кам қолса — бошламаймиз

const FILE = path.join(DATA_DIR, "autorec.json");

type State = {
  enabled: boolean;
  /** Автоматик бошланган охирги эфир («слот@сана») */
  startedKey?: string;
  /** Тугаган / қўлда тўхтатилган эфир — қайта бошланмайди */
  closedKey?: string;
};

export type AutoRecInfo = {
  enabled: boolean;
  /** Кейинги автоматик ёзув: дастур номи ва бошланиш вақти (ms) */
  next: { title: string; startsAt: number; endsAt: number } | null;
  /** Ҳозирги ёзувни автомат бошлаганми */
  ownsCurrent: boolean;
  /** Автомат бошлаган ёзув қачон ўзи тўхтайди (ms) */
  stopsAt: number | null;
};

async function load(): Promise<State> {
  try {
    const s = JSON.parse(await fs.readFile(FILE, "utf8")) as State;
    return { ...s, enabled: Boolean(s.enabled) };
  } catch {
    return { enabled: false };
  }
}

async function save(s: State) {
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s), "utf8");
  await fs.rename(tmp, FILE);
}

/* ---------- Жадвалдаги эфирлар (Тошкент вақти, UTC+5) ---------- */

const TZ = 5 * 3600e3;
const DAY = 86400e3;
const WEEK = 7 * DAY;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

type Occurrence = { slot: ScheduleSlot; key: string; startsAt: number; endsAt: number };

/** «own» эфирларнинг ўтган, жорий ва келаси ҳафтадаги вақтлари (реал ms) */
function occurrences(schedule: ScheduleSlot[], now: number): Occurrence[] {
  const local = new Date(now + TZ);
  const dow = local.getUTCDay() || 7; // 1 — душанба
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - (dow - 1) * DAY - TZ;
  const out: Occurrence[] = [];
  for (const slot of schedule) {
    if (!slot.own) continue;
    const s = toMin(slot.start);
    let e = toMin(slot.end);
    if (e <= s) e += 1440; // ярим тундан ўтадиган эфир
    for (const w of [-1, 0, 1]) {
      const startsAt = monday + w * WEEK + (slot.day - 1) * DAY + s * 60e3;
      const endsAt = monday + w * WEEK + (slot.day - 1) * DAY + e * 60e3;
      const key = `${slot.id}@${new Date(startsAt + TZ).toISOString().slice(0, 10)}`;
      out.push({ slot, key, startsAt, endsAt });
    }
  }
  return out.sort((a, b) => a.startsAt - b.startsAt);
}

/** Ҳозир ёзиш ойнаси очиқ бўлган эфир (бошланишидан LEAD олдин — тугагандан TAIL кейин) */
function currentWindow(schedule: ScheduleSlot[], now: number) {
  return occurrences(schedule, now).find(
    (o) => now >= o.startsAt - LEAD_MIN * 60e3 && now < o.endsAt + TAIL_MIN * 60e3,
  ) ?? null;
}

/* ---------- Хабарлар ---------- */

const clock = (ms: number) => new Date(ms + TZ).toISOString().slice(11, 16);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tg(text: string) {
  void import("./telegram")
    .then((m) => m.notifyAdmins(text))
    .catch((e) => console.error("[autorec] telegram:", e));
}

/* ---------- Асосий текширув ---------- */

let running = false;

export async function tick(now = Date.now()) {
  if (running) return;
  running = true;
  try {
    const s = await load();
    const content = await getContent();
    const win = currentWindow(content.schedule, now);
    // recordingStatus() сервер қайта ишга тушганда чала ёзувни ҳам сақлаб қўяди
    const st = await recorder.recordingStatus();

    // 1. Автомат бошлаган эфир тугади — тўхтатамиз
    if (s.startedKey && s.closedKey !== s.startedKey && win?.key !== s.startedKey) {
      s.closedKey = s.startedKey;
      await save(s);
      if (st.active) {
        console.log(`[autorec] ${s.startedKey}: эфир тугади — ёзиш тўхтатилмоқда`);
        await recorder.stopRecordingAuto();
      }
      return;
    }

    if (!s.enabled || !win || s.closedKey === win.key || st.active || st.finalizing) {
      // Админ шу эфирни қўлда ёзаётган бўлса — автомат аралашмайди
      if (s.enabled && win && st.active && s.startedKey !== win.key) {
        s.startedKey = s.closedKey = win.key;
        await save(s);
      }
      return;
    }
    if (win.endsAt + TAIL_MIN * 60e3 - now < MIN_LEFT_MS) return;

    // 2. Ёзишни бошлаймиз (ёки сервер қайта ишга тушгач давом эттирамиз)
    const resumed = s.startedKey === win.key;
    s.startedKey = win.key;
    try {
      await recorder.startRecording(win.slot.title);
      await save(s);
      console.log(`[autorec] ${win.key}: ёзиш ${resumed ? "давом эттирилди" : "бошланди"}`);
      tg(
        `🔴 <b>${resumed ? "Ёзиш давом эттирилди" : "Автоматик ёзиш бошланди"}</b>\n` +
          `«${esc(win.slot.title)}» — ${clock(win.endsAt + TAIL_MIN * 60e3)} да ўзи тўхтайди.\n` +
          `Эрта тўхтатиш: /toxta`,
      );
    } catch (e) {
      s.closedKey = win.key;
      await save(s);
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[autorec] ${win.key}: бошлаб бўлмади —`, msg);
      tg(`❌ <b>Автоматик ёзишни бошлаб бўлмади</b>\n«${esc(win.slot.title)}»: ${esc(msg)}`);
    }
  } catch (e) {
    console.error("[autorec]", e);
  } finally {
    running = false;
  }
}

/** Админ ёзишни қўлда тўхтатди — шу эфир автомат қайта бошланмасин */
export async function noteManualStop() {
  const s = await load();
  if (s.startedKey && s.closedKey !== s.startedKey) {
    s.closedKey = s.startedKey;
    await save(s);
  }
}

export async function getAutoRec(now = Date.now()): Promise<AutoRecInfo> {
  const s = await load();
  const content = await getContent();
  const owns = Boolean(s.startedKey && s.closedKey !== s.startedKey);
  const all = occurrences(content.schedule, now);
  const cur = owns ? all.find((o) => o.key === s.startedKey) : undefined;
  const next = all.find(
    (o) => o.key !== s.closedKey && o.key !== cur?.key && o.endsAt + TAIL_MIN * 60e3 - now >= MIN_LEFT_MS,
  );
  return {
    enabled: s.enabled,
    next: next ? { title: next.slot.title, startsAt: next.startsAt - LEAD_MIN * 60e3, endsAt: next.endsAt + TAIL_MIN * 60e3 } : null,
    ownsCurrent: owns,
    stopsAt: cur ? cur.endsAt + TAIL_MIN * 60e3 : null,
  };
}

/** «Пайшанба 18:58» — Telegram ва панел учун */
export function whenLabel(ms: number, now = Date.now()) {
  const d = (x: number) => new Date(x + TZ).toISOString().slice(0, 10);
  const day = d(ms) === d(now) ? "бугун" : d(ms) === d(now + DAY) ? "эртага" : WEEKDAYS[((new Date(ms + TZ).getUTCDay() || 7) as Weekday)];
  return `${day} ${clock(ms)}`;
}

/** Telegram «Ҳолат» учун битта қатор */
export async function autoRecLine() {
  const a = await getAutoRec();
  if (!a.enabled) return "🤖 Автоматик ёзиш: ўчиқ (админ-панелда ёқилади)";
  return `🤖 Автоматик ёзиш: ёқилган` + (a.next ? `\n   Кейингиси: «${esc(a.next.title)}», ${whenLabel(a.next.startsAt)}` : "");
}

export async function setAutoRec(enabled: boolean) {
  const s = await load();
  s.enabled = enabled;
  await save(s);
  if (enabled) void tick();
}

/** Сервер ишга тушганда бир марта чақирилади */
export function startAutoRecorder() {
  const g = globalThis as unknown as { __svAutoRec?: ReturnType<typeof setInterval> };
  if (g.__svAutoRec) return;
  g.__svAutoRec = setInterval(() => void tick(), TICK_MS);
  setTimeout(() => void tick(), 5000);
}
