/**
 * Build the in-memory corpus while the server is still booting.
 *
 * `register()` has to return before the instance accepts requests, so this
 * deliberately does not await the build — it just starts it, so the snapshot is
 * usually warm by the time the first request arrives instead of making that
 * request pay for it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmSnapshot } = await import("@/lib/corpus/snapshot");
  warmSnapshot();
}
