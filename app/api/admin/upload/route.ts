import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AUDIO_DIR } from "@/lib/content";
import { AUDIO_TYPES, MAX_CHUNK, MAX_UPLOAD } from "@/lib/audio";
import { isAdmin } from "@/lib/auth";

/**
 * Архив аудиони бўлаклаб юклаш.
 *
 * Ҳар бир сўров: PUT /api/admin/upload, тана — файлнинг навбатдаги бўлаги.
 *   X-File-Name     — асл файл номи (encodeURIComponent)
 *   X-File-Size     — файлнинг тўлиқ ҳажми (байт)
 *   X-Upload-Offset — бу бўлак файлнинг қаеридан бошланади
 *   X-Upload-Id     — биринчи бўлакдан кейин сервер қайтарган ID
 *
 * Жавоб: { uploadId, received } ёки охирги бўлакдан кейин { url, size }.
 * Бўлаклар дискка тўғридан-тўғри оқим сифатида ёзилади (хотирада сақланмайди).
 */
const ID = /^[a-f0-9]{24}$/;
const partPath = (id: string) => path.join(AUDIO_DIR, `.upload-${id}.part`);
const STALE_MS = 24 * 3600 * 1000;

const err = (error: string, status: number) => Response.json({ error }, { status });

/** Чала қолган эски юкламаларни тозалаш */
async function cleanupStale() {
  const files = await fs.readdir(AUDIO_DIR).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((f) => f.startsWith(".upload-") && f.endsWith(".part"))
      .map(async (f) => {
        const full = path.join(AUDIO_DIR, f);
        const st = await fs.stat(full).catch(() => null);
        if (st && Date.now() - st.mtimeMs > STALE_MS) await fs.unlink(full).catch(() => undefined);
      }),
  );
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return err("Рухсат йўқ", 401);

  const original = decodeURIComponent(req.headers.get("x-file-name") || "");
  const ext = path.extname(original).toLowerCase();
  if (!AUDIO_TYPES[ext]) return err("Фақат MP3, M4A, AAC, OGG, OPUS ёки WAV файллар", 415);

  const total = Number(req.headers.get("x-file-size"));
  const offset = Number(req.headers.get("x-upload-offset") || 0);
  if (!Number.isSafeInteger(total) || total <= 0) return err("Файл ҳажми нотўғри", 400);
  if (total > MAX_UPLOAD) return err("Файл 1 ГБ дан катта", 413);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total) return err("Бўлак нотўғри", 400);
  if (!req.body) return err("Бўлак бўш", 400);

  await fs.mkdir(AUDIO_DIR, { recursive: true });

  let id = req.headers.get("x-upload-id") || "";
  if (offset === 0) {
    await cleanupStale();
    id = randomBytes(12).toString("hex");
  } else if (!ID.test(id)) {
    return err("Юклаш ID нотўғри", 400);
  }
  const part = partPath(id);

  // Бўлаклар тартиб билан келиши шарт: файлдаги ҳажм = бўлак бошланиши
  if (offset > 0) {
    const st = await fs.stat(part).catch(() => null);
    if (!st) return err("Юклаш топилмади. Қайтадан бошланг.", 404);
    if (st.size !== offset) return Response.json({ error: "Бўлак тартиби бузилди", received: st.size }, { status: 409 });
  }

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > MAX_CHUNK || offset + size > total) cb(new Error("too-large"));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream),
      limiter,
      createWriteStream(part, { flags: offset === 0 ? "wx" : "a" }),
    );
    if (size === 0) throw new Error("empty");
  } catch (e) {
    // Бу бўлакни бекор қиламиз: файлни аввалги ҳажмига қайтарамиз
    if (offset === 0) await fs.unlink(part).catch(() => undefined);
    else await fs.truncate(part, offset).catch(() => undefined);
    const msg = (e as Error).message === "too-large" ? "Бўлак ҳажми нотўғри" : "Юклашда хатолик";
    return err(msg, 400);
  }

  const received = offset + size;
  if (received < total) return Response.json({ uploadId: id, received });

  // Охирги бўлак: файлни доимий номга ўтказамиз
  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}-${randomBytes(6).toString("hex")}${ext}`;
  await fs.rename(part, path.join(AUDIO_DIR, name));
  return Response.json({ url: `/api/audio/${name}`, size: received });
}
