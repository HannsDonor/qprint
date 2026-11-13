import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

const PAPER_SIZES = ["A4", "A3", "A5", "A2", "A1", "A0", "Short", "Long", "Letter", "Legal"];

function mysqlBoolean(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return Buffer.isBuffer(value) && value.length > 0 && value[0] === 1;
}

export async function GET() {
  try {
    const [shops] = await db.query<(RowDataPacket & {
      id: number; shop_name: string; description: string | null; address: string; contact_number: string | null;
      is_active: number; priority_enabled: number; priority_fee: string;
    })[]>(`SELECT s.id, s.shop_name, s.description, s.address, s.contact_number, s.is_active,
        COALESCE(ps.is_enabled, 0) AS priority_enabled, COALESCE(ps.priority_fee, 0.00) AS priority_fee
      FROM shops s LEFT JOIN shop_priority_settings ps ON ps.shop_id = s.id
      WHERE s.is_active = 1 ORDER BY s.shop_name`);
    const [prices] = await db.query<(RowDataPacket & {
      shop_id: number; service_id: number; service_name: string; price_id: number;
      color_mode: "black_white" | "colored"; price: string; is_available: number;
    })[]>(`SELECT ss.shop_id, ss.id AS service_id, ss.service_name, sp.id AS price_id,
        sp.color_mode, sp.price, sp.is_available
      FROM shop_services ss INNER JOIN shop_service_prices sp ON sp.service_id = ss.id
      WHERE ss.is_available = 1 AND ss.is_archived = 0 AND ss.category = 'printing'
        AND ss.service_name = 'Document Printing' AND sp.is_available = 1
      ORDER BY ss.shop_id, sp.id`);
    const pricesByShop = new Map<number, typeof prices>();
    for (const price of prices) pricesByShop.set(price.shop_id, [...(pricesByShop.get(price.shop_id) ?? []), price]);

    return NextResponse.json({ shops: shops.map((shop) => {
      const shopPrices = pricesByShop.get(shop.id) ?? [];
      return {
        id: shop.id, name: shop.shop_name, description: shop.description, address: shop.address,
        contactNumber: shop.contact_number, priorityEnabled: mysqlBoolean(shop.priority_enabled), priorityFee: Number(shop.priority_fee),
        paperSizes: PAPER_SIZES,
        services: [{ id: shopPrices[0]?.service_id ?? 0, name: "Document Printing", category: "printing",
          description: "Basic document printing.", pricingType: "per_page",
          options: shopPrices.map((price) => ({ optionName: price.color_mode, colorMode: price.color_mode, price: Number(price.price) })) }],
        prices: shopPrices.map((price) => ({
          serviceId: price.service_id, serviceName: price.service_name, priceId: price.price_id,
          colorMode: price.color_mode, price: Number(price.price),
        })),
      };
    }).filter((shop) => shop.prices.length > 0) }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Could not load QPrint shops", error);
    return NextResponse.json({ error: "Could not load print shops. Check the MySQL connection." }, { status: 503 });
  }
}
