/** Сервер ишга тушганда: эфир жадвали бўйича автоматик ёзиш текширувчиси */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutoRecorder } = await import("./lib/autorec");
  startAutoRecorder();
}
