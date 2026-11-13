import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

const colorModes = ["black_white", "colored"] as const;

function parsePrice(value: unknown) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const amount = Number(text);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(amount) || amount < 0 || amount > 99_999_999.99) return undefined;
  return amount;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.toLowerCase();
  if (origin && host) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed origin */ }
    if (!originHost || originHost !== host) return NextResponse.json({ error: "Cross-site service changes are not allowed." }, { status: 403 });
  }

  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner to manage printing prices." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter both printing prices." }, { status: 400 }); }
  const rawPrices = body.prices;
  if (!rawPrices || typeof rawPrices !== "object" || Array.isArray(rawPrices)) return NextResponse.json({ error: "Enter both printing prices." }, { status: 400 });

  const prices = colorModes.map((colorMode) => {
    const price = parsePrice((rawPrices as Record<string, unknown>)[colorMode]);
    return { colorMode, price };
  });
  if (prices.some((item) => item.price === undefined)) return NextResponse.json({ error: "Prices must be nonnegative amounts with up to two decimals." }, { status: 400 });
  if (prices.every((item) => item.price === 0)) return NextResponse.json({ error: "Configure at least one printing price before saving." }, { status: 400 });

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

    await connection.execute(`UPDATE shop_services SET is_available = 0, is_archived = 1
      WHERE shop_id = ? AND category <> 'printing'`, [shop.id]);
    const [services] = await connection.query<(RowDataPacket & { id: number })[]>(`SELECT id FROM shop_services
      WHERE shop_id = ? AND service_name = 'Document Printing' AND category = 'printing' AND is_archived = 0
      ORDER BY id LIMIT 1 FOR UPDATE`, [shop.id]);
    let serviceId = services[0]?.id;
    if (!serviceId) {
      const [result] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO shop_services
        (shop_id, service_name, category, description, pricing_type, is_available, is_archived)
        VALUES (?, 'Document Printing', 'printing', 'Basic document printing.', 'per_page', 1, 0)`, [shop.id]);
      serviceId = result.insertId;
    } else {
      await connection.execute(`UPDATE shop_services SET is_available = 1, is_archived = 0 WHERE id = ? AND shop_id = ?`, [serviceId, shop.id]);
    }

    for (const item of prices) {
      await connection.execute(`INSERT INTO shop_service_prices (service_id, color_mode, price, is_available)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price), is_available = VALUES(is_available)`,
      [serviceId, item.colorMode, item.price!, item.price! > 0 ? 1 : 0]);
    }
    await connection.commit();
    return NextResponse.json({ ok: true, serviceId });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back printing prices", rollbackError));
    console.error("Could not save printing prices", error);
    return NextResponse.json({ error: "Could not save printing prices. Please try again." }, { status: 500 });
  } finally {
    connection.release();
  }
}
