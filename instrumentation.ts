/** Сервер ишга тушганда: фондаги вазифалар */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Эфир жадвали бўйича автоматик ёзиш
  const { startAutoRecorder } = await import("./lib/autorec");
  startAutoRecorder();

  // Premium муддати назорати: ишга тушганда ва ҳар соатда.
  // (Ҳуқуқ муддат ўтган заҳоти ўзи йўқолади — бу ерда фақат белгилаш ва хабар)
  const g = globalThis as unknown as { __svExpiry?: boolean };
  if (!g.__svExpiry) {
    g.__svExpiry = true;
    const sweep = async () => {
      try {
        const { expirySweep } = await import("./lib/premium");
        expirySweep();
      } catch (e) {
        console.error("[premium] sweep:", e);
      }
    };
    setTimeout(sweep, 10_000);
    setInterval(sweep, 3600_000);
  }
}
