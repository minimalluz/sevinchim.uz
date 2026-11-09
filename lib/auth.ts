import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sv_admin";
const MAX_AGE = 60 * 60 * 12; // 12 соат

function secret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD ёки SESSION_SECRET ўрнатилмаган");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

export function checkPassword(input: string) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return false;
  // Узунликни яшириш учун ҳар иккисини хешлаб солиштирамиз
  return safeEqual(sign("pw:" + input), sign("pw:" + pass));
}

export async function createSession() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  const jar = await cookies();
  jar.set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!adminConfigured()) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Рухсат йўқ");
}

/* Оддий ҳимоя: битта IP дан кўп нотўғри уринишларни секинлатамиз */
const attempts = new Map<string, { n: number; until: number }>();
export function loginThrottle(ip: string) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return false;
  return true;
}
export function loginFailed(ip: string) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 5) {
    a.until = Date.now() + 10 * 60 * 1000;
    a.n = 0;
  }
  attempts.set(ip, a);
}
