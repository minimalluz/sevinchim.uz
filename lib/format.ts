import type { ScheduleSlot, Weekday } from "./types";

export const MONTHS = [
  "январ", "феврал", "март", "апрел", "май", "июн",
  "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
];
export const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));

export const WEEKDAYS: Record<Weekday, string> = {
  1: "Душанба", 2: "Сешанба", 3: "Чоршанба", 4: "Пайшанба", 5: "Жума", 6: "Шанба", 7: "Якшанба",
};
export const WEEKDAYS_SHORT: Record<Weekday, string> = {
  1: "Ду", 2: "Се", 3: "Чо", 4: "Па", 5: "Жу", 6: "Ша", 7: "Як",
};

/** «2026-11-04» → «4 ноябр 2026» */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 3725 → «1:02:05», 185 → «3:05» */
export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 3725 → «1 соат 2 дақ.» */
export function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} дақ.`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} соат ${r} дақ.` : `${h} соат`;
}

/* ---------- Эфир жадвали: «Ҳозир эфирда» ---------- */

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Тошкент вақти (UTC+5, ёзги вақтга ўтилмайди) */
export function tashkentNow(date = new Date()) {
  const t = new Date(date.getTime() + 5 * 3600 * 1000);
  const jsDay = t.getUTCDay(); // 0 — якшанба
  const day = (jsDay === 0 ? 7 : jsDay) as Weekday;
  return { day, minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/** Слотнинг ҳафта бошидан бошланиши ва тугаши (дақиқада) */
function slotRange(s: ScheduleSlot) {
  const start = (s.day - 1) * 1440 + toMin(s.start);
  let end = (s.day - 1) * 1440 + toMin(s.end);
  if (end <= start) end += 1440; // ярим тундан ўтадиган дастур
  return { start, end };
}

const WEEK = 7 * 1440;

export function onAir(schedule: ScheduleSlot[], date = new Date()) {
  const { day, minutes } = tashkentNow(date);
  const now = (day - 1) * 1440 + minutes;
  const sorted = [...schedule].sort((a, b) => slotRange(a).start - slotRange(b).start);

  let current: ScheduleSlot | null = null;
  let progress = 0;
  for (const s of sorted) {
    const { start, end } = slotRange(s);
    // Якшанбадан душанбага ўтадиган дастурни ҳам ҳисобга оламиз
    for (const shift of [0, -WEEK]) {
      if (now >= start + shift && now < end + shift) {
        current = s;
        progress = (now - start - shift) / (end - start);
      }
    }
  }

  let next: ScheduleSlot | null = null;
  let best = Infinity;
  for (const s of sorted) {
    let diff = slotRange(s).start - now;
    if (diff <= 0) diff += WEEK;
    if (s !== current && diff < best) {
      best = diff;
      next = s;
    }
  }
  return { current, next, progress, minutesToNext: Number.isFinite(best) ? best : null };
}

export function slotsForDay(schedule: ScheduleSlot[], day: Weekday) {
  return schedule.filter((s) => s.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
}
