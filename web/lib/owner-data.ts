import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

export type OwnerContext = {
  userId: number;
  fullName: string;
  email: string;
  shopId: number;
  shopName: string;
  shopAddress: string;
  shopDescription: string | null;
};

export async function getOwnerContext(): Promise<OwnerContext> {
  await connection();
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") redirect("/login");

  const [rows] = await db.query<(RowDataPacket & OwnerContext)[]>(`SELECT u.id AS userId, u.full_name AS fullName, u.email,
      s.id AS shopId, s.shop_name AS shopName, s.address AS shopAddress, s.description AS shopDescription
    FROM users u
    INNER JOIN shops s ON s.owner_id = u.id
    WHERE u.id = ? AND u.role = 'shop_owner' AND u.is_active = 1 AND s.is_active = 1
    ORDER BY s.id ASC LIMIT 1`, [session.userId]);

  if (!rows[0]) redirect("/login?reason=no-shop");
  return rows[0];
}

export async function getOwnerDashboardData(shopId: number) {
  const [metricsRows] = await db.query<(RowDataPacket & {
    totalOrders: number;
    awaitingPayment: number;
    activePrinting: number;
    readyForPickup: number;
    completed: number;
  })[]>(`SELECT COUNT(*) AS totalOrders,
      COALESCE(SUM(status = 'awaiting_payment'), 0) AS awaitingPayment,
      COALESCE(SUM(status IN ('paid', 'queued', 'printing')), 0) AS activePrinting,
      COALESCE(SUM(status = 'ready_for_pickup'), 0) AS readyForPickup,
      COALESCE(SUM(status = 'completed'), 0) AS completed
    FROM print_jobs WHERE shop_id = ?`, [shopId]);

  const [revenueRows] = await db.query<(RowDataPacket & { revenueToday: string | null })[]>(`SELECT COALESCE(SUM(total_amount), 0.00) AS revenueToday
    FROM transactions WHERE shop_id = ? AND transaction_date >= CURRENT_DATE() AND transaction_date < CURRENT_DATE() + INTERVAL 1 DAY`, [shopId]);

  const [recentJobs] = await db.query<(RowDataPacket & {
    job_code: string;
    status: string;
    print_type: string;
    total_price: string;
    created_at: Date;
    document_name: string | null;
  })[]>(`SELECT j.job_code, j.status, j.print_type, j.total_price, j.created_at,
      (SELECT d.original_filename FROM documents d WHERE d.job_id = j.id ORDER BY d.id LIMIT 1) AS document_name
    FROM print_jobs j WHERE j.shop_id = ? ORDER BY j.created_at DESC LIMIT 6`, [shopId]);

  const [hourRows] = await db.query<(RowDataPacket & { hour: number; revenue: string })[]>(`SELECT HOUR(transaction_date) AS hour, SUM(total_amount) AS revenue
    FROM transactions WHERE shop_id = ? AND transaction_date >= CURRENT_DATE() AND transaction_date < CURRENT_DATE() + INTERVAL 1 DAY
    GROUP BY HOUR(transaction_date)`, [shopId]);

  return {
    metrics: metricsRows[0],
    revenueToday: Number(revenueRows[0]?.revenueToday ?? 0),
    recentJobs,
    hourlyRevenue: hourRows.map((row) => ({ hour: row.hour, revenue: Number(row.revenue) })),
    services: await getOwnerServices(shopId),
  };
}

export async function getOwnerServices(shopId: number) {
  const [services] = await db.query<(RowDataPacket & {
    id: number;
    service_name: string;
    category: string;
    description: string | null;
    pricing_type: string;
    is_available: number;
  })[]>(`SELECT id, service_name, category, description, pricing_type, is_available
    FROM shop_services WHERE shop_id = ? AND is_archived = 0 ORDER BY service_name`, [shopId]);

  const [servicePrices] = await db.query<(RowDataPacket & {
    service_id: number;
    option_name: string | null;
    paper_size: string | null;
    color_mode: string | null;
    duplex: number | null;
    price: string;
    is_available: number;
  })[]>(`SELECT sp.service_id, sp.option_name, sp.paper_size, sp.color_mode, sp.duplex, sp.price, sp.is_available
    FROM shop_service_prices sp
    INNER JOIN shop_services ss ON ss.id = sp.service_id
    WHERE ss.shop_id = ? AND ss.is_archived = 0 ORDER BY sp.service_id, sp.id`, [shopId]);

  const pricesByService = new Map<number, typeof servicePrices>();
  for (const price of servicePrices) pricesByService.set(price.service_id, [...(pricesByService.get(price.service_id) ?? []), price]);

  return services.map((service) => ({ ...service, prices: pricesByService.get(service.id) ?? [] }));
}
