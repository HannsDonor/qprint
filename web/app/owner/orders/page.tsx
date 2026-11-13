import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext, getOwnerOrders } from "@/lib/owner-data";
import OrdersList from "./orders-list";

async function OrdersContent() {
  const owner = await getOwnerContext();
  const orders = await getOwnerOrders(owner.shopId);
  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="orders">
    <div className="owner-page-content">
      <div className="owner-page-heading"><div><div className="owner-date-line">SHOP WORKSPACE</div><h1>Print orders</h1><p>Review every order for {owner.shopName}, including payment and priority details.</p></div></div>
      <section className="orders-panel"><div className="panel-heading"><div><span className="panel-overline">ORDER HISTORY</span><h2>All print orders</h2></div><span className="recent-total">{orders.length} shown</span></div>{orders.length ? <OrdersList initialOrders={orders.map((order) => ({ ...order, created_at: order.created_at.toISOString(), expires_at: order.expires_at?.toISOString() ?? null }))} /> : <div className="owner-empty-state"><span>▤</span><strong>No print orders yet</strong><p>New customer orders will appear here.</p></div>}<p className="orders-note">Files and QR references expire 30 minutes after order creation.</p></section>
    </div>
  </OwnerShell>;
}

export default function OwnerOrdersPage() {
  return <Suspense fallback={<div className="owner-loading">Loading print orders…</div>}><OrdersContent /></Suspense>;
}
