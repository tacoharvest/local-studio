"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranchIcon, ReloadIcon } from "@/components/icons";

type GitDiffPayload = {
  isRepo?: boolean;
  branch?: string | null;
  status?: string[];
  diff?: string;
  error?: string;
};

type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: {
    kind: "meta" | "context" | "add" | "del";
    text: string;
    oldLine?: number;
    newLine?: number;
  }[];
};

function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = {
        path: match?.[2] ?? line.replace("diff --git ", ""),
        additions: 0,
        deletions: 0,
        lines: [],
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      oldLine = Number(match?.[1] ?? 0);
      newLine = Number(match?.[2] ?? 0);
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      current.additions += 1;
      current.lines.push({ kind: "add", text: line.slice(1), newLine });
      newLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      current.deletions += 1;
      current.lines.push({ kind: "del", text: line.slice(1), oldLine });
      oldLine += 1;
      continue;
    }
    current.lines.push({
      kind: "context",
      text: line.startsWith(" ") ? line.slice(1) : line,
      oldLine,
      newLine,
    });
    oldLine += 1;
    newLine += 1;
  }

  return files;
}

export function GitDiffPanel({ cwd }: { cwd: string | null }) {
  const [payload, setPayload] = useState<GitDiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cwd) {
      setPayload(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/agent/git-diff?cwd=${encodeURIComponent(cwd)}`, {
        cache: "no-store",
      });
      const next = (await response.json()) as GitDiffPayload;
      setPayload(next);
    } catch (error) {
      setPayload({ error: error instanceof Error ? error.message : "Failed to load git diff" });
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void load();
  }, [load]);

  const files = useMemo(() => parseUnifiedDiff(payload?.diff ?? ""), [payload?.diff]);
  const selected = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;

  useEffect(() => {
    if (files.length > 0 && !files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0].path);
    }
  }, [files, selectedPath]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--border) px-3 text-xs">
        <GitBranchIcon className="h-3.5 w-3.5 text-(--dim)" />
        <span className="min-w-0 flex-1 truncate text-(--fg)" title={cwd ?? ""}>
          {payload?.branch ? payload.branch : cwd ? "Working tree diff" : "No directory"}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !cwd}
          className="rounded p-1 text-(--dim) hover:bg-(--surface) hover:text-(--fg) disabled:opacity-40"
          title="Refresh diff"
        >
          <ReloadIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!cwd ? (
        <div className="p-4 text-xs text-(--dim)">
          Choose a project directory to view git changes.
        </div>
      ) : payload?.error ? (
        <div className="m-3 rounded border border-(--err)/30 bg-(--err)/10 p-3 text-xs text-(--err)">
          {payload.error}
        </div>
      ) : payload?.isRepo === false ? (
        <div className="p-4 text-xs text-(--dim)">This directory is not a git repository.</div>
      ) : files.length === 0 ? (
        <div className="p-4 text-xs text-(--dim)">
          {loading ? "Loading diff…" : "No unstaged tracked-file changes."}
          {(payload?.status?.length ?? 0) > 0 ? (
            <pre className="mt-3 overflow-auto rounded border border-(--border) bg-(--surface) p-2 font-mono text-[11px] text-(--fg)">
              {payload?.status?.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-44 shrink-0 overflow-auto border-r border-(--border) bg-(--surface)/40">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`flex w-full flex-col gap-1 border-b border-(--border)/60 px-2 py-2 text-left text-xs ${
                  selected?.path === file.path
                    ? "bg-(--bg) text-(--fg)"
                    : "text-(--dim) hover:bg-(--surface) hover:text-(--fg)"
                }`}
                title={file.path}
              >
                <span className="truncate font-mono">{file.path}</span>
                <span className="font-mono text-[10px]">
                  <span className="text-emerald-400">+{file.additions}</span>{" "}
                  <span className="text-red-400">-{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-auto font-mono text-[11px] leading-5">
            {selected?.lines.map((line, index) => (
              <div
                key={`${selected.path}-${index}`}
                className={`grid grid-cols-[3rem_3rem_1fr] gap-2 border-b border-(--border)/20 px-2 ${
                  line.kind === "add"
                    ? "bg-emerald-500/10 text-emerald-100"
                    : line.kind === "del"
                      ? "bg-red-500/10 text-red-100"
                      : line.kind === "meta"
                        ? "bg-(--surface) text-(--accent)"
                        : "text-(--fg)"
                }`}
              >
                <span className="select-none text-right text-(--dim)">{line.oldLine ?? ""}</span>
                <span className="select-none text-right text-(--dim)">{line.newLine ?? ""}</span>
                <span className="whitespace-pre">
                  {line.kind === "add"
                    ? "+"
                    : line.kind === "del"
                      ? "-"
                      : line.kind === "context"
                        ? " "
                        : ""}
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
