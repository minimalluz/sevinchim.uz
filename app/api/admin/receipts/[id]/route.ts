import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { RECEIPTS_DIR, getPayment } from "@/lib/premium";
import { serveFile } from "@/lib/serveFile";

export const dynamic = "force-dynamic";

/** Тўлов чеки — фақат админга */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Рухсат йўқ", { status: 403 });
  const { id } = await params;
  const p = /^\d+$/.test(id) ? getPayment(Number(id)) : undefined;
  if (!p?.receipt || !/^[\w.-]+$/.test(p.receipt)) return new Response("Топилмади", { status: 404 });
  const res = await serveFile(req, path.join(RECEIPTS_DIR, p.receipt), p.receipt_type || "application/octet-stream", { cache: "private, no-store" });
  // Юкланган файл бизнинг саҳифа номидан скрипт ишлата олмасин
  // (PDF кўрувчиси sandbox билан ишламайди — PDF учун фақат nosniff)
  if (p.receipt_type !== "application/pdf") res.headers.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.headers.set("Content-Disposition", "inline");
  return res;
}
