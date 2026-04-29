import { startPtyServer, type PtyServerHandle } from "./pty-shared";

const globalForPty = globalThis as typeof globalThis & {
  __vllmStudioPtyServer?: Promise<PtyServerHandle> | null;
};

export function getOrStartPtyServer(): Promise<PtyServerHandle> {
  if (!globalForPty.__vllmStudioPtyServer) {
    globalForPty.__vllmStudioPtyServer = startPtyServer().catch((error) => {
      globalForPty.__vllmStudioPtyServer = null;
      throw error;
    });
  }
  return globalForPty.__vllmStudioPtyServer;
}
