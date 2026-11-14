import path from "node:path";
import { isAdmin } from "@/lib/auth";
import { FM90_DIR } from "@/lib/recorder";
import { FM90_NAME } from "@/lib/fm90";
import { serveFile } from "@/lib/serveFile";

/** FM90 ёзувлари — фақат админ учун (тинглаш ва ?download=1 билан юклаб олиш) */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await isAdmin())) return new Response("Рухсат йўқ", { status: 401 });
  const { file } = await params;
  if (!FM90_NAME.test(file)) return new Response("Топилмади", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") ? file : undefined;
  return serveFile(req, path.join(FM90_DIR, file), "audio/mpeg", { cache: "private, no-store", download });
}

export { GET as HEAD };
