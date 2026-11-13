"use client";

import { useEffect, useState } from "react";

type Order = {
  id: number; job_code: string; print_type: "priority" | "standard"; status: string;
  document_name: string | null; payment_status: string | null; created_at: string;
  priorityFee: number; totalPrice: number; expires_at: string | null;
};

function money(amount: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

function titleStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function OrdersList({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function countdown(expiresAt: string | null) {
    if (!expiresAt) return "No expiry";
    const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
    return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }

  async function updatePayment(jobId: number, status: "paid" | "failed", paymentMethod?: "cash" | "gcash") {
    setBusyId(jobId);
    setError("");
    try {
      const response = await fetch("/api/owner/orders/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status, paymentMethod }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update payment status.");
      setOrders((current) => current.map((order) => order.id === jobId
        ? { ...order, payment_status: status, status: status === "paid" ? "queued" : "failed" }
        : order));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update payment status.");
    } finally {
      setBusyId(null);
    }
  }

  return <div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="owner-table-wrap"><table className="owner-table orders-table"><thead><tr><th>JOB</th><th>DOCUMENT</th><th>TYPE</th><th>STATUS</th><th>PAYMENT</th><th>AMOUNT</th><th>EXPIRES IN</th><th>ACTION</th></tr></thead><tbody>{orders.map((order) => { const expired = order.expires_at !== null && new Date(order.expires_at).getTime() <= now; return <tr key={order.id}><td><strong className="job-code">{order.job_code}</strong></td><td><span className="document-cell"><span>PDF</span>{order.document_name ?? "Document"}</span></td><td><span className={`job-type ${order.print_type}`}>{order.print_type === "priority" ? "Priority" : "Standard"}</span></td><td><span className={`job-status ${order.status.replaceAll("_", "-")}`}>{titleStatus(order.status)}</span></td><td>{order.payment_status ? titleStatus(order.payment_status) : "Pending"}</td><td><strong>{money(order.totalPrice)}</strong>{order.priorityFee > 0 && <small className="order-fee-note">incl. {money(order.priorityFee)} priority</small>}</td><td><span className={`order-countdown ${expired ? "expired" : ""}`}>{expired ? "Expired" : countdown(order.expires_at)}</span></td><td>{order.payment_status === "pending" && !expired && <div className="payment-actions"><button type="button" disabled={busyId === order.id} onClick={() => void updatePayment(order.id, "paid", "cash")}>Cash paid</button><button type="button" disabled={busyId === order.id} onClick={() => void updatePayment(order.id, "paid", "gcash")}>GCash paid</button><button type="button" className="payment-fail-button" disabled={busyId === order.id} onClick={() => void updatePayment(order.id, "failed")}>Mark failed</button></div>}</td></tr>;})}</tbody></table></div></div>;
}
