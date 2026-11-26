import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_DIR } from "./content";
import { audit, db, getSetting, setSetting, tx } from "./db";
import { DAY_MS, UserError, createToken, getUser, isPremium, type UserRow } from "./users";

/**
 * Premium обуна ва тўловлар.
 *
 * Ҳозирги тўлов усули — картага ўтказма: фойдаланувчи чек юклайди, админ
 * тасдиқлайди. Тўлов жадвалида method/provider_ref майдонлари бор — кейин
 * Click, Payme ва ҳ.к. уланганда худди шу approvePayment() ишлатилади
 * (method: "click", provider_ref: тўлов тизимидаги ID).
 */

export const RECEIPTS_DIR = path.join(DATA_DIR, "receipts");
export const RECEIPT_MAX = 10 * 1024 * 1024;

/* ---------- Созламалар ---------- */

export type PremiumSettings = {
  price: number;
  days: number;
  cardNumber: string;
  cardHolder: string;
  cardBank: string;
  note: string;
  /** Ёрдам учун алоқа: Telegram ёки телефон (пароль тиклаш ва саволлар) */
  support: string;
};

export function getPremiumSettings(): PremiumSettings {
  return {
    price: Number(getSetting("premium_price")) || 50000,
    days: Number(getSetting("premium_days")) || 30,
    cardNumber: getSetting("card_number") ?? "",
    cardHolder: getSetting("card_holder") ?? "",
    cardBank: getSetting("card_bank") ?? "",
    note: getSetting("pay_note") ?? "",
    support: getSetting("support_contact") ?? "",
  };
}

export function savePremiumSettings(s: PremiumSettings, ip: string) {
  const price = Math.round(Number(s.price));
  const days = Math.round(Number(s.days));
  if (!(price >= 1000 && price <= 100_000_000)) throw new UserError("Нарх 1 000 сўмдан кам бўлмасин");
  if (!(days >= 1 && days <= 3650)) throw new UserError("Муддат 1–3650 кун");
  const digits = String(s.cardNumber || "").replace(/\D/g, "");
  if (digits && !/^\d{16}$/.test(digits)) throw new UserError("Карта рақами 16 хонали бўлсин");
  const before = getPremiumSettings();
  setSetting("premium_price", String(price));
  setSetting("premium_days", String(days));
  setSetting("card_number", digits);
  setSetting("card_holder", String(s.cardHolder || "").trim().slice(0, 80));
  setSetting("card_bank", String(s.cardBank || "").trim().slice(0, 60));
  setSetting("pay_note", String(s.note || "").trim().slice(0, 500));
  setSetting("support_contact", String(s.support || "").trim().slice(0, 100));
  audit("admin", "settings.premium", null, {
    price: [before.price, price],
    days: [before.days, days],
    card: before.cardNumber !== digits ? `…${before.cardNumber.slice(-4)} → …${digits.slice(-4)}` : undefined,
  }, ip);
}

export const formatCard = (d: string) => d.replace(/(\d{4})(?=\d)/g, "$1 ");
export const formatSum = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} сўм`;

/* ---------- Тўловлар ---------- */

export type PaymentStatus = "pending" | "approved" | "rejected";

export type PaymentRow = {
  id: number;
  user_id: number;
  amount: number;
  days: number;
  method: string;
  provider_ref: string | null;
  status: PaymentStatus;
  receipt: string | null;
  receipt_type: string | null;
  comment: string | null;
  created_at: number;
  decided_at: number | null;
  reject_reason: string | null;
  period_from: number | null;
  period_until: number | null;
};

export type PaymentView = Omit<PaymentRow, "receipt"> & { hasReceipt: boolean };
const view = (p: PaymentRow): PaymentView => {
  const { receipt, ...rest } = p;
  return { ...rest, hasReceipt: Boolean(receipt) };
};

/** Файл тури: фақат кенг тарқалган расм ва PDF (имзоси бўйича текширамиз) */
export function sniffReceipt(buf: Buffer): { ext: string; type: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", type: "image/png" };
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { ext: "webp", type: "image/webp" };
  if (buf.subarray(0, 5).toString() === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  const ftyp = buf.subarray(4, 12).toString();
  if (/^ftyp(heic|heix|mif1|msf1|hevc)/.test(ftyp)) return { ext: "heic", type: "image/heic" };
  return null;
}

export function pendingPayment(userId: number) {
  const p = db().prepare("SELECT * FROM payments WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(userId) as
    | PaymentRow
    | undefined;
  return p ? view(p) : null;
}

export function userPayments(userId: number) {
  return (db().prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC").all(userId) as PaymentRow[]).map(view);
}

/** Фойдаланувчи чек юклади — текширувга */
export async function createPayment(user: UserRow, file: Buffer, comment: string) {
  if (user.blocked) throw new UserError("Аккаунт блокланган");
  if (file.length > RECEIPT_MAX) throw new UserError("Файл 10 МБ дан катта бўлмасин");
  const kind = sniffReceipt(file);
  if (!kind) throw new UserError("Чек расм (JPG, PNG, WEBP, HEIC) ёки PDF бўлсин");
  const st = getPremiumSettings();
  if (!st.cardNumber) throw new UserError("Тўлов вақтинча қабул қилинмаяпти. Кейинроқ уриниб кўринг.");

  await fs.mkdir(RECEIPTS_DIR, { recursive: true, mode: 0o700 });
  const name = `${Date.now()}-${randomBytes(8).toString("hex")}.${kind.ext}`;
  await fs.writeFile(path.join(RECEIPTS_DIR, name), file, { mode: 0o600 });
  try {
    return tx(() => {
      if (pendingPayment(user.id)) throw new UserError("Олдинги тўловингиз ҳали текширилмоқда. Натижасини кутинг.");
      const r = db()
        .prepare("INSERT INTO payments(user_id, amount, days, method, status, receipt, receipt_type, comment, created_at) VALUES(?, ?, ?, 'card', 'pending', ?, ?, ?, ?)")
        .run(user.id, st.price, st.days, name, kind.type, String(comment || "").trim().slice(0, 300) || null, Date.now());
      return Number(r.lastInsertRowid);
    });
  } catch (e) {
    await fs.unlink(path.join(RECEIPTS_DIR, name)).catch(() => undefined);
    throw e;
  }
}

export function getPayment(id: number) {
  return db().prepare("SELECT * FROM payments WHERE id = ?").get(id) as PaymentRow | undefined;
}

/** Premium муддатини узайтириш: фаол бўлса охиридан, бўлмаса ҳозирдан */
function extendPremium(u: UserRow, days: number, now: number) {
  const active = isPremium({ premium_until: u.premium_until, blocked: 0 }, now);
  const from = active ? u.premium_until! : now;
  const until = from + days * DAY_MS;
  db()
    .prepare("UPDATE users SET premium_from = ?, premium_until = ?, expiry_notice = NULL WHERE id = ?")
    .run(active ? u.premium_from ?? now : now, until, u.id);
  return { from, until };
}

/**
 * Тўловни тасдиқлаш. Бир тўлов фақат БИР МАРТА тасдиқланади:
 * «status = 'pending'» шарти билан янгиланади — иккинчи уриниш ҳеч нарса ўзгартирмайди.
 */
export function approvePayment(id: number, actor: string, ip?: string | null) {
  const r = tx(() => {
    const now = Date.now();
    const changed = db().prepare("UPDATE payments SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending'").run(now, id);
    if (Number(changed.changes) !== 1) {
      const p = getPayment(id);
      throw new UserError(p ? `Бу тўлов аллақачон ${p.status === "approved" ? "тасдиқланган" : "рад этилган"}` : "Тўлов топилмади");
    }
    const p = getPayment(id)!;
    const u = getUser(p.user_id);
    if (!u) throw new UserError("Фойдаланувчи топилмади");
    const period = extendPremium(u, p.days, now);
    db().prepare("UPDATE payments SET period_from = ?, period_until = ? WHERE id = ?").run(period.from, period.until, id);
    audit(actor, "payment.approve", id, { user: u.id, amount: p.amount, days: p.days, until: period.until }, ip);
    return { user: getUser(u.id)!, payment: getPayment(id)!, ...period };
  });
  void notifyUser(r.user, `✅ <b>Тўловингиз тасдиқланди!</b>\nPremium обуна ${fmtDate(r.until)} гача фаол. Яхши тинглашлар! 🎧`);
  return r;
}

export function rejectPayment(id: number, reason: string, actor: string, ip?: string | null) {
  const why = String(reason || "").trim().slice(0, 300) || "Тўлов топилмади ёки чек нотўғри";
  const r = tx(() => {
    const changed = db()
      .prepare("UPDATE payments SET status = 'rejected', decided_at = ?, reject_reason = ? WHERE id = ? AND status = 'pending'")
      .run(Date.now(), why, id);
    if (Number(changed.changes) !== 1) throw new UserError("Бу тўлов аллақачон кўриб чиқилган");
    const p = getPayment(id)!;
    audit(actor, "payment.reject", id, { user: p.user_id, reason: why }, ip);
    return { payment: p, user: getUser(p.user_id) };
  });
  if (r.user) void notifyUser(r.user, `❌ <b>Тўловингиз рад этилди</b>\nСабаб: ${esc(why)}\nСаволлар бўлса, администраторга мурожаат қилинг.`);
  return r;
}

/* ---------- Админ: фойдаланувчиларни бошқариш ---------- */

export function adminSetPremiumUntil(userId: number, until: number | null, ip: string) {
  const u = getUser(userId);
  if (!u) throw new UserError("Фойдаланувчи топилмади");
  const now = Date.now();
  if (until !== null && until <= now) until = null;
  const from = until === null ? u.premium_from : isPremium(u, now) ? u.premium_from ?? now : now;
  db().prepare("UPDATE users SET premium_until = ?, premium_from = ?, expiry_notice = NULL WHERE id = ?").run(until, from, userId);
  audit("admin", until ? "user.premium.set" : "user.premium.remove", userId, { before: u.premium_until, after: until }, ip);
}

export function adminExtendPremium(userId: number, days: number, ip: string) {
  const d = Math.round(Number(days));
  if (!(d >= 1 && d <= 3650)) throw new UserError("Кунлар сони 1–3650");
  const u = getUser(userId);
  if (!u) throw new UserError("Фойдаланувчи топилмади");
  const r = extendPremium(u, d, Date.now());
  audit("admin", "user.premium.extend", userId, { days: d, until: r.until }, ip);
  return r;
}

export function adminSetBlocked(userId: number, blocked: boolean, ip: string) {
  const u = getUser(userId);
  if (!u) throw new UserError("Фойдаланувчи топилмади");
  tx(() => {
    db().prepare("UPDATE users SET blocked = ? WHERE id = ?").run(blocked ? 1 : 0, userId);
    if (blocked) db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  });
  audit("admin", blocked ? "user.block" : "user.unblock", userId, null, ip);
}

/** Паролни тиклаш ҳаволаси (фойдаланувчи администраторга мурожаат қилганда) — 24 соат */
export function adminResetLink(userId: number, ip: string) {
  const u = getUser(userId);
  if (!u) throw new UserError("Фойдаланувчи топилмади");
  const token = createToken(userId, "reset_link", DAY_MS);
  audit("admin", "user.reset_link", userId, null, ip);
  return token;
}

export type UserListItem = {
  id: number; name: string; phone: string; login: string | null; email: string | null;
  created_at: number; last_login: number | null; blocked: number;
  premium_from: number | null; premium_until: number | null; tg: number; payments: number; paid: number;
};

export function listUsers(q: string, filter: "all" | "premium" | "free" | "expired" | "blocked", page: number, per = 30) {
  const now = Date.now();
  const where: string[] = [];
  const args: (string | number)[] = [];
  const query = String(q || "").trim().toLowerCase();
  if (query) {
    const digits = query.replace(/\D/g, "");
    where.push(`(lower(u.name) LIKE ? OR u.login LIKE ?${digits.length >= 3 ? " OR u.phone LIKE ?" : ""})`);
    args.push(`%${query}%`, `%${query}%`);
    if (digits.length >= 3) args.push(`%${digits}%`);
  }
  if (filter === "premium") { where.push("u.blocked = 0 AND u.premium_until > ?"); args.push(now); }
  if (filter === "free") { where.push("(u.premium_until IS NULL OR u.premium_until <= ?)"); args.push(now); }
  if (filter === "expired") { where.push("u.premium_until IS NOT NULL AND u.premium_until <= ?"); args.push(now); }
  if (filter === "blocked") where.push("u.blocked = 1");
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = Number((db().prepare(`SELECT count(*) n FROM users u ${w}`).get(...args) as { n: number }).n);
  const rows = db()
    .prepare(
      `SELECT u.id, u.name, u.phone, u.login, u.email, u.created_at, u.last_login, u.blocked, u.premium_from, u.premium_until,
              (u.tg_id IS NOT NULL) tg,
              (SELECT count(*) FROM payments p WHERE p.user_id = u.id) payments,
              (SELECT coalesce(sum(amount), 0) FROM payments p WHERE p.user_id = u.id AND p.status = 'approved') paid
       FROM users u ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, per, Math.max(0, page - 1) * per) as UserListItem[];
  return { total, rows: rows.map((r) => ({ ...r })) };
}

export type PaymentListItem = PaymentView & { user_name: string; user_phone: string };

export function listPayments(status: PaymentStatus | "all", page: number, per = 30) {
  const w = status === "all" ? "" : "WHERE p.status = ?";
  const args = status === "all" ? [] : [status];
  const total = Number((db().prepare(`SELECT count(*) n FROM payments p ${w}`).get(...args) as { n: number }).n);
  const rows = db()
    .prepare(
      `SELECT p.*, u.name user_name, u.phone user_phone FROM payments p JOIN users u ON u.id = p.user_id ${w}
       ORDER BY (p.status = 'pending') DESC, p.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, per, Math.max(0, page - 1) * per) as (PaymentRow & { user_name: string; user_phone: string })[];
  return { total, rows: rows.map((r) => ({ ...view(r), user_name: r.user_name, user_phone: r.user_phone })) };
}

export function auditLog(limit = 100) {
  return (db().prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit) as {
    id: number; at: number; actor: string; action: string; target: string | null; details: string | null; ip: string | null;
  }[]).map((r) => ({ ...r }));
}

/* ---------- Статистика ---------- */

const TZ = 5 * 3600e3;

export function stats() {
  const now = Date.now();
  const one = (sql: string, ...a: number[]) => Number((db().prepare(sql).get(...a) as { n: number }).n);
  const total = one("SELECT count(*) n FROM users");
  const premium = one("SELECT count(*) n FROM users WHERE blocked = 0 AND premium_until > ?", now);
  const expired = one("SELECT count(*) n FROM users WHERE premium_until IS NOT NULL AND premium_until <= ?", now);
  const blocked = one("SELECT count(*) n FROM users WHERE blocked = 1");
  const revenue = one("SELECT coalesce(sum(amount), 0) n FROM payments WHERE status = 'approved'");
  const pending = one("SELECT count(*) n FROM payments WHERE status = 'pending'");
  const group = (fmt: string, since: number) =>
    (db()
      .prepare(
        `SELECT strftime('${fmt}', (decided_at + ${TZ}) / 1000, 'unixepoch') k, count(*) c, sum(amount) s
         FROM payments WHERE status = 'approved' AND decided_at >= ? GROUP BY k ORDER BY k`,
      )
      .all(since) as { k: string; c: number; s: number }[]).map((r) => ({ key: r.k, count: Number(r.c), sum: Number(r.s) }));
  const newUsers = (db()
    .prepare(`SELECT strftime('%Y-%m-%d', (created_at + ${TZ}) / 1000, 'unixepoch') k, count(*) c FROM users WHERE created_at >= ? GROUP BY k`)
    .all(now - 30 * DAY_MS) as { k: string; c: number }[]).map((r) => ({ key: r.k, count: Number(r.c) }));
  return {
    total, premium, free: total - premium, expired, blocked, revenue, pending,
    daily: group("%Y-%m-%d", now - 30 * DAY_MS),
    monthly: group("%Y-%m", now - 365 * DAY_MS),
    newUsers,
  };
}

/* ---------- Муддат назорати (ҳар соатда, instrumentation.ts) ---------- */

/** Муддати тугаган обуналарни белгилаш ва фойдаланувчига хабар бериш */
export function expirySweep(now = Date.now()) {
  const due = db()
    .prepare("SELECT * FROM users WHERE premium_until IS NOT NULL AND premium_until <= ? AND expiry_notice IS NULL")
    .all(now) as UserRow[];
  for (const u of due) {
    db().prepare("UPDATE users SET expiry_notice = ? WHERE id = ?").run(now, u.id);
    void notifyUser(u, `⏳ <b>Premium обунангиз муддати тугади</b>\nАккаунтингиз FREE ҳолатига ўтди. Обунани узайтириш: https://sevinchim.uz/profil/premium`);
  }
  if (due.length) console.log(`[premium] муддати тугади: ${due.length} та обуна`);
  return due.length;
}

/* ---------- Ёрдамчилар ---------- */

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const fmtDate = (ms: number) => {
  const d = new Date(ms + TZ);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/** Фойдаланувчига Telegram орқали хабар (Telegram уланган бўлса) */
async function notifyUser(u: Pick<UserRow, "tg_id">, text: string) {
  if (!u.tg_id) return;
  try {
    const m = await import("./telegram");
    await m.sendToChat(u.tg_id, text);
  } catch (e) {
    console.error("[premium] telegram:", e);
  }
}
