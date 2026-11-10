import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const [shops] = await db.query<(RowDataPacket & {
      id: number;
      shop_name: string;
      description: string | null;
      address: string;
      contact_number: string | null;
      is_active: number;
      priority_enabled: number;
      priority_fee: string;
    })[]>(`SELECT s.id, s.shop_name, s.description, s.address, s.contact_number, s.is_active,
                 COALESCE(ps.is_enabled, 0) AS priority_enabled,
                 COALESCE(ps.priority_fee, 0.00) AS priority_fee
          FROM shops s
          LEFT JOIN shop_priority_settings ps ON ps.shop_id = s.id
          WHERE s.is_active = 1
          ORDER BY s.shop_name`);

    const [prices] = await db.query<(RowDataPacket & {
      shop_id: number;
      service_id: number;
      service_name: string;
      price_id: number;
      option_name: string | null;
      paper_size: string | null;
      color_mode: "black_white" | "colored" | null;
      duplex: number | null;
      price: string;
    })[]>(`SELECT ss.shop_id, ss.id AS service_id, ss.service_name, sp.id AS price_id,
                 sp.option_name, sp.paper_size, sp.color_mode, sp.duplex, sp.price
          FROM shop_services ss
          INNER JOIN shop_service_prices sp ON sp.service_id = ss.id
          INNER JOIN shops s ON s.id = ss.shop_id
          WHERE s.is_active = 1 AND ss.is_available = 1 AND ss.is_archived = 0 AND sp.is_available = 1
            AND ss.category = 'printing' AND ss.pricing_type = 'per_page'
          ORDER BY ss.shop_id, ss.id, sp.id`);

    const pricesByShop = new Map<number, typeof prices>();
    for (const price of prices) pricesByShop.set(price.shop_id, [...(pricesByShop.get(price.shop_id) ?? []), price]);

    return NextResponse.json({ shops: shops.map((shop) => ({
      id: shop.id,
      name: shop.shop_name,
      description: shop.description,
      address: shop.address,
      contactNumber: shop.contact_number,
      priorityEnabled: Boolean(shop.priority_enabled),
      priorityFee: Number(shop.priority_fee),
      prices: (pricesByShop.get(shop.id) ?? []).map((price) => ({
        serviceId: price.service_id,
        serviceName: price.service_name,
        priceId: price.price_id,
        optionName: price.option_name,
        paperSize: price.paper_size,
        colorMode: price.color_mode,
        duplex: price.duplex === null ? null : Boolean(price.duplex),
        price: Number(price.price),
      })),
    })).filter((shop) => shop.prices.length > 0) });
  } catch (error) {
    console.error("Could not load QPrint shops", error);
    return NextResponse.json({ error: "Could not load print shops. Check the MySQL connection." }, { status: 503 });
  }
}
