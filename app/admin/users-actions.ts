"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import * as premium from "@/lib/premium";
import { UserError, formatPhone, getUser, isPremium } from "@/lib/users";
import { SITE_URL } from "@/lib/site";
import type { ActionResult } from "./actions";

/** Админ: фойдаланувчилар, тўловлар, Premium созламалари, статистика, журнал */

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

async function run(fn: (ip: string) => unknown, message = "Сақланди"): Promise<ActionResult> {
  try {
    await requireAdmin();
    await fn(await ip());
    return { ok: true, message };
  } catch (e) {
    if (!(e instanceof UserError) && !(e instanceof Error && e.message === "Рухсат йўқ")) console.error("[admin]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

const FILTERS = ["all", "premium", "free", "expired", "blocked"] as const;
const STATUSES = ["all", "pending", "approved", "rejected"] as const;

/* ---------- Фойдаланувчилар ---------- */

export async function listUsersAction(q: string, filter: string, page: number) {
  await requireAdmin();
  const f = (FILTERS as readonly string[]).includes(filter) ? (filter as (typeof FILTERS)[number]) : "all";
  const r = premium.listUsers(String(q || "").slice(0, 60), f, Math.max(1, Math.floor(Number(page) || 1)));
  return { total: r.total, rows: r.rows.map((u) => ({ ...u, phone: formatPhone(u.phone) })), now: Date.now() };
}

export async function userDetailAction(id: number) {
  await requireAdmin();
  const u = getUser(Number(id));
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    phone: formatPhone(u.phone),
    login: u.login,
    email: u.email,
    createdAt: u.created_at,
    lastLogin: u.last_login,
    blocked: Boolean(u.blocked),
    premium: isPremium(u),
    premiumFrom: u.premium_from,
    premiumUntil: u.premium_until,
    telegram: u.tg_id ? u.tg_name || "уланган" : null,
    payments: premium.userPayments(u.id),
  };
}

export async function setBlockedAction(id: number, blocked: boolean) {
  return run((ip) => premium.adminSetBlocked(Number(id), Boolean(blocked), ip), blocked ? "Блокланди" : "Блокдан чиқарилди");
}

/** until: «ЙЙЙЙ-ОО-ККТСС:ДД» (Тошкент вақти) ёки бўш — FREE қилиш */
export async function setPremiumUntilAction(id: number, until: string) {
  return run((ip) => {
    let ms: number | null = null;
    if (until) {
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(until));
      if (!m) throw new UserError("Сана ва вақт нотўғри");
      ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 5 * 3600e3;
      if (ms <= Date.now()) throw new UserError("Тугаш вақти келажакда бўлсин (FREE қилиш учун «FREE қилиш» тугмаси)");
    }
    premium.adminSetPremiumUntil(Number(id), ms, ip);
  }, until ? "Premium муддати ўрнатилди" : "Аккаунт FREE қилинди");
}

export async function extendPremiumAction(id: number, days: number) {
  return run((ip) => premium.adminExtendPremium(Number(id), Number(days), ip), `Premium ${days} кунга узайтирилди`);
}

export async function resetLinkAction(id: number): Promise<ActionResult & { url?: string }> {
  try {
    await requireAdmin();
    const token = premium.adminResetLink(Number(id), await ip());
    return { ok: true, url: `${SITE_URL}/profil/tiklash?t=${token}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Хатолик" };
  }
}

/* ---------- Тўловлар ---------- */

export async function listPaymentsAction(status: string, page: number) {
  await requireAdmin();
  const s = (STATUSES as readonly string[]).includes(status) ? (status as (typeof STATUSES)[number]) : "all";
  const r = premium.listPayments(s, Math.max(1, Math.floor(Number(page) || 1)));
  return { total: r.total, rows: r.rows.map((p) => ({ ...p, user_phone: formatPhone(p.user_phone) })) };
}

export async function approvePaymentAction(id: number) {
  return run((ip) => premium.approvePayment(Number(id), "admin", ip), "Тўлов тасдиқланди — Premium фаоллашди");
}

export async function rejectPaymentAction(id: number, reason: string) {
  return run((ip) => premium.rejectPayment(Number(id), String(reason || ""), "admin", ip), "Тўлов рад этилди");
}

/* ---------- Premium созламалари ---------- */

export async function getPremiumSettingsAction() {
  await requireAdmin();
  return premium.getPremiumSettings();
}

export async function savePremiumSettingsAction(s: premium.PremiumSettings) {
  return run((ip) => premium.savePremiumSettings(s, ip));
}

/* ---------- Статистика ва журнал ---------- */

export async function statsAction() {
  await requireAdmin();
  return premium.stats();
}

export async function auditAction() {
  await requireAdmin();
  return premium.auditLog(200);
}
