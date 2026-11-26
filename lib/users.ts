import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { db, tx } from "./db";

/**
 * «Менинг профилим»: тингловчи аккаунтлари.
 *
 *  • Пароль — scrypt хэши (тузли), ўзи сақланмайди.
 *  • Сессия — тасодифий калит cookie'да (httpOnly), базада фақат унинг хэши.
 *  • Premium — premium_until вақтигача (ms). Муддат ўтгач ҳуқуқ ЎЗИ йўқолади:
 *    ҳар бир текширувда premium_until > ҳозир солиштирилади.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "sv_user";
const SESSION_DAYS = 30;
export const DAY_MS = 86400e3;

export type UserRow = {
  id: number;
  name: string;
  phone: string;
  login: string | null;
  email: string | null;
  pass: string;
  created_at: number;
  last_login: number | null;
  blocked: number;
  premium_from: number | null;
  premium_until: number | null;
  expiry_notice: number | null;
  tg_id: number | null;
  tg_name: string | null;
};

/** Бошқа жойларга (браузерга) бериладиган хавфсиз кўриниш */
export type PublicUser = {
  id: number;
  name: string;
  phone: string;
  login: string | null;
  email: string | null;
  createdAt: number;
  premium: boolean;
  premiumFrom: number | null;
  premiumUntil: number | null;
  telegram: string | null;
};

export const isPremium = (u: Pick<UserRow, "premium_until" | "blocked"> | null | undefined, now = Date.now()) =>
  Boolean(u && !u.blocked && u.premium_until && u.premium_until > now);

export function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    login: u.login,
    email: u.email,
    createdAt: u.created_at,
    premium: isPremium(u),
    premiumFrom: u.premium_from,
    premiumUntil: u.premium_until,
    telegram: u.tg_id ? u.tg_name || "уланган" : null,
  };
}

/* ---------- Текширувлар ---------- */

export class UserError extends Error {}

/** «+998 90 123-45-67», «901234567», «998901234567» → «+998901234567» */
export function normalizePhone(raw: string): string | null {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  const digits = d.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits) && !d.startsWith("+")) return "+998" + digits;
  if (/^998\d{9}$/.test(digits)) return "+" + digits;
  // Хориждаги тингловчилар: халқаро формат
  if (d.startsWith("+") && /^\d{10,15}$/.test(digits)) return "+" + digits;
  return null;
}

export function formatPhone(p: string) {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+998 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : p;
}

const LOGIN_RE = /^[a-z][a-z0-9_.]{2,31}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function cleanName(v: string) {
  const name = String(v || "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 80) throw new UserError("Исм ва фамилияни тўлиқ киритинг");
  return name;
}

function cleanLogin(v: string | null | undefined) {
  const login = String(v || "").trim();
  if (!login) return null;
  if (!LOGIN_RE.test(login)) throw new UserError("Логин 3–32 белги: лотин ҳарфидан бошлансин, фақат ҳарф, рақам, «_» ва «.»");
  return login.toLowerCase();
}

function cleanEmail(v: string | null | undefined) {
  const email = String(v || "").trim().toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email)) throw new UserError("Электрон почта нотўғри");
  return email;
}

export function checkPasswordStrength(pw: string) {
  if (typeof pw !== "string" || pw.length < 8) throw new UserError("Пароль камида 8 белгидан иборат бўлсин");
  if (pw.length > 200) throw new UserError("Пароль жуда узун");
}

/* ---------- Пароль ---------- */

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(pw: string, stored: string) {
  const [v, salt, key] = stored.split("$");
  if (v !== "s1" || !salt || !key) return false;
  const k = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), k.length);
  return timingSafeEqual(got, k);
}

/** Йўқ фойдаланувчи учун ҳам вақт сарфлаймиз — телефон рақами базада борлиги билинмасин */
const DUMMY = "s1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

/* ---------- Кўп уринишлардан ҳимоя ---------- */

const g = globalThis as unknown as { __svThrottle?: Map<string, { n: number; until: number; first: number }> };
const hits = (g.__svThrottle ??= new Map());

/** key бўйича window ичида limit тадан кўп уриниш бўлса — блоклаймиз */
export function throttle(key: string, limit = 5, windowMs = 10 * 60e3) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now && now - v.first > windowMs) hits.delete(k);
  const h = hits.get(key);
  if (h && h.until > now) {
    const min = Math.ceil((h.until - now) / 60e3);
    throw new UserError(`Уринишлар жуда кўп. ${min} дақиқадан кейин қайта уриниб кўринг.`);
  }
  return {
    fail() {
      const x = hits.get(key);
      const cur = !x || now - x.first > windowMs ? { n: 0, until: 0, first: now } : x;
      cur.n += 1;
      if (cur.n >= limit) cur.until = Date.now() + windowMs;
      hits.set(key, cur);
    },
    ok() {
      hits.delete(key);
    },
  };
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/* ---------- Фойдаланувчилар ---------- */

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export function getUser(id: number) {
  return db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function findByIdentifier(raw: string) {
  const v = String(raw || "").trim();
  const phone = normalizePhone(v);
  if (phone) {
    const u = db().prepare("SELECT * FROM users WHERE phone = ?").get(phone) as UserRow | undefined;
    if (u) return u;
  }
  if (LOGIN_RE.test(v)) return db().prepare("SELECT * FROM users WHERE login = ?").get(v.toLowerCase()) as UserRow | undefined;
  return undefined;
}

export async function registerUser(input: { name: string; phone: string; login?: string; email?: string; password: string }) {
  const name = cleanName(input.name);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError("Телефон рақами нотўғри. Масалан: 90 123 45 67");
  const login = cleanLogin(input.login);
  const email = cleanEmail(input.email);
  checkPasswordStrength(input.password);
  const pass = await hashPassword(input.password);
  return tx(() => {
    if (db().prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) {
      throw new UserError("Бу телефон рақами билан аккаунт аллақачон очилган. «Кириш» бўлимидан киринг.");
    }
    if (login && db().prepare("SELECT 1 FROM users WHERE login = ?").get(login)) throw new UserError("Бу логин банд, бошқасини танланг");
    const r = db()
      .prepare("INSERT INTO users(name, phone, login, email, pass, created_at) VALUES(?, ?, ?, ?, ?, ?)")
      .run(name, phone, login, email, pass, Date.now());
    return Number(r.lastInsertRowid);
  });
}

export async function authenticate(identifier: string, password: string) {
  const u = findByIdentifier(identifier);
  const ok = await verifyPassword(String(password || ""), u?.pass ?? DUMMY);
  if (!u || !ok) throw new UserError("Телефон (ёки логин) ёки пароль нотўғри");
  if (u.blocked) throw new UserError("Аккаунтингиз блокланган. Администраторга мурожаат қилинг.");
  return u;
}

export async function updateProfile(id: number, input: { name: string; login?: string; email?: string }) {
  const name = cleanName(input.name);
  const login = cleanLogin(input.login);
  const email = cleanEmail(input.email);
  tx(() => {
    if (login && db().prepare("SELECT 1 FROM users WHERE login = ? AND id != ?").get(login, id)) {
      throw new UserError("Бу логин банд, бошқасини танланг");
    }
    db().prepare("UPDATE users SET name = ?, login = ?, email = ? WHERE id = ?").run(name, login, email, id);
  });
}

export async function changePassword(id: number, current: string, next: string, keepToken?: string) {
  const u = getUser(id);
  if (!u || !(await verifyPassword(String(current || ""), u.pass))) throw new UserError("Жорий пароль нотўғри");
  checkPasswordStrength(next);
  await setPassword(id, next, keepToken);
}

/** Паролни ўрнатиш: бошқа барча сессиялар ёпилади */
export async function setPassword(id: number, next: string, keepToken?: string) {
  checkPasswordStrength(next);
  const pass = await hashPassword(next);
  tx(() => {
    db().prepare("UPDATE users SET pass = ? WHERE id = ?").run(pass, id);
    db().prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(id, keepToken ? sha(keepToken) : "");
    db().prepare("DELETE FROM tokens WHERE user_id = ? AND kind IN ('reset_code', 'reset_link')").run(id);
  });
}

/* ---------- Сессиялар ---------- */

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db().prepare("INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)").run(sha(token), userId, now, now + SESSION_DAYS * DAY_MS);
  db().prepare("UPDATE users SET last_login = ? WHERE id = ?").run(now, userId);
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  // HTTPS орқали келган сўровда (nginx: X-Forwarded-Proto) — фақат HTTPS cookie
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) db().prepare("DELETE FROM sessions WHERE token = ?").run(sha(t));
  jar.delete(COOKIE);
}

/** Жорий фойдаланувчи (cookie орқали). Блокланган бўлса — null. */
export async function currentUser(): Promise<UserRow | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t || t.length > 100) return null;
  const u = db()
    .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?")
    .get(sha(t), Date.now()) as UserRow | undefined;
  if (!u || u.blocked) return null;
  return u;
}

export async function currentToken() {
  return (await cookies()).get(COOKIE)?.value;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new UserError("Аввал тизимга киринг");
  return u;
}

/* ---------- Бир марталик калитлар: пароль тиклаш ва Telegram улаш ---------- */

export type TokenKind = "reset_code" | "reset_link" | "tg_link";

export function createToken(userId: number, kind: TokenKind, ttlMs: number, value?: string) {
  const token = value ?? randomBytes(24).toString("base64url");
  db().prepare("DELETE FROM tokens WHERE user_id = ? AND kind = ?").run(userId, kind);
  db().prepare("DELETE FROM tokens WHERE expires_at < ?").run(Date.now());
  db().prepare("INSERT INTO tokens(token, kind, user_id, expires_at) VALUES(?, ?, ?, ?)").run(sha(kind + ":" + token), kind, userId, Date.now() + ttlMs);
  return token;
}

/** Калитни текшириш; consume=true бўлса ишлатилгач ўчади */
export function checkToken(kind: TokenKind, token: string, consume: boolean) {
  const key = sha(kind + ":" + String(token || ""));
  const r = db().prepare("SELECT user_id, expires_at FROM tokens WHERE token = ? AND kind = ?").get(key, kind) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!r || r.expires_at < Date.now()) return null;
  if (consume) db().prepare("DELETE FROM tokens WHERE token = ?").run(key);
  return r.user_id;
}

/** Тиклаш коди (Telegram орқали): 6 рақам, 15 дақиқа, 5 та хато уринишдан кейин бекор */
export function createResetCode(userId: number) {
  const code = String(randomInt(100000, 1000000));
  createToken(userId, "reset_code", 15 * 60e3, `${userId}:${code}`);
  return code;
}

export function useResetCode(userId: number, code: string) {
  const key = sha(`reset_code:${userId}:${String(code || "").trim()}`);
  const row = db().prepare("SELECT expires_at FROM tokens WHERE token = ?").get(key) as { expires_at: number } | undefined;
  if (row && row.expires_at > Date.now()) {
    db().prepare("DELETE FROM tokens WHERE token = ?").run(key);
    return true;
  }
  // Нотўғри код — уринишлар ҳисоби
  const t = db().prepare("SELECT token, attempts FROM tokens WHERE user_id = ? AND kind = 'reset_code'").get(userId) as
    | { token: string; attempts: number }
    | undefined;
  if (t) {
    if (t.attempts + 1 >= 5) db().prepare("DELETE FROM tokens WHERE token = ?").run(t.token);
    else db().prepare("UPDATE tokens SET attempts = attempts + 1 WHERE token = ?").run(t.token);
  }
  return false;
}

/* ---------- Telegram ---------- */

export function linkTelegram(userId: number, tgId: number, tgName: string) {
  tx(() => {
    // Бир Telegram — битта аккаунт
    db().prepare("UPDATE users SET tg_id = NULL, tg_name = NULL WHERE tg_id = ? AND id != ?").run(tgId, userId);
    db().prepare("UPDATE users SET tg_id = ?, tg_name = ? WHERE id = ?").run(tgId, tgName, userId);
  });
}

export function unlinkTelegram(userId: number) {
  db().prepare("UPDATE users SET tg_id = NULL, tg_name = NULL WHERE id = ?").run(userId);
}

export function findByTelegram(tgId: number) {
  return db().prepare("SELECT * FROM users WHERE tg_id = ?").get(tgId) as UserRow | undefined;
}
