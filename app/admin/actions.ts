"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUDIO_DIR, updateContent } from "@/lib/content";
import { SAFE_NAME } from "@/lib/audio";
import * as recorder from "@/lib/recorder";
import * as telegram from "@/lib/telegram";
import {
  checkPassword, createSession, destroySession, loginFailed, loginThrottle, requireAdmin,
} from "@/lib/auth";
import type { Announcement, Episode, LiveFallback, ScheduleSlot, StreamQuality, Weekday } from "@/lib/types";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/* ---------- Текширувчи ёрдамчилар ---------- */
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v);
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function refresh() {
  revalidatePath("/", "layout");
}

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult> {
  try {
    await requireAdmin();
    await fn();
    refresh();
    return { ok: true, message: "Сақланди" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик юз берди" };
  }
}

/* ---------- Кириш / чиқиш ---------- */
export async function login(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  if (!loginThrottle(ip)) return { ok: false, error: "Жуда кўп уриниш. 10 дақиқадан сўнг қайта уриниб кўринг." };
  if (!checkPassword(str(form.get("password"), 200))) {
    loginFailed(ip);
    return { ok: false, error: "Парол нотўғри" };
  }
  await createSession();
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin");
}

/* ---------- FM радио оқими ---------- */
export async function saveStreams(input: StreamQuality[], fallback: LiveFallback | null): Promise<ActionResult> {
  return guard(async () => {
    const streams = (Array.isArray(input) ? input : [])
      .map((s) => ({
        id: s.id && !String(s.id).startsWith("new-") ? str(s.id, 40) : newId("q"),
        label: str(s.label, 60),
        bitrate: str(s.bitrate, 30),
        url: str(s.url, 1000),
      }))
      // Бутунлай бўш қатор — эътиборсиз
      .filter((s) => s.label || s.bitrate || s.url);
    for (const s of streams) {
      if (!s.label) throw new Error("Сифат номини киритинг");
      if (!isUrl(s.url)) throw new Error(`Нотўғри манзил: ${s.url || "(бўш)"}`);
    }
    const fbUrl = str(fallback?.url, 1000);
    const fbLabel = str(fallback?.label, 60);
    if (fbUrl && !isUrl(fbUrl)) throw new Error(`Нотўғри ҳавола: ${fbUrl}`);
    if (fbUrl && !fbLabel) throw new Error("Муқобил платформа номини киритинг");
    await updateContent((c) => {
      c.streams = streams;
      c.liveFallback = fbUrl ? { label: fbLabel, url: fbUrl } : null;
    });
  });
}

/* ---------- Эфир жадвали ---------- */
export async function saveSchedule(input: ScheduleSlot[]): Promise<ActionResult> {
  return guard(async () => {
    const slots = (Array.isArray(input) ? input : []).map((s) => {
      const day = Number(s.day);
      const slot: ScheduleSlot = {
        id: str(s.id, 40) || newId("s"),
        day: (day >= 1 && day <= 7 ? day : 1) as Weekday,
        start: str(s.start, 5),
        end: str(s.end, 5),
        title: str(s.title, 120),
        own: Boolean(s.own),
      };
      if (!slot.title) throw new Error("Дастур номини киритинг");
      if (!isTime(slot.start) || !isTime(slot.end)) throw new Error(`«${slot.title}»: вақт нотўғри (ЧЧ:ДД)`);
      return slot;
    });
    await updateContent((c) => { c.schedule = slots; });
  });
}

/* ---------- Архив ---------- */
function cleanEpisode(e: Partial<Episode>): Omit<Episode, "id"> {
  const ep = {
    title: str(e.title, 200),
    rubric: str(e.rubric, 80),
    date: str(e.date, 10),
    duration: Math.max(0, Math.round(Number(e.duration) || 0)),
    description: str(e.description, 2000),
    audio: str(e.audio, 1000),
  };
  if (!ep.title) throw new Error("Эшиттириш номини киритинг");
  if (!ep.rubric) throw new Error("Рукнни танланг");
  if (!isDate(ep.date)) throw new Error("Сана нотўғри");
  if (!ep.audio.startsWith("/api/audio/") && !isUrl(ep.audio)) throw new Error("Аудио файл юкланмаган");
  return ep;
}

export async function addEpisode(input: Partial<Episode>): Promise<ActionResult> {
  return guard(async () => {
    const ep = cleanEpisode(input);
    await updateContent((c) => {
      c.episodes.unshift({ id: newId("e"), ...ep });
      if (!c.rubrics.includes(ep.rubric)) c.rubrics.push(ep.rubric);
    });
  });
}

export async function updateEpisode(id: string, input: Partial<Episode>): Promise<ActionResult> {
  return guard(async () => {
    const ep = cleanEpisode(input);
    await updateContent((c) => {
      const i = c.episodes.findIndex((x) => x.id === id);
      if (i < 0) throw new Error("Эшиттириш топилмади");
      // Қоралама белгиси таҳрирда сақланади (чоп этиш — алоҳида амал)
      c.episodes[i] = { id, ...ep, ...(c.episodes[i].draft ? { draft: true } : {}) };
      if (!c.rubrics.includes(ep.rubric)) c.rubrics.push(ep.rubric);
    });
  });
}

/** Қораламани сайтда чоп этиш */
export async function publishEpisode(id: string): Promise<ActionResult> {
  return guard(async () => {
    await updateContent((c) => {
      const ep = c.episodes.find((x) => x.id === id);
      if (!ep) throw new Error("Эшиттириш топилмади");
      delete ep.draft;
    });
  });
}

/* ---------- Telegram бот ---------- */
export type TelegramInfo = { connected: boolean; username?: string; admins: { id: number; name: string }[] };

export async function telegramInfoAction(): Promise<TelegramInfo | null> {
  try {
    await requireAdmin();
    const s = await telegram.getSettings();
    return s ? { connected: true, username: s.username, admins: s.admins } : { connected: false, admins: [] };
  } catch {
    return null;
  }
}

export async function telegramConnectAction(token: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { username } = await telegram.connectBot(str(token, 200));
    return { ok: true, message: `@${username} уланди` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

export async function telegramDisconnectAction(): Promise<ActionResult> {
  try {
    await requireAdmin();
    await telegram.disconnectBot();
    return { ok: true, message: "Бот узилди" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

export async function telegramLinkCodeAction(): Promise<{ code: string } | null> {
  try {
    await requireAdmin();
    return { code: telegram.createLinkCode() };
  } catch {
    return null;
  }
}

export async function telegramRemoveAdminAction(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    await telegram.removeAdmin(Number(id));
    return { ok: true, message: "Ўчирилди" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

/* ---------- Эфирни ёзиб олиш ---------- */
export async function startRecordingAction(rubric: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await recorder.startRecording(str(rubric, 80));
    return { ok: true, message: "Ёзиш бошланди" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

export async function stopRecordingAction(): Promise<ActionResult> {
  try {
    await requireAdmin();
    await recorder.stopRecording();
    return { ok: true, message: "Ёзиш тўхтатилди — архивга қоралама бўлиб тушди" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

export async function recordingStatusAction(): Promise<recorder.RecordingStatus | null> {
  try {
    await requireAdmin();
    return await recorder.recordingStatus();
  } catch {
    return null;
  }
}

export async function deleteEpisode(id: string): Promise<ActionResult> {
  return guard(async () => {
    let removed: Episode | undefined;
    const content = await updateContent((c) => {
      removed = c.episodes.find((x) => x.id === id);
      c.episodes = c.episodes.filter((x) => x.id !== id);
    });
    // Бошқа эшиттиришда ишлатилмаса — аудио файлни ҳам ўчирамиз (демо файллар қолади)
    const file = removed?.audio.startsWith("/api/audio/") ? removed.audio.slice("/api/audio/".length) : "";
    if (file && SAFE_NAME.test(file) && !file.startsWith("demo-") && !content.episodes.some((e) => e.audio === removed!.audio)) {
      await fs.unlink(path.join(AUDIO_DIR, file)).catch(() => undefined);
    }
  });
}

export async function saveRubrics(input: string[]): Promise<ActionResult> {
  return guard(async () => {
    const list = [...new Set((Array.isArray(input) ? input : []).map((r) => str(r, 80)).filter(Boolean))];
    await updateContent((c) => {
      // Ишлатилаётган рукнлар ўчиб кетмаслиги керак
      for (const e of c.episodes) if (!list.includes(e.rubric)) list.push(e.rubric);
      c.rubrics = list;
    });
  });
}

/* ---------- Анонслар ---------- */
export async function saveAnnouncements(input: Announcement[]): Promise<ActionResult> {
  return guard(async () => {
    const list = (Array.isArray(input) ? input : []).map((a) => {
      const item = { id: str(a.id, 40) || newId("a"), title: str(a.title, 200), date: str(a.date, 10), text: str(a.text, 1000) };
      if (!item.title) throw new Error("Анонс сарлавҳасини киритинг");
      if (!isDate(item.date)) throw new Error(`«${item.title}»: сана нотўғри`);
      return item;
    });
    list.sort((a, b) => b.date.localeCompare(a.date));
    await updateContent((c) => { c.announcements = list; });
  });
}
