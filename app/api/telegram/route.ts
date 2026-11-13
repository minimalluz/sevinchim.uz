import { timingSafeEqual } from "node:crypto";
import { getSettings, handleUpdate, webhookSecret } from "@/lib/telegram";

/**
 * Telegram webhook. Telegram ҳар бир сўровда X-Telegram-Bot-Api-Secret-Token
 * сарлавҳасини юборади — у мос келмаса, сўров рад этилади.
 */
export async function POST(req: Request) {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") || "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Forbidden", { status: 403 });
  if (!(await getSettings())) return new Response("Not configured", { status: 404 });

  const update = await req.json().catch(() => null);
  // Хабар сўров ичида қайта ишланади (revalidatePath шу ерда ишлайди);
  // узоқ давом этадиган иш (ёзувни сақлаш) handleUpdate ичида фонга ўтказилган
  if (update) await handleUpdate(update).catch((e) => console.error("[telegram] update:", e));
  return new Response("ok");
}
