import path from "node:path";
import { AUDIO_DIR, ensureDataDir } from "@/lib/content";
import { AUDIO_TYPES as TYPES, SAFE_NAME } from "@/lib/audio";
import { serveFile } from "@/lib/serveFile";

/**
 * Архив аудиоларни оқимли узатиш (HTTP Range Requests).
 * Тингловчи бутун файлни юкламасдан исталган жойига ўтиши мумкин.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ext = path.extname(file).toLowerCase();
  if (!SAFE_NAME.test(file) || !TYPES[ext]) return new Response("Топилмади", { status: 404 });
  await ensureDataDir(); // биринчи сўровда демо аудиолар нусхаланади
  return serveFile(req, path.join(AUDIO_DIR, file), TYPES[ext]);
}

export { GET as HEAD };
