// PTY-over-WebSocket server shared logic (Electron main + Next API route).
//
// This file is duplicated at src/lib/agent/pty-shared.ts.
// Keep the two copies in sync: same shapes, same behaviour, same wire format.

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as nodePty from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";

export interface PtyServerHandle {
  port: number;
  dispose: () => Promise<void>;
}

interface IncomingMessage {
  type?: string;
  data?: unknown;
  cols?: unknown;
  rows?: unknown;
}

const MIN_DIM = 1;
const MAX_DIM = 1000;

function defaultShell(): string {
  if (process.platform === "win32") return process.env.COMSPEC || "cmd.exe";
  if (process.platform === "darwin") return "/bin/zsh";
  return "/bin/bash";
}

function defaultShellArgs(): string[] {
  if (process.platform === "win32") return [];
  // Login + interactive so .zshrc / .bashrc populate PATH and PS1.
  return ["-l"];
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(homedir(), value.slice(2));
  return value;
}

function safeResolveCwd(input: string | undefined, fallback: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return fallback;
  const expanded = expandHome(raw);
  const candidate = path.isAbsolute(expanded) ? expanded : path.resolve(fallback, expanded);
  try {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  } catch {
    /* fall through */
  }
  return fallback;
}

function clampDim(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < MIN_DIM) return MIN_DIM;
  if (i > MAX_DIM) return MAX_DIM;
  return i;
}

function buildEnv(): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env };
  base.TERM = "xterm-256color";
  base.COLORTERM = base.COLORTERM ?? "truecolor";
  delete base.PS1;
  return base;
}

interface SessionState {
  pty: nodePty.IPty;
  socket: WebSocket;
}

export interface StartPtyServerOptions {
  fallbackCwd?: string;
}

export function startPtyServer(options: StartPtyServerOptions = {}): Promise<PtyServerHandle> {
  return new Promise((resolve, reject) => {
    const fallbackCwd =
      options.fallbackCwd && options.fallbackCwd.trim() ? options.fallbackCwd : process.cwd();

    const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const sessions = new Map<string, SessionState>();

    wss.on("error", (error) => {
      reject(error);
    });

    wss.on("listening", () => {
      const address = wss.address();
      if (!address || typeof address !== "object") {
        reject(new Error("PTY WebSocket server failed to bind"));
        return;
      }
      const port = address.port;

      wss.on("connection", (socket, request) => {
        try {
          const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
          const sessionId = url.searchParams.get("sessionId") || `pty-${Date.now()}`;
          const requestedCwd = url.searchParams.get("cwd") || undefined;
          const cols = clampDim(url.searchParams.get("cols"), 80);
          const rows = clampDim(url.searchParams.get("rows"), 24);
          const cwd = safeResolveCwd(requestedCwd, fallbackCwd);

          // If a session with this id already exists (e.g. reconnect), close the previous.
          const previous = sessions.get(sessionId);
          if (previous) {
            try {
              previous.socket.close();
            } catch {
              /* ignore */
            }
            try {
              previous.pty.kill();
            } catch {
              /* ignore */
            }
            sessions.delete(sessionId);
          }

          const ptyProcess = nodePty.spawn(defaultShell(), defaultShellArgs(), {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env: buildEnv() as { [key: string]: string },
          });

          const state: SessionState = { pty: ptyProcess, socket };
          sessions.set(sessionId, state);

          const sendJson = (payload: unknown) => {
            if (socket.readyState !== socket.OPEN) return;
            try {
              socket.send(JSON.stringify(payload));
            } catch {
              /* ignore */
            }
          };

          ptyProcess.onData((data) => {
            if (socket.readyState !== socket.OPEN) return;
            try {
              socket.send(data);
            } catch {
              /* ignore */
            }
          });

          ptyProcess.onExit(({ exitCode, signal }) => {
            sendJson({ type: "exit", code: exitCode, signal: signal ?? null });
            try {
              socket.close();
            } catch {
              /* ignore */
            }
            sessions.delete(sessionId);
          });

          socket.on("message", (raw) => {
            let parsed: IncomingMessage | null = null;
            try {
              parsed = JSON.parse(
                typeof raw === "string" ? raw : raw.toString(),
              ) as IncomingMessage;
            } catch {
              return;
            }
            if (!parsed || typeof parsed.type !== "string") return;
            if (parsed.type === "input" && typeof parsed.data === "string") {
              try {
                ptyProcess.write(parsed.data);
              } catch {
                /* ignore */
              }
            } else if (parsed.type === "resize") {
              const c = clampDim(parsed.cols, cols);
              const r = clampDim(parsed.rows, rows);
              try {
                ptyProcess.resize(c, r);
              } catch {
                /* ignore */
              }
            }
          });

          socket.on("close", () => {
            const current = sessions.get(sessionId);
            if (current && current.pty === ptyProcess) {
              try {
                ptyProcess.kill();
              } catch {
                /* ignore */
              }
              sessions.delete(sessionId);
            }
          });

          socket.on("error", () => {
            try {
              ptyProcess.kill();
            } catch {
              /* ignore */
            }
            sessions.delete(sessionId);
          });
        } catch (error) {
          try {
            socket.send(
              JSON.stringify({
                type: "error",
                text: error instanceof Error ? error.message : "PTY init failed",
              }),
            );
          } catch {
            /* ignore */
          }
          try {
            socket.close();
          } catch {
            /* ignore */
          }
        }
      });

      const dispose = async () => {
        for (const [, session] of sessions) {
          try {
            session.pty.kill();
          } catch {
            /* ignore */
          }
          try {
            session.socket.close();
          } catch {
            /* ignore */
          }
        }
        sessions.clear();
        await new Promise<void>((res) => {
          wss.close(() => res());
        });
      };

      resolve({ port, dispose });
    });
  });
}
