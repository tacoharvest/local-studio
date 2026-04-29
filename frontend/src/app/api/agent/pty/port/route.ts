import { NextResponse } from "next/server";
import { getOrStartPtyServer } from "@/lib/agent/pty-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const handle = await getOrStartPtyServer();
    return NextResponse.json({ port: handle.port });
  } catch (error) {
    return NextResponse.json(
      {
        port: null,
        error: error instanceof Error ? error.message : "Failed to start PTY server",
      },
      { status: 500 },
    );
  }
}
