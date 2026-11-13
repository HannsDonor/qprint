export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalState = globalThis as typeof globalThis & { qprintDocumentCleanupStarted?: boolean };
  if (globalState.qprintDocumentCleanupStarted) return;
  globalState.qprintDocumentCleanupStarted = true;
  const { cleanupExpiredDocuments } = await import("./lib/document-cleanup");
  const runCleanup = () => {
    void cleanupExpiredDocuments().catch((error: unknown) => console.error("Could not clean up expired QPrint documents", error));
  };
  runCleanup();
  const timer = setInterval(runCleanup, 60 * 1000);
  timer.unref();
}
