import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 12 * 1024 * 1024,
  });
  return stdout;
}

export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd")?.trim();
  if (!cwd) return Response.json({ error: "cwd is required" }, { status: 400 });
  if (!path.isAbsolute(cwd))
    return Response.json({ error: "cwd must be absolute" }, { status: 400 });
  if (!existsSync(cwd)) return Response.json({ error: "cwd not found" }, { status: 404 });

  try {
    const inside = (await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim();
    if (inside !== "true") return Response.json({ isRepo: false, status: [], diff: "" });

    const [branch, statusRaw, diff] = await Promise.all([
      git(cwd, ["branch", "--show-current"]).catch(() => ""),
      git(cwd, ["status", "--short"]),
      git(cwd, ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"]),
    ]);

    return Response.json({
      isRepo: true,
      branch: branch.trim() || null,
      status: statusRaw
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean),
      diff,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load git diff" },
      { status: 400 },
    );
  }
}
