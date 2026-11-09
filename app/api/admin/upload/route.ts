import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AUDIO_DIR } from "@/lib/content";
import { AUDIO_TYPES, MAX_UPLOAD } from "@/lib/audio";
import { isAdmin } from "@/lib/auth";

/**
 * Архив аудиони юклаш. Файл хотирага тўлиқ олинмайди — тўғридан-тўғри дискка
 * оқим сифатида ёзилади, шунинг учун 1–2 соатлик эфирлар ҳам муаммосиз юкланади.
 * Сўров: PUT /api/admin/upload, тана — файлнинг ўзи, X-File-Name — асл номи.
 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Рухсат йўқ" }, { status: 401 });

  const original = decodeURIComponent(req.headers.get("x-file-name") || "");
  const ext = path.extname(original).toLowerCase();
  if (!AUDIO_TYPES[ext]) {
    return Response.json({ error: "Фақат MP3, M4A, AAC, OGG, OPUS ёки WAV файллар" }, { status: 415 });
  }
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD) return Response.json({ error: "Файл 500 МБ дан катта" }, { status: 413 });
  if (!req.body) return Response.json({ error: "Файл бўш" }, { status: 400 });

  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}-${randomBytes(6).toString("hex")}${ext}`;
  const final = path.join(AUDIO_DIR, name);
  const tmp = final + ".part";

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD) cb(new Error("too-large"));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), limiter, createWriteStream(tmp));
    if (size === 0) throw new Error("empty");
    await fs.rename(tmp, final);
  } catch (e) {
    await fs.unlink(tmp).catch(() => undefined);
    const msg = (e as Error).message === "too-large" ? "Файл 500 МБ дан катта" : "Юклашда хатолик";
    return Response.json({ error: msg }, { status: 400 });
  }

  return Response.json({ url: `/api/audio/${name}`, size });
}
