import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/session";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.toLowerCase();
  if (origin && host) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed origin */ }
    if (!originHost || originHost !== host) return NextResponse.json({ error: "Cross-site sign out is not allowed." }, { status: 403 });
  }

  const session = await getOwnerSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
