import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

function mysqlBoolean(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return Buffer.isBuffer(value) && value.length > 0 && value[0] === 1;
}

function parseFee(value: unknown) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const amount = Number(text);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) return undefined;
  return amount;
}

async function getOwnerShop(ownerId: number) {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(`SELECT s.id FROM shops s
    WHERE s.owner_id = ? AND s.is_active = 1 ORDER BY s.id LIMIT 1`, [ownerId]);
  return rows[0];
}

export async function GET() {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });
  try {
    const shop = await getOwnerShop(session.userId);
    if (!shop) return NextResponse.json({ error: "No active shop is associated with this account." }, { status: 403 });
    const [rows] = await db.query<(RowDataPacket & { is_enabled: number; priority_fee: string })[]>(`SELECT is_enabled, priority_fee
      FROM shop_priority_settings WHERE shop_id = ? LIMIT 1`, [shop.id]);
    return NextResponse.json({ enabled: mysqlBoolean(rows[0]?.is_enabled), fee: Number(rows[0]?.priority_fee ?? 0) });
  } catch (error) {
    console.error("Could not load priority settings", error);
    return NextResponse.json({ error: "Could not load priority settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a valid priority configuration." }, { status: 400 }); }
  const fee = parseFee(body.fee);
  if (fee === undefined) return NextResponse.json({ error: "The priority fee must be a nonnegative amount with up to two decimals." }, { status: 400 });
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Choose whether priority printing is enabled." }, { status: 400 });

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }
  try {
    await connection.beginTransaction();
    const [shops] = await connection.query<(RowDataPacket & { id: number })[]>(`SELECT id FROM shops
      WHERE owner_id = ? AND is_active = 1 ORDER BY id LIMIT 1 FOR UPDATE`, [session.userId]);
    const shop = shops[0];
    if (!shop) {
      await connection.rollback();
      return NextResponse.json({ error: "No active shop is associated with this account." }, { status: 403 });
    }
    await connection.execute(`INSERT INTO shop_priority_settings (shop_id, is_enabled, priority_fee)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), priority_fee = VALUES(priority_fee)`,
    [shop.id, body.enabled ? 1 : 0, fee]);
    await connection.commit();
    return NextResponse.json({ ok: true, enabled: body.enabled, fee });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back priority settings", rollbackError));
    console.error("Could not save priority settings", error);
    return NextResponse.json({ error: "Could not save priority settings." }, { status: 500 });
  } finally {
    connection.release();
  }
}
