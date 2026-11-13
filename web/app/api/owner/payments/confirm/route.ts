import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

function matchesToken(token: string, hash: string) {
  if (!/^[a-f\d]{64}$/i.test(hash)) return false;
  const actual = createHash("sha256").update(token).digest("hex");
  const expected = Buffer.from(hash, "hex");
  const received = Buffer.from(actual, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const session = await getOwnerSession();
  if (!session.userId || session.role !== "shop_owner") return NextResponse.json({ error: "Sign in as a shop owner." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the scanned order details." }, { status: 400 }); }
  const jobCode = typeof body.jobCode === "string" ? body.jobCode.trim() : "";
  const qrToken = typeof body.qrToken === "string" ? body.qrToken : "";
  const method = body.paymentMethod === "gcash" ? "gcash" : body.paymentMethod === "cash" ? "cash" : "";
  if (!jobCode || !qrToken || !method) return NextResponse.json({ error: "A valid QR token and payment method are required." }, { status: 400 });

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }
  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query<(RowDataPacket & {
      id: number; shop_id: number; qr_token_hash: string; status: string; total_price: string; expires_at: Date | null;
    })[]>(`SELECT j.id, j.shop_id, j.qr_token_hash, j.status, j.total_price, j.expires_at
      FROM print_jobs j INNER JOIN shops s ON s.id = j.shop_id
      WHERE j.job_code = ? AND s.owner_id = ? AND s.is_active = 1 LIMIT 1 FOR UPDATE`, [jobCode, session.userId]);
    const job = jobs[0];
    if (!job || !matchesToken(qrToken, job.qr_token_hash)) throw new Error("That QR code is not valid for this shop.");
    if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) throw new Error("This print order has expired.");
    if (job.status !== "awaiting_payment") throw new Error("This print order has already been paid or cannot be confirmed.");

    const [payments] = await connection.query<(RowDataPacket & { id: number; payment_status: string; amount: string })[]>(`SELECT id, payment_status, amount
      FROM payments WHERE job_id = ? ORDER BY id LIMIT 1 FOR UPDATE`, [job.id]);
    const payment = payments[0];
    if (!payment || payment.payment_status !== "pending") throw new Error("This payment has already been processed.");
    if (Number(payment.amount) !== Number(job.total_price)) throw new Error("The recorded payment amount does not match the order total.");
    const now = new Date();
    await connection.execute(`UPDATE payments SET payment_status = 'paid', payment_method = ?, paid_at = ?, confirmed_by = ?
      WHERE id = ? AND payment_status = 'pending'`, [method, now, session.userId, payment.id]);
    await connection.execute(`UPDATE print_jobs SET status = 'queued', paid_at = ?, queued_at = ? WHERE id = ? AND status = 'awaiting_payment'`,
      [now, now, job.id]);
    const receipt = `QP-${job.id}-${Date.now().toString(36).toUpperCase()}`;
    await connection.execute(`INSERT INTO transactions (job_id, shop_id, receipt_number, subtotal, priority_fee, total_amount)
      SELECT id, shop_id, ?, base_price, priority_fee, total_price FROM print_jobs WHERE id = ?`, [receipt, job.id]);
    await connection.execute(`INSERT INTO job_status_history (job_id, previous_status, new_status, changed_by, remarks)
      VALUES (?, 'awaiting_payment', 'queued', ?, ?)`, [job.id, session.userId, `${method.toUpperCase()} payment confirmed; job entered the paid queue.`]);
    await connection.commit();
    return NextResponse.json({ ok: true, jobCode, status: "queued", receiptNumber: receipt });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back payment confirmation", rollbackError));
    const message = error instanceof Error ? error.message : "Could not confirm payment.";
    if (message.startsWith("That QR") || message.startsWith("This print") || message.startsWith("This payment") || message.startsWith("The recorded")) return NextResponse.json({ error: message }, { status: 409 });
    console.error("Could not confirm QPrint payment", error);
    return NextResponse.json({ error: "Could not confirm this payment." }, { status: 500 });
  } finally {
    connection.release();
  }
}
