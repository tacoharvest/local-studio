"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

type DesktopPtyBridge = {
  getPtyPort: () => Promise<number | null>;
};

function getDesktopPtyBridge(): DesktopPtyBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { vllmStudioDesktop?: Partial<DesktopPtyBridge> })
    .vllmStudioDesktop;
  if (!candidate || typeof candidate.getPtyPort !== "function") return null;
  return candidate as DesktopPtyBridge;
}

async function fetchPtyPort(): Promise<number | null> {
  const bridge = getDesktopPtyBridge();
  if (bridge) {
    try {
      const port = await bridge.getPtyPort();
      if (typeof port === "number" && Number.isFinite(port) && port > 0) return port;
    } catch {
      /* fall through to HTTP fallback */
    }
  }
  try {
    const response = await fetch("/api/agent/pty/port", { cache: "no-store" });
    const payload = (await response.json()) as { port?: number | null };
    if (response.ok && typeof payload.port === "number" && payload.port > 0) {
      return payload.port;
    }
  } catch {
    /* ignored */
  }
  return null;
}

function readCssVar(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function buildTheme(host: HTMLElement) {
  return {
    background: readCssVar(host, "--bg", "#0b0f14"),
    foreground: readCssVar(host, "--fg", "#e6e6e6"),
    cursor: readCssVar(host, "--fg", "#e6e6e6"),
    cursorAccent: readCssVar(host, "--bg", "#0b0f14"),
    selectionBackground: readCssVar(host, "--accent", "#3b82f6") + "55",
  };
}

export function PtyTerminal({ cwd }: { cwd: string; onClose?: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let socket: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;

    const sendResize = () => {
      if (!term || !socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      } catch {
        /* ignore */
      }
    };

    const safeFit = () => {
      if (!fitAddon || !term) return;
      try {
        fitAddon.fit();
      } catch {
        /* ignore */
      }
    };

    const init = async () => {
      const port = await fetchPtyPort();
      if (disposed || !host) return;
      if (!port) {
        host.textContent = "Failed to start PTY server.";
        return;
      }

      term = new Terminal({
        cursorBlink: true,
        fontFamily:
          "var(--font-geist-mono), ui-monospace, Menlo, Monaco, 'Cascadia Code', 'Source Code Pro', monospace",
        fontSize: 13,
        scrollback: 5000,
        theme: buildTheme(host),
        allowProposedApi: true,
      });
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(host);
      safeFit();

      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const sessionId = `pty:${cwd || "default"}`;
      const url =
        `ws://127.0.0.1:${port}/?sessionId=${encodeURIComponent(sessionId)}` +
        `&cwd=${encodeURIComponent(cwd || "")}&cols=${cols}&rows=${rows}`;
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        sendResize();
      };

      socket.onmessage = (event) => {
        if (!term) return;
        const data = event.data;
        if (typeof data === "string") {
          // Could be raw PTY text or a JSON status frame. JSON status frames are best-effort:
          // we try to parse, but if it's not a recognised status type, treat it as raw output.
          if (data.length > 0 && data[0] === "{") {
            try {
              const parsed = JSON.parse(data) as { type?: string; code?: number; signal?: unknown };
              if (parsed && (parsed.type === "exit" || parsed.type === "error")) {
                if (parsed.type === "exit") {
                  term.write(`\r\n\x1b[2m[shell exited code=${parsed.code ?? "?"}]\x1b[0m\r\n`);
                }
                return;
              }
            } catch {
              /* fall through and write raw */
            }
          }
          term.write(data);
          return;
        }
        if (data instanceof ArrayBuffer) {
          term.write(new Uint8Array(data));
          return;
        }
        if (data instanceof Blob) {
          void data.arrayBuffer().then((buffer) => {
            if (!term) return;
            term.write(new Uint8Array(buffer));
          });
        }
      };

      socket.onclose = () => {
        if (!term || disposed) return;
        term.write("\r\n\x1b[2m[disconnected]\x1b[0m\r\n");
      };

      socket.onerror = () => {
        if (!term || disposed) return;
        term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
      };

      dataDisposable = term.onData((input) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        try {
          socket.send(JSON.stringify({ type: "input", data: input }));
        } catch {
          /* ignore */
        }
      });

      resizeDisposable = term.onResize(() => {
        sendResize();
      });

      resizeObserver = new ResizeObserver(() => {
        safeFit();
      });
      resizeObserver.observe(host);

      themeObserver = new MutationObserver(() => {
        if (!term || !host) return;
        term.options.theme = buildTheme(host);
      });
      const docEl = typeof document !== "undefined" ? document.documentElement : null;
      if (docEl) {
        themeObserver.observe(docEl, {
          attributes: true,
          attributeFilter: ["class", "data-theme", "style"],
        });
      }

      term.focus();
    };

    void init();

    return () => {
      disposed = true;
      try {
        dataDisposable?.dispose();
      } catch {
        /* ignore */
      }
      try {
        resizeDisposable?.dispose();
      } catch {
        /* ignore */
      }
      try {
        resizeObserver?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        themeObserver?.disconnect();
      } catch {
        /* ignore */
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
      if (term) {
        try {
          term.dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, [cwd]);

  return <div ref={containerRef} className="size-full bg-(--bg)" />;
}
