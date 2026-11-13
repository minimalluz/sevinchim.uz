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
const KEYBOARD = {
  keyboard: [[{ text: BTN_START }, { text: BTN_STOP }], [{ text: BTN_STATUS }]],
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

export async function notifyRecordingFinished(
  r: { ok: true; id: string; title: string; duration: number; note?: string } | { ok: false; error: string },
) {
  if (!r.ok) {
    await notifyAdmins(`⚠️ <b>Ёзув сақланмади</b>\n${esc(r.error)}`);
    return;
  }
  await notifyAdmins(
    `✅ <b>Ёзув сақланди</b>\n${esc(r.title)}\nДавомийлиги: ${formatTime(r.duration)}` +
      (r.note ? `\n\n⚠️ ${esc(r.note)}` : "") +
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

async function statusText() {
  const st = await recorder.recordingStatus();
  if (st.finalizing) return "⏳ Ёзув сақланмоқда…";
  if (st.active) {
    const mb = ((st.bytes ?? 0) / 1048576).toFixed(1);
    return (
      `🔴 <b>Ёзилмоқда</b>: ${esc(st.rubric ?? "")}\n` +
      `Вақт: ${formatTime(st.elapsed ?? 0)} • ${mb} МБ\n` +
      `Автоматик тўхтайди: ${clock((st.startedAt ?? 0) + st.maxSeconds * 1000)} да` +
      (st.connected === false ? "\n⚠️ Оқимга қайта уланмоқда…" : "")
    );
  }
  const c = await getContent();
  const air = onAir(c.schedule);
  const next = air.current ? `Ҳозир эфирда: ${esc(air.current.title)}` : air.next ? `Кейинги эфир: ${esc(air.next.title)}, ${air.next.start}` : "";
  return `⚪ Ёзув кетмаяпти.${c.streams.length ? "" : "\n⚠️ Радио оқими киритилмаган — ёзиш учун админ-панелда «FM оқим» бўлимини тўлдиринг."}\n${next}`;
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
    return void (await send(chat, `Салом! 👋\n\n${BTN_START} — эфирни ёзишни бошлаш\n${BTN_STOP} — тўхтатиш ва сақлаш\n${BTN_STATUS} — ҳозирги ҳолат`, { reply_markup: KEYBOARD }));
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

  if (cmd === "/holat" || text === BTN_STATUS) {
    return void (await send(chat, await statusText(), { reply_markup: KEYBOARD }));
  }

  await send(chat, "Тугмалардан бирини босинг 👇", { reply_markup: KEYBOARD });
}
