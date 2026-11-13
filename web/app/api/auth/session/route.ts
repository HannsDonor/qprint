import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/session";

export async function GET() {
  const session = await getOwnerSession();
  return NextResponse.json({ authenticated: Boolean(session.userId && session.role === "shop_owner") });
}
