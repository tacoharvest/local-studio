import { NextRequest } from "next/server";
import os from "node:os";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectoryEntry = {
  name: string;
  path: string;
};

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path")?.trim();
  const directoryPath = path.resolve(requestedPath || os.homedir());

  if (!(await isDirectory(directoryPath))) {
    return Response.json({ error: "Path is not a directory" }, { status: 400 });
  }

  try {
    const names = await readdir(directoryPath);
    const entries: DirectoryEntry[] = [];

    await Promise.all(
      names.map(async (name) => {
        if (name === "." || name === "..") return;
        const entryPath = path.join(directoryPath, name);
        if (!(await isDirectory(entryPath))) return;
        entries.push({ name, path: entryPath });
      }),
    );

    entries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );

    const parent = path.dirname(directoryPath);
    return Response.json({
      path: directoryPath,
      parent: parent === directoryPath ? null : parent,
      home: os.homedir(),
      entries,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list directories" },
      { status: 400 },
    );
  }
}
