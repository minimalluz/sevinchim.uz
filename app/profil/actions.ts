"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as users from "@/lib/users";

export type FormState = {
  ok?: boolean; error?: string; message?: string; step?: "code"; identifier?: string; url?: string;
  /** Хатодан кейин майдонлар бўшаб қолмаслиги учун (паролсиз) */
  values?: Record<string, string>;
} | null;

/** Киритилган қийматлар (пароллардан ташқари) */
const keep = (fd: FormData, ...keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(fd, k, 200)]));

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").slice(0, max);
const fail = (e: unknown): FormState => ({
  error: e instanceof users.UserError ? e.message : (console.error("[profil]", e), "Хатолик юз берди. Бироздан кейин қайта уриниб кўринг."),
});
/** Фақат сайт ичидаги манзилга қайтамиз */
const safeNext = (v: string) => (/^\/(?!\/)[\w\-/?=&.%]*$/.test(v) ? v : "/profil");

/* ---------- Рўйхатдан ўтиш ва кириш ---------- */

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  let next = "/profil";
  try {
    const ip = await users.clientIp();
    const t = users.throttle(`reg:${ip}`, 10, 60 * 60e3);
    if (fd.get("agree") !== "on") throw new users.UserError("Фойдаланиш шартларига розилигингизни белгиланг");
    if (str(fd, "password") !== str(fd, "password2")) throw new users.UserError("Пароллар бир хил эмас");
    t.fail(); // ҳар бир рўйхатдан ўтиш уриниши ҳисобланади (спамдан ҳимоя)
    const id = await users.registerUser({
      name: str(fd, "name", 120),
      phone: str(fd, "phone", 40),
      login: str(fd, "login", 40),
      email: str(fd, "email", 200),
      password: str(fd, "password"),
    });
    await users.startSession(id);
    next = safeNext(str(fd, "next"));
  } catch (e) {
    return { ...fail(e), values: keep(fd, "name", "phone", "login", "email") };
  }
  redirect(next);
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let next = "/profil";
  try {
    const ip = await users.clientIp();
    const identifier = str(fd, "identifier", 60).trim();
    const byIp = users.throttle(`login-ip:${ip}`, 20, 15 * 60e3);
    const byId = users.throttle(`login:${identifier.toLowerCase()}`, 5, 15 * 60e3);
    try {
      const u = await users.authenticate(identifier, str(fd, "password"));
      await users.startSession(u.id);
      byId.ok();
    } catch (e) {
      byIp.fail();
      byId.fail();
      throw e;
    }
    next = safeNext(str(fd, "next"));
  } catch (e) {
    return { ...fail(e), values: keep(fd, "identifier") };
  }
  redirect(next);
}

export async function logoutAction() {
  await users.endSession();
  redirect("/profil");
}

/* ---------- Шахсий кабинет ---------- */

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const u = await users.requireUser();
    await users.updateProfile(u.id, { name: str(fd, "name", 120), login: str(fd, "login", 40), email: str(fd, "email", 200) });
    revalidatePath("/profil");
    return { ok: true, message: "Маълумотлар сақланди" };
  } catch (e) {
    return fail(e);
  }
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const u = await users.requireUser();
    const t = users.throttle(`pw:${u.id}`, 5, 15 * 60e3);
    if (str(fd, "next") !== str(fd, "next2")) throw new users.UserError("Янги пароллар бир хил эмас");
    // Бошқа қурилмалардаги сессиялар ёпилади, жорий сессия қолади
    const keep = await users.currentToken();
    try {
      await users.changePassword(u.id, str(fd, "current"), str(fd, "next"), keep);
    } catch (e) {
      t.fail();
      throw e;
    }
    return { ok: true, message: "Пароль ўзгартирилди. Бошқа қурилмалардан чиқиб кетилди." };
  } catch (e) {
    return fail(e);
  }
}

/** Telegram'ни улаш ҳаволаси (20 дақиқа амал қилади) */
export async function telegramLinkAction(): Promise<FormState> {
  try {
    const u = await users.requireUser();
    const { botUsername } = await import("@/lib/telegram");
    const bot = await botUsername();
    if (!bot) throw new users.UserError("Telegram бот ҳали созланмаган. Кейинроқ уриниб кўринг.");
    const token = users.createToken(u.id, "tg_link", 20 * 60e3);
    return { ok: true, url: `https://t.me/${bot}?start=u_${token}` };
  } catch (e) {
    return fail(e);
  }
}

export async function telegramUnlinkAction(): Promise<FormState> {
  try {
    const u = await users.requireUser();
    users.unlinkTelegram(u.id);
    revalidatePath("/profil");
    return { ok: true, message: "Telegram узилди" };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Паролни тиклаш (SMS'сиз) ---------- */

/** 1-қадам: телефон/логин → уланган Telegram'га 6 хонали код */
export async function requestResetAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const ip = await users.clientIp();
    users.throttle(`reset-ip:${ip}`, 10, 60 * 60e3).fail();
    const identifier = str(fd, "identifier", 60).trim();
    if (!identifier) throw new users.UserError("Телефон рақами ёки логинни киритинг");
    const u = users.findByIdentifier(identifier);
    // Аккаунт борлиги ёки Telegram уланганлиги ошкор қилинмайди — жавоб бир хил
    if (u && u.tg_id && !u.blocked) {
      const code = users.createResetCode(u.id);
      const { sendToChat } = await import("@/lib/telegram");
      await sendToChat(
        u.tg_id,
        `🔐 <b>Паролни тиклаш коди: ${code}</b>\nКод 15 дақиқа амал қилади.\nАгар буни сиз сўрамаган бўлсангиз, ҳеч кимга кўрсатманг.`,
      );
    }
    return { step: "code", identifier };
  } catch (e) {
    return fail(e);
  }
}

/** 2-қадам: код + янги пароль */
export async function resetWithCodeAction(_: FormState, fd: FormData): Promise<FormState> {
  const identifier = str(fd, "identifier", 60).trim();
  try {
    const ip = await users.clientIp();
    users.throttle(`reset-code-ip:${ip}`, 15, 60 * 60e3).fail();
    if (str(fd, "password") !== str(fd, "password2")) throw new users.UserError("Пароллар бир хил эмас");
    users.checkPasswordStrength(str(fd, "password"));
    const u = users.findByIdentifier(identifier);
    if (!u || u.blocked || !users.useResetCode(u.id, str(fd, "code", 10))) throw new users.UserError("Код нотўғри ёки муддати ўтган");
    await users.setPassword(u.id, str(fd, "password"));
    await users.startSession(u.id);
  } catch (e) {
    return { ...fail(e), step: "code", identifier };
  }
  redirect("/profil?tiklandi=1");
}

/** Администратор берган ҳавола орқали (Telegram уланмаган фойдаланувчилар учун) */
export async function resetWithLinkAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    if (str(fd, "password") !== str(fd, "password2")) throw new users.UserError("Пароллар бир хил эмас");
    users.checkPasswordStrength(str(fd, "password"));
    const uid = users.checkToken("reset_link", str(fd, "token", 100), true);
    if (!uid) throw new users.UserError("Ҳавола эскирган ёки ишлатилган. Администратордан янгисини сўранг.");
    await users.setPassword(uid, str(fd, "password"));
    await users.startSession(uid);
  } catch (e) {
    return fail(e);
  }
  redirect("/profil?tiklandi=1");
}
