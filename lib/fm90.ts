import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./content";
import { FM90_DIR } from "./recorder";

/**
 * FM 90.8: алоҳида лойиҳа учун ёзувлар (сайтда кўринмайди, фақат админ).
 * Созламалар — DATA_DIR/fm90.json, ёзувлар — DATA_DIR/FM90/*.mp3,
 * қўшимча маълумот (давомийлик) — DATA_DIR/FM90/.index.json.
 */

export type Fm90Settings = { streamUrl: string; maxMinutes: number };
export type Fm90File = { name: string; size: number; duration: number; startedAt: number; note?: string };

const SETTINGS = path.join(DATA_DIR, "fm90.json");
const INDEX = path.join(FM90_DIR, ".index.json");
export const FM90_NAME = /^FM90_[\w-]{1,80}\.mp3$/;

export async function getFm90Settings(): Promise<Fm90Settings> {
  try {
    const s = JSON.parse(await fs.readFile(SETTINGS, "utf8")) as Partial<Fm90Settings>;
    return { streamUrl: s.streamUrl ?? "", maxMinutes: s.maxMinutes || 210 };
  } catch {
    return { streamUrl: "", maxMinutes: 210 };
  }
}

export async function saveFm90Settings(s: Fm90Settings) {
  await fs.writeFile(SETTINGS, JSON.stringify(s, null, 2), "utf8");
}

type Index = Record<string, { duration: number; startedAt: number; note?: string }>;

async function readIndex(): Promise<Index> {
  try {
    return JSON.parse(await fs.readFile(INDEX, "utf8")) as Index;
  } catch {
    return {};
  }
}

export async function registerFm90File(name: string, meta: Index[string]) {
  await fs.mkdir(FM90_DIR, { recursive: true });
  const idx = await readIndex();
  idx[name] = meta;
  await fs.writeFile(INDEX, JSON.stringify(idx, null, 2), "utf8");
}

export async function listFm90(): Promise<Fm90File[]> {
  await fs.mkdir(FM90_DIR, { recursive: true });
  const idx = await readIndex();
  const names = (await fs.readdir(FM90_DIR)).filter((n) => FM90_NAME.test(n));
  const files = await Promise.all(
    names.map(async (name) => {
      const st = await fs.stat(path.join(FM90_DIR, name));
      const m = idx[name];
      return { name, size: st.size, duration: m?.duration ?? 0, startedAt: m?.startedAt ?? st.mtimeMs, note: m?.note };
    }),
  );
  return files.sort((a, b) => b.startedAt - a.startedAt);
}

export async function deleteFm90(name: string) {
  if (!FM90_NAME.test(name)) throw new Error("Файл номи нотўғри");
  await fs.unlink(path.join(FM90_DIR, name));
  const idx = await readIndex();
  delete idx[name];
  await fs.writeFile(INDEX, JSON.stringify(idx, null, 2), "utf8");
}

export async function diskFree() {
  const st = await fs.statfs(DATA_DIR);
  return { free: st.bavail * st.bsize, total: st.blocks * st.bsize };
}
