import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DATA_DIR, getContent, updateContent } from "./content";
import { formatTime, onAir } from "./format";
import * as recorder from "./recorder";
import { SITE_URL } from "./site";

/**
 * Telegram бот: эфир ёзишни телефондан бир босишда бошқариш.
 *
 * Бот сайтнинг ичида ишлайди (webhook: POST /api/telegram), алоҳида жараён йўқ.
 * Созламалар DATA_DIR/telegram.json да (калит ва рухсат берилган фойдаланувчилар),
 * улар админ-панелдан киритилади. Ботдан фақат уланган админлар фойдалана олади.
 */

type Admin = { id: number; name: string };
type Settings = { token: string; username: string; admins: Admin[] };

const FILE = path.join(DATA_DIR, "telegram.json");
const API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");

export const BTN_START = "● Ёзишни бошлаш";
export const BTN_STOP = "■ Тўхтатиш";
export const BTN_STATUS = "ℹ️ Ҳолат";
export const BTN_FM90_START = "● FM90.8 ёзиш";
export const BTN_FM90_STOP = "■ FM90.8 тўхтатиш";
const KEYBOARD = {
  keyboard: [
    [{ text: BTN_START }, { text: BTN_STOP }],
    [{ text: BTN_FM90_START }, { text: BTN_FM90_STOP }],
    [{ text: BTN_STATUS }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

/* ---------- Созламалар ---------- */

export async function getSettings(): Promise<Settings | null> {
  try {
    const s = JSON.parse(await fs.readFile(FILE, "utf8")) as Settings;
    return s.token ? s : null;
  } catch {
    return null;
  }
}

async function saveSettings(s: Settings | null) {
  if (!s) {
    await fs.unlink(FILE).catch(() => undefined);
    return;
  }
  await fs.writeFile(FILE, JSON.stringify(s, null, 2), { encoding: "utf8", mode: 0o600 });
}

/** Webhook сўровларини текшириш учун махфий калит (сессия калитидан ҳосил қилинади) */
export function webhookSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
  return createHash("sha256").update(base + ":telegram-webhook").digest("hex").slice(0, 48);
}

/* ---------- Telegram API ---------- */

type ApiResult<T> = { ok: boolean; result?: T; description?: string };

async function api<T = unknown>(token: string, method: string, body?: object): Promise<T> {
  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }))) as ApiResult<T>;
  if (!data.ok) throw new Error(data.description || `Telegram хатоси (${method})`);
  return data.result as T;
}

async function send(chatId: number, text: string, extra: object = {}) {
  const s = await getSettings();
  if (!s) return;
  await api(s.token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra }).catch((e) =>
    console.error("[telegram] sendMessage:", (e as Error).message),
  );
}

/** Барча уланган админларга хабар */
export async function notifyAdmins(text: string, extra: object = {}) {
  const s = await getSettings();
  if (!s) return;
  await Promise.all(s.admins.map((a) => send(a.id, text, extra)));
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clock = (ms: number) => new Date(ms + 5 * 3600e3).toISOString().slice(11, 16); // Тошкент

/* ---------- Админ-панел учун амаллар ---------- */

/** Бот калитини текшириш, webhook ва буйруқлар рўйхатини ўрнатиш */
export async function connectBot(token: string) {
  token = token.trim();
  if (!/^\d{5,}:[\w-]{30,}$/.test(token)) throw new Error("Бот калити нотўғри кўринишда (масалан: 123456789:AA…)");
  const me = await api<{ username: string }>(token, "getMe");
  await api(token, "setWebhook", {
    url: `${SITE_URL}/api/telegram`,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await api(token, "setMyCommands", {
    commands: [
      { command: "yoz", description: "Эфирни ёзишни бошлаш" },
      { command: "toxta", description: "Ёзишни тўхтатиш ва сақлаш" },
      { command: "holat", description: "Ҳозирги ҳолат" },
      { command: "fm90_yoz", description: "FM 90.8 ни ёзишни бошлаш" },
      { command: "fm90_toxta", description: "FM 90.8 ёзувини тўхтатиш" },
    ],
  });
  const old = await getSettings();
  // Бошқа бот уланса, эски админлар рўйхати ўчирилади
  const admins = old && old.token === token ? old.admins : [];
  await saveSettings({ token, username: me.username, admins });
  return { username: me.username };
}

export async function disconnectBot() {
  const s = await getSettings();
  if (s) await api(s.token, "deleteWebhook", {}).catch(() => undefined);
  await saveSettings(null);
}

export async function removeAdmin(id: number) {
  const s = await getSettings();
  if (!s) return;
  s.admins = s.admins.filter((a) => a.id !== id);
  await saveSettings(s);
}

/* Улаш коди: админ-панелда кўрсатилади, 10 дақиқа амал қилади, бир марталик */
const g = globalThis as unknown as { __svTgCodes?: Map<string, number> };
const codes = (g.__svTgCodes ??= new Map<string, number>());

export function createLinkCode() {
  const now = Date.now();
  for (const [c, exp] of codes) if (exp < now) codes.delete(c);
  const code = String(randomInt(100000, 1000000));
  codes.set(code, now + 10 * 60 * 1000);
  return code;
}

function useLinkCode(code: string) {
  const exp = codes.get(code);
  if (!exp || exp < Date.now()) return false;
  codes.delete(code);
  return true;
}

/* ---------- Ёзиш тугагач хабар (recorder.ts дан чақирилади) ---------- */

const TG_FILE_LIMIT = 49 * 1024 * 1024; // Bot API орқали юбориш чегараси ~50 МБ

/** Аудио файлни барча админларга юбориш (multipart) */
async function sendAudioToAdmins(file: string, name: string, caption: string) {
  const st = await getSettings();
  if (!st) return;
  const { openAsBlob } = await import("node:fs");
  for (const a of st.admins) {
    try {
      const form = new FormData();
      form.append("chat_id", String(a.id));
      form.append("caption", caption);
      form.append("title", name.replace(/\.mp3$/, ""));
      form.append("audio", await openAsBlob(file, { type: "audio/mpeg" }), name);
      const r = await fetch(`${API}/bot${st.token}/sendAudio`, { method: "POST", body: form, signal: AbortSignal.timeout(300000) });
      const d = (await r.json().catch(() => ({}))) as ApiResult<unknown>;
      if (!d.ok) throw new Error(d.description || `HTTP ${r.status}`);
    } catch (e) {
      console.error("[telegram] sendAudio:", (e as Error).message);
      await send(a.id, `⚠️ Файлни Telegram'га юбориб бўлмади: ${esc((e as Error).message)}`);
    }
  }
}

export async function notifyRecordingFinished(r: recorder.FinishResult) {
  const label = r.channel === "fm90" ? "FM90.8 ёзуви" : "Ёзув";
  if (!r.ok) {
    await notifyAdmins(`⚠️ <b>${label} сақланмади</b>\n${esc(r.error)}`);
    return;
  }
  const warn = r.note ? `\n\n⚠️ ${esc(r.note)}` : "";
  if (r.channel === "fm90") {
    const mb = (r.size / 1048576).toFixed(1);
    const fits = r.size <= TG_FILE_LIMIT;
    await notifyAdmins(
      `✅ <b>FM90.8 ёзуви сақланди</b>\n${esc(r.file)}\nДавомийлиги: ${formatTime(r.duration)} • ${mb} МБ${warn}\n\n` +
        (fits ? "Файл шу ерга юборилмоқда…" : `Файл 50 МБ дан катта — уни админ-панелдан юклаб олинг: ${SITE_URL}/admin`),
    );
    if (fits) await sendAudioToAdmins(r.path, r.file, `FM 90.8 • ${formatTime(r.duration)}`);
    return;
  }
  await notifyAdmins(
    `✅ <b>Ёзув сақланди</b>\n${esc(r.title)}\nДавомийлиги: ${formatTime(r.duration)}${warn}` +
      `\n\nҚоралама сифатида архивда турибди. Тинглаб кўриш: ${SITE_URL}/admin`,
    { reply_markup: { inline_keyboard: [[{ text: "📢 Чоп этиш", callback_data: `pub:${r.id}` }]] } },
  );
}

/* ---------- Кирувчи хабарлар ---------- */

type Update = {
  message?: { chat: { id: number }; from?: { id: number; first_name?: string; username?: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } };
};

async function currentRubric() {
  const c = await getContent();
  const cur = onAir(c.schedule).current;
  if (cur?.own && c.rubrics.includes(cur.title)) return cur.title;
  return c.rubrics[0] ?? "Эфир";
}

function recLine(title: string, st: recorder.RecordingStatus) {
  if (st.finalizing) return `⏳ <b>${title}</b>: сақланмоқда…`;
  if (!st.active) return `⚪ <b>${title}</b>: ёзув кетмаяпти`;
  const mb = ((st.bytes ?? 0) / 1048576).toFixed(1);
  return (
    `🔴 <b>${title}</b>: ёзилмоқда${st.rubric && title !== "FM90.8" ? ` (${esc(st.rubric)})` : ""}\n` +
    `   ${formatTime(st.elapsed ?? 0)} • ${mb} МБ • тўхтайди ${clock((st.startedAt ?? 0) + st.maxSeconds * 1000)} да` +
    (st.connected === false ? "\n   ⚠️ Оқимга қайта уланмоқда…" : "")
  );
}

async function statusText() {
  const [a, b] = await Promise.all([recorder.recordingStatus(), recorder.fm90Status()]);
  const c = await getContent();
  const air = onAir(c.schedule);
  const next = air.current ? `Ҳозир эфирда: ${esc(air.current.title)}` : air.next ? `Кейинги эфир: ${esc(air.next.title)}, ${air.next.start}` : "";
  const { getFm90Settings } = await import("./fm90");
  const fm = await getFm90Settings();
  return [
    recLine("Севинчим эфири", a) + (c.streams.length ? "" : "\n   ⚠️ «FM оқим» манзили киритилмаган"),
    recLine("FM90.8", b) + (fm.streamUrl ? "" : "\n   ⚠️ «FM90.8» оқим манзили киритилмаган"),
    next,
  ].filter(Boolean).join("\n\n");
}

export async function handleUpdate(u: Update) {
  const s = await getSettings();
  if (!s) return;
  const isAdmin = (id?: number) => !!id && s.admins.some((a) => a.id === id);

  /* «Чоп этиш» тугмаси */
  if (u.callback_query) {
    const q = u.callback_query;
    const ack = (text: string) => api(s.token, "answerCallbackQuery", { callback_query_id: q.id, text }).catch(() => undefined);
    if (!isAdmin(q.from.id)) return void (await ack("Рухсат йўқ"));
    const m = /^pub:([\w-]+)$/.exec(q.data || "");
    if (!m) return void (await ack(""));
    let title = "";
    try {
      await updateContent((c) => {
        const ep = c.episodes.find((x) => x.id === m[1]);
        if (!ep) throw new Error("Эшиттириш топилмади (ўчирилган бўлиши мумкин)");
        title = ep.title;
        delete ep.draft;
      });
      revalidatePath("/", "layout");
      await ack("Чоп этилди ✅");
      if (q.message) {
        await api(s.token, "editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
        await send(q.message.chat.id, `📢 «${esc(title)}» сайтда чоп этилди: ${SITE_URL}/arxiv`);
      }
    } catch (e) {
      await ack((e as Error).message.slice(0, 190));
    }
    return;
  }

  const msg = u.message;
  if (!msg?.text || !msg.from) return;
  const chat = msg.chat.id;
  const text = msg.text.trim();
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.replace(/@\w+$/, "").toLowerCase();

  /* Улаш: «/ulash 123456», «/start 123456» ёки шунчаки «123456» */
  const code = /^\d{6}$/.test(text) ? text : /^\/(ulash|start)$/.test(cmd) && /^\d{6}$/.test(rest[0] || "") ? rest[0] : "";
  if (code) {
    if (isAdmin(msg.from.id)) return void (await send(chat, "Сиз аллақачон уланган экансиз ✅", { reply_markup: KEYBOARD }));
    if (!useLinkCode(code)) return void (await send(chat, "❌ Код нотўғри ёки муддати ўтган. Админ-панелда янги код олинг."));
    const fresh = (await getSettings()) ?? s;
    fresh.admins.push({ id: msg.from.id, name: msg.from.first_name || msg.from.username || String(msg.from.id) });
    await saveSettings(fresh);
    return void (await send(chat, "✅ <b>Уландингиз!</b>\nЭнди пастдаги тугмалар билан эфир ёзишни бошқарасиз.", { reply_markup: KEYBOARD }));
  }

  if (!isAdmin(msg.from.id)) {
    return void (await send(
      chat,
      "Бу бот Севинчим сайтининг бошқарув боти.\nУланиш учун админ-панелдаги «Telegram» бўлимидан 6 хонали кодни олиб, шу ерга юборинг.",
    ));
  }

  if (cmd === "/start" || cmd === "/help") {
    return void (await send(chat, `Салом! 👋\n\n${BTN_START} — эфирни ёзишни бошлаш\n${BTN_STOP} — тўхтатиш ва сақлаш\n${BTN_FM90_START} / ${BTN_FM90_STOP} — FM 90.8 ёзуви\n${BTN_STATUS} — ҳозирги ҳолат`, { reply_markup: KEYBOARD }));
  }

  if (cmd === "/yoz" || text === BTN_START) {
    const rubric = cmd === "/yoz" && rest.length ? rest.join(" ") : await currentRubric();
    try {
      await recorder.startRecording(rubric);
      const st = await recorder.recordingStatus();
      await send(chat, `🔴 <b>Ёзиш бошланди</b>: ${esc(rubric)}\nАвтоматик тўхтайди: ${clock((st.startedAt ?? Date.now()) + st.maxSeconds * 1000)} да.\nТўхтатиш учун «${BTN_STOP}» ни босинг.`, { reply_markup: KEYBOARD });
    } catch (e) {
      await send(chat, `❌ ${esc((e as Error).message)}`, { reply_markup: KEYBOARD });
    }
    return;
  }

  if (cmd === "/toxta" || text === BTN_STOP) {
    const st = await recorder.recordingStatus();
    if (!st.active) return void (await send(chat, "Ҳозир ёзув кетмаяпти.", { reply_markup: KEYBOARD }));
    await send(chat, "⏳ Тўхтатилмоқда ва сақланмоқда…");
    // Фонда: сақлаш бир неча сония олади. Натижа хабари notifyRecordingFinished орқали келади
    void recorder.stopRecording().catch((e) => send(chat, `❌ ${esc((e as Error).message)}`));
    return;
  }

  if (cmd === "/fm90_yoz" || text === BTN_FM90_START) {
    try {
      await recorder.startFm90();
      const st = await recorder.fm90Status();
      await send(chat, `🔴 <b>FM90.8 ёзиш бошланди</b>\nАвтоматик тўхтайди: ${clock((st.startedAt ?? Date.now()) + st.maxSeconds * 1000)} да.\nТўхтатиш учун «${BTN_FM90_STOP}» ни босинг.`, { reply_markup: KEYBOARD });
    } catch (e) {
      await send(chat, `❌ FM90.8: ${esc((e as Error).message)}`, { reply_markup: KEYBOARD });
    }
    return;
  }

  if (cmd === "/fm90_toxta" || text === BTN_FM90_STOP) {
    const st = await recorder.fm90Status();
    if (!st.active) return void (await send(chat, "FM90.8 ёзуви ҳозир кетмаяпти.", { reply_markup: KEYBOARD }));
    await send(chat, "⏳ FM90.8 тўхтатилмоқда ва сақланмоқда…");
    void recorder.stopFm90().catch((e) => send(chat, `❌ ${esc((e as Error).message)}`));
    return;
  }

  if (cmd === "/holat" || text === BTN_STATUS) {
    return void (await send(chat, await statusText(), { reply_markup: KEYBOARD }));
  }

  await send(chat, "Тугмалардан бирини босинг 👇", { reply_markup: KEYBOARD });
}
