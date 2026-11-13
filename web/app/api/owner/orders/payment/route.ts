import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the payment update." }, { status: 400 }); }
  const jobId = Number(body.jobId);
  const status = body.status === "paid" || body.status === "failed" ? body.status : "";
  const method = body.paymentMethod === "gcash" ? "gcash" : body.paymentMethod === "cash" ? "cash" : "";
  if (!Number.isSafeInteger(jobId) || jobId < 1 || !status || (status === "paid" && !method)) {
    return NextResponse.json({ error: "Choose a valid order, payment status, and payment method." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }

  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query<(RowDataPacket & {
      id: number; shop_id: number; status: string; total_price: string; expires_at: Date | null;
    })[]>(`SELECT j.id, j.shop_id, j.status, j.total_price, j.expires_at
      FROM print_jobs j INNER JOIN shops s ON s.id = j.shop_id
      WHERE j.id = ? AND s.owner_id = ? AND s.is_active = 1 LIMIT 1 FOR UPDATE`, [jobId, session.userId]);
    const job = jobs[0];
    if (!job) throw new Error("That order does not belong to your shop.");
    if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) throw new Error("This print order has expired.");

    const [payments] = await connection.query<(RowDataPacket & {
      id: number; amount: string; payment_status: "pending" | "paid" | "failed" | "refunded";
    })[]>(`SELECT id, amount, payment_status FROM payments WHERE job_id = ? ORDER BY id LIMIT 1 FOR UPDATE`, [job.id]);
    const payment = payments[0];
    if (!payment) throw new Error("This order has no payment record.");
    if (payment.payment_status !== "pending") throw new Error("This payment has already been processed.");
    if (status === "paid" && Number(payment.amount) !== Number(job.total_price)) throw new Error("The payment amount does not match the order total.");

    const now = new Date();
    if (status === "failed") {
      await connection.execute(`UPDATE payments SET payment_status = 'failed' WHERE id = ? AND payment_status = 'pending'`, [payment.id]);
      await connection.execute(`UPDATE print_jobs SET status = 'failed' WHERE id = ? AND status = 'awaiting_payment'`, [job.id]);
      await connection.execute(`INSERT INTO job_status_history (job_id, previous_status, new_status, changed_by, remarks)
        VALUES (?, ?, 'failed', ?, 'Payment was marked failed by the shop owner.')`, [job.id, job.status, session.userId]);
    } else {
      await connection.execute(`UPDATE payments SET payment_status = 'paid', payment_method = ?, paid_at = ?, confirmed_by = ?
        WHERE id = ? AND payment_status = 'pending'`, [method, now, session.userId, payment.id]);
      await connection.execute(`UPDATE print_jobs SET status = 'queued', paid_at = ?, queued_at = ?
        WHERE id = ? AND status = 'awaiting_payment'`, [now, now, job.id]);
      const receipt = `QP-${job.id}-${Date.now().toString(36).toUpperCase()}`;
      await connection.execute(`INSERT INTO transactions (job_id, shop_id, receipt_number, subtotal, priority_fee, total_amount)
        SELECT id, shop_id, ?, base_price, priority_fee, total_price FROM print_jobs WHERE id = ?`, [receipt, job.id]);
      await connection.execute(`INSERT INTO job_status_history (job_id, previous_status, new_status, changed_by, remarks)
        VALUES (?, 'awaiting_payment', 'queued', ?, ?)`, [job.id, session.userId, `${method.toUpperCase()} payment confirmed from the orders page.`]);
    }
    await connection.commit();
    return NextResponse.json({ ok: true, jobId, paymentStatus: status, jobStatus: status === "paid" ? "queued" : "failed" });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back order payment update", rollbackError));
    const message = error instanceof Error ? error.message : "Could not update payment status.";
    if (message.startsWith("That order") || message.startsWith("This ") || message.startsWith("The payment")) return NextResponse.json({ error: message }, { status: 409 });
    console.error("Could not update QPrint order payment", error);
    return NextResponse.json({ error: "Could not update payment status." }, { status: 500 });
  } finally {
    connection.release();
  }
}
