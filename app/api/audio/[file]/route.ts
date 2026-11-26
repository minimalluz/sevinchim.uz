import path from "node:path";
import { AUDIO_DIR, ensureDataDir, getContent } from "@/lib/content";
import { AUDIO_TYPES as TYPES, SAFE_NAME } from "@/lib/audio";
import { serveFile } from "@/lib/serveFile";
import { SITE_URL } from "@/lib/site";
import { isAdmin } from "@/lib/auth";
import { currentUser, isPremium } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Архив аудиоларни оқимли узатиш (HTTP Range Requests).
 *
 * Ҳуқуқ ҲАР БИР сўровда серверда текширилади — тўғридан-тўғри ҳавола
 * орқали ҳам ёпиқ файлни олиб бўлмайди:
 *   • очиқ эшиттириш — ҳамма тинглайди;
 *   • Premium эшиттириш — фақат фаол Premium обуначи;
 *   • юклаб олиш (?dl=1) — фақат Premium (эшиттиришда тақиқланмаган бўлса);
 *   • қоралама ва ҳеч бир эшиттиришга боғланмаган файл — фақат админ.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ext = path.extname(file).toLowerCase();
  if (!SAFE_NAME.test(file) || !TYPES[ext]) return new Response("Топилмади", { status: 404 });
  await ensureDataDir(); // биринчи сўровда демо аудиолар нусхаланади

  const url = `/api/audio/${file}`;
  const ep = (await getContent()).episodes.find((e) => e.audio === url);
  const download = new URL(req.url).searchParams.get("dl") === "1";
  const admin = await isAdmin();

  if (!admin) {
    if (!ep || ep.draft) return new Response("Топилмади", { status: 404 });
    if (ep.access === "premium" || download) {
      const user = await currentUser();
      if (!user) return deny(401, "Тинглаш учун тизимга киринг", download);
      if (!isPremium(user)) return deny(403, "Бу имконият фақат Premium обуначилар учун", download);
      if (download && ep.download === false) return deny(403, "Бу эшиттиришни юклаб олиш мумкин эмас", download);
    }
  }

  const gated = !ep || ep.draft || ep.access === "premium" || download;
  return serveFile(req, path.join(AUDIO_DIR, file), TYPES[ext], {
    // Ёпиқ файллар оралиқ кэшларда сақланмасин
    cache: gated ? "private, no-store" : undefined,
    download: download && ep ? `${ep.title}${ext}` : undefined,
  });
}

function deny(status: number, text: string, download: boolean) {
  // Юклаб олишда браузер шу саҳифани кўрсатади — профилга йўналтирамиз
  if (download) return Response.redirect(new URL(status === 401 ? "/profil?next=/arxiv" : "/profil/premium", SITE_URL), 303);
  return new Response(text, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export { GET as HEAD };
