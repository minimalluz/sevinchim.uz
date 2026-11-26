import path from "node:path";
import { currentUser, throttle, UserError } from "@/lib/users";
import { RECEIPT_MAX, RECEIPTS_DIR, createPayment, getPayment, getPremiumSettings } from "@/lib/premium";

export const dynamic = "force-dynamic";

/** Premium тўлов чекини юклаш (фақат тизимга кирган фойдаланувчи) */
export async function POST(req: Request) {
  // Бошқа сайтдан юборилган сўровни рад этамиз
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Рухсат йўқ" }, { status: 403 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Аввал тизимга киринг" }, { status: 401 });

  try {
    throttle(`receipt:${user.id}`, 10, 60 * 60e3).fail();
    const len = Number(req.headers.get("content-length") || 0);
    if (len > RECEIPT_MAX + 64 * 1024) throw new UserError("Файл 10 МБ дан катта бўлмасин");
    const fd = await req.formData();
    const file = fd.get("receipt");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Тўлов чеки ёки скриншотини танланг");
    if (file.size > RECEIPT_MAX) throw new UserError("Файл 10 МБ дан катта бўлмасин");
    const id = await createPayment(user, Buffer.from(await file.arrayBuffer()), String(fd.get("comment") ?? ""));

    // Админларга Telegram орқали чек ва тасдиқлаш тугмалари
    const p = getPayment(id)!;
    void import("@/lib/telegram")
      .then((m) =>
        m.notifyNewPayment(
          { id, amount: p.amount, userName: user.name, phone: user.phone, comment: p.comment },
          p.receipt ? { file: path.join(RECEIPTS_DIR, p.receipt), type: p.receipt_type || "" } : null,
        ),
      )
      .catch((e) => console.error("[receipt] telegram:", e));

    return Response.json({ ok: true, id, days: getPremiumSettings().days });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : (console.error("[receipt]", e), "Юклаб бўлмади. Қайта уриниб кўринг.");
    return Response.json({ error: msg }, { status: 400 });
  }
}
