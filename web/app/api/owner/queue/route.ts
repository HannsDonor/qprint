import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/session";
import { getOwnerContext, getOwnerQueue } from "@/lib/owner-data";

export async function GET() {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });
  try {
    const owner = await getOwnerContext();
    return NextResponse.json({ queue: await getOwnerQueue(owner.shopId) });
  } catch (error) {
    console.error("Could not load print queue", error);
    return NextResponse.json({ error: "Could not load the print queue." }, { status: 500 });
  }
}
