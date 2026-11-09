import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SiteContent } from "./types";

/** Маълумотлар папкаси: DATA_DIR ёки лойиҳадаги ./data */
export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data"));
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const SEED_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const SEED_FILE = path.join(SEED_DIR, "content.json");

let ready: Promise<void> | null = null;

async function seed() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  try {
    await fs.access(CONTENT_FILE);
    return;
  } catch {
    /* биринчи ишга тушириш */
  }
  // Бошланғич маълумотлар ва демо аудиоларни DATA_DIR га нусхалаймиз
  const seedAudio = path.join(SEED_DIR, "audio");
  if (path.resolve(seedAudio) !== path.resolve(AUDIO_DIR)) {
    const files = await fs.readdir(seedAudio).catch(() => [] as string[]);
    for (const f of files) {
      await fs.copyFile(path.join(seedAudio, f), path.join(AUDIO_DIR, f)).catch(() => undefined);
    }
  }
  await fs.copyFile(SEED_FILE, CONTENT_FILE);
}

export function ensureDataDir() {
  ready ??= seed().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function getContent(): Promise<SiteContent> {
  await ensureDataDir();
  const raw = await fs.readFile(CONTENT_FILE, "utf8");
  const data = JSON.parse(raw) as SiteContent;
  data.episodes.sort((a, b) => b.date.localeCompare(a.date));
  return data;
}

/** Ёзувни атомар бажарамиз: аввал вақтинчалик файлга, кейин алмаштириш. */
let writing: Promise<unknown> = Promise.resolve();
export async function updateContent(mutate: (c: SiteContent) => void | Promise<void>) {
  const run = writing.then(async () => {
    const content = await getContent();
    await mutate(content);
    const tmp = CONTENT_FILE + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(content, null, 2), "utf8");
    await fs.rename(tmp, CONTENT_FILE);
    return content;
  });
  writing = run.catch(() => undefined);
  return run;
}
