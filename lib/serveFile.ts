import "server-only";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";

/**
 * Файлни HTTP Range сўровларини қўллаб узатиш (архивда ўраб ўтиш учун).
 * opts.download — юклаб олиш учун Content-Disposition; opts.cache — Cache-Control.
 */
export async function serveFile(
  req: Request,
  full: string,
  type: string,
  opts: { cache?: string; download?: string } = {},
) {
  let size: number;
  let mtime: Date;
  try {
    const st = await fs.stat(full);
    if (!st.isFile()) throw new Error();
    size = st.size;
    mtime = st.mtime;
  } catch {
    return new Response("Топилмади", { status: 404 });
  }

  const etag = `"${size.toString(16)}-${mtime.getTime().toString(16)}"`;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ?? "public, max-age=31536000, immutable",
    ETag: etag,
    "Last-Modified": mtime.toUTCString(),
  };
  if (opts.download) {
    headers["Content-Disposition"] = `attachment; filename="${opts.download.replace(/[^\w.-]/g, "_")}"`;
  }

  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] ? Number(m[1]) : NaN;
    let end = m && m[2] ? Number(m[2]) : size - 1;
    if (m && !m[1] && m[2]) {
      // «bytes=-500» — охирги 500 байт
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    }
    if (!m || Number.isNaN(start) || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  if (req.method === "HEAD") return new Response(null, { headers: { ...headers, "Content-Length": String(size) } });
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
