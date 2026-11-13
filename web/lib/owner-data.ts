import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";
import { cleanupExpiredDocuments } from "@/lib/document-cleanup";

export type OwnerContext = {
  userId: number;
  fullName: string;
  email: string;
  shopId: number;
  shopName: string;
  shopAddress: string;
  shopDescription: string | null;
};

function mysqlBoolean(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return Buffer.isBuffer(value) && value.length > 0 && value[0] === 1;
}

export async function getOwnerContext(): Promise<OwnerContext> {
  await connection();
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") redirect("/login");
  const [rows] = await db.query<(RowDataPacket & OwnerContext)[]>(`SELECT u.id AS userId, u.full_name AS fullName, u.email,
      s.id AS shopId, s.shop_name AS shopName, s.address AS shopAddress, s.description AS shopDescription
    FROM users u INNER JOIN shops s ON s.owner_id = u.id
    WHERE u.id = ? AND u.role = 'shop_owner' AND u.is_active = 1 AND s.is_active = 1
    ORDER BY s.id ASC LIMIT 1`, [session.userId]);
  if (!rows[0]) redirect("/login?reason=no-shop");
  return rows[0];
}

export async function getOwnerDashboardData(shopId: number) {
  const [metricsRows] = await db.query<(RowDataPacket & {
    totalOrders: number; awaitingPayment: number; activePrinting: number; readyForPickup: number; completed: number;
  })[]>(`SELECT COUNT(*) AS totalOrders,
      COALESCE(SUM(status = 'awaiting_payment'), 0) AS awaitingPayment,
      COALESCE(SUM(status IN ('paid', 'queued', 'printing')), 0) AS activePrinting,
      COALESCE(SUM(status = 'ready_for_pickup'), 0) AS readyForPickup,
      COALESCE(SUM(status = 'completed'), 0) AS completed
    FROM print_jobs WHERE shop_id = ?`, [shopId]);
  const [revenueRows] = await db.query<(RowDataPacket & { revenueToday: string | null })[]>(`SELECT COALESCE(SUM(total_amount), 0.00) AS revenueToday
    FROM transactions WHERE shop_id = ? AND transaction_date >= CURRENT_DATE() AND transaction_date < CURRENT_DATE() + INTERVAL 1 DAY`, [shopId]);
  const [recentJobs] = await db.query<(RowDataPacket & {
    job_code: string; status: string; print_type: string; total_price: string; created_at: Date; document_name: string | null;
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
  await db.execute(`INSERT INTO shop_services
    (shop_id, service_name, category, description, pricing_type, is_available, is_archived)
    SELECT ?, 'Document Printing', 'printing', 'Basic document printing.', 'per_page', 1, 0
    FROM DUAL WHERE NOT EXISTS (
      SELECT 1 FROM shop_services WHERE shop_id = ? AND service_name = 'Document Printing' AND category = 'printing' AND is_archived = 0
    )`, [shopId, shopId]);
  await db.execute(`INSERT INTO shop_service_prices (service_id, color_mode, price, is_available)
    SELECT ss.id, modes.color_mode, 0.00, 0
    FROM shop_services ss
    CROSS JOIN (SELECT 'black_white' AS color_mode UNION ALL SELECT 'colored' AS color_mode) modes
    WHERE ss.shop_id = ? AND ss.service_name = 'Document Printing' AND ss.category = 'printing'
      AND ss.is_archived = 0
      AND NOT EXISTS (
        SELECT 1 FROM shop_service_prices existing
        WHERE existing.service_id = ss.id AND existing.color_mode = modes.color_mode
      )`, [shopId]);
  const [services] = await db.query<(RowDataPacket & {
    id: number; service_name: string; category: string; description: string | null; pricing_type: string; is_available: number;
  })[]>(`SELECT id, service_name, category, description, pricing_type, is_available
    FROM shop_services WHERE shop_id = ? AND service_name = 'Document Printing' AND category = 'printing' AND is_archived = 0
    ORDER BY id LIMIT 1`, [shopId]);
  const [servicePrices] = await db.query<(RowDataPacket & {
    id: number; service_id: number; color_mode: "black_white" | "colored"; price: string; is_available: number;
  })[]>(`SELECT sp.id, sp.service_id, sp.color_mode, sp.price, sp.is_available
    FROM shop_service_prices sp INNER JOIN shop_services ss ON ss.id = sp.service_id
    WHERE ss.shop_id = ? AND ss.service_name = 'Document Printing' AND ss.is_archived = 0
    ORDER BY sp.id`, [shopId]);
  const pricesByService = new Map<number, typeof servicePrices>();
  for (const price of servicePrices) pricesByService.set(price.service_id, [...(pricesByService.get(price.service_id) ?? []), price]);
  return services.map((service) => ({ ...service, prices: pricesByService.get(service.id) ?? [] }));
}

export async function getOwnerPriority(shopId: number) {
  const [rows] = await db.query<(RowDataPacket & { is_enabled: number; priority_fee: string })[]>(`SELECT is_enabled, priority_fee
    FROM shop_priority_settings WHERE shop_id = ? LIMIT 1`, [shopId]);
  return { enabled: mysqlBoolean(rows[0]?.is_enabled), fee: Number(rows[0]?.priority_fee ?? 0) };
}

export async function getOwnerQueue(shopId: number) {
  const [rows] = await db.query<(RowDataPacket & {
    id: number; job_code: string; print_type: "priority" | "standard"; status: "printing" | "queued";
    priority_fee: string; total_price: string; paid_at: Date; queued_at: Date | null; created_at: Date;
    document_name: string | null;
  })[]>(`SELECT j.id, j.job_code, j.print_type, j.status, j.priority_fee, j.total_price,
      j.paid_at, j.queued_at, j.created_at,
      (SELECT d.original_filename FROM documents d WHERE d.job_id = j.id ORDER BY d.id LIMIT 1) AS document_name
    FROM print_jobs j
    WHERE j.shop_id = ? AND j.status IN ('printing', 'queued') AND j.paid_at IS NOT NULL
    ORDER BY CASE WHEN j.status = 'printing' THEN 0 ELSE 1 END,
      CASE WHEN j.print_type = 'priority' THEN 0 ELSE 1 END, j.paid_at ASC, j.id ASC`, [shopId]);
  let position = 0;
  return rows.map((row) => ({
    ...row,
    position: row.status === "printing" ? null : ++position,
    priorityFee: Number(row.priority_fee),
    totalPrice: Number(row.total_price),
  }));
}

export async function getOwnerOrders(shopId: number) {
  await cleanupExpiredDocuments();
  const [rows] = await db.query<(RowDataPacket & {
    id: number; job_code: string; print_type: "priority" | "standard"; status: string;
    base_price: string; priority_fee: string; total_price: string; created_at: Date; paid_at: Date | null; expires_at: Date | null;
    document_name: string | null; payment_status: string | null;
  })[]>(`SELECT j.id, j.job_code, j.print_type, j.status, j.base_price, j.priority_fee, j.total_price,
    j.created_at, j.paid_at, j.expires_at,
      (SELECT d.original_filename FROM documents d WHERE d.job_id = j.id ORDER BY d.id LIMIT 1) AS document_name,
      (SELECT p.payment_status FROM payments p WHERE p.job_id = j.id ORDER BY p.id LIMIT 1) AS payment_status
    FROM print_jobs j
    WHERE j.shop_id = ?
    ORDER BY j.created_at DESC, j.id DESC
    LIMIT 100`, [shopId]);
  return rows.map((row) => ({
    ...row,
    basePrice: Number(row.base_price),
    priorityFee: Number(row.priority_fee),
    totalPrice: Number(row.total_price),
  }));
}
