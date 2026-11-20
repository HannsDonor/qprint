import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a valid shop status." }, { status: 400 }); }
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Choose whether your shop is active." }, { status: 400 });

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }

  try {
    await connection.beginTransaction();
    const [shops] = await connection.query<(RowDataPacket & { id: number })[]>(`SELECT id FROM shops
      WHERE owner_id = ? ORDER BY id LIMIT 1 FOR UPDATE`, [session.userId]);
    const shop = shops[0];
    if (!shop) {
      await connection.rollback();
      return NextResponse.json({ error: "No shop is associated with this account." }, { status: 403 });
    }
    await connection.execute(`UPDATE shops SET is_active = ? WHERE id = ?`, [body.active ? 1 : 0, shop.id]);
    await connection.commit();
    return NextResponse.json({ ok: true, active: body.active });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back shop status", rollbackError));
    console.error("Could not update shop status", error);
    return NextResponse.json({ error: "Could not update your shop status." }, { status: 500 });
  } finally {
    connection.release();
  }
}
