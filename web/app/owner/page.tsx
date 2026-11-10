import Link from "next/link";
import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext, getOwnerDashboardData } from "@/lib/owner-data";

function money(amount: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

function titleStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function DashboardContent() {
  const owner = await getOwnerContext();
  const data = await getOwnerDashboardData(owner.shopId);
  const metrics = data.metrics;
  const cards = [
    { label: "Total print orders", value: Number(metrics.totalOrders ?? 0), icon: "▤", tone: "green" },
    { label: "Awaiting payment", value: Number(metrics.awaitingPayment ?? 0), icon: "◷", tone: "amber" },
    { label: "Paid and in progress", value: Number(metrics.activePrinting ?? 0), icon: "≋", tone: "blue" },
    { label: "Ready for pickup", value: Number(metrics.readyForPickup ?? 0), icon: "✓", tone: "sage" },
  ];
  const hourly = Array.from({ length: 12 }, (_, index) => {
    const hour = index + 8;
    return data.hourlyRevenue.find((item) => item.hour === hour)?.revenue ?? 0;
  });
  const peakHour = Math.max(...hourly, 0);

  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="dashboard">
    <div className="owner-page-content">
      <div className="owner-page-heading"><div><div className="owner-date-line">SHOP OVERVIEW</div><h1>Good to see you, {owner.fullName.split(" ")[0]}.</h1><p>Here’s what’s happening at {owner.shopName} today.</p></div><Link href="/owner/services" className="owner-primary-link">View services <span>→</span></Link></div>
      <section className="owner-metrics" aria-label="Shop performance">
        {cards.map((card) => <article className="owner-metric-card" key={card.label}><div className={`owner-metric-icon ${card.tone}`}>{card.icon}</div><div><span>{card.label}</span><strong>{card.value.toLocaleString()}</strong></div><span className="metric-spark" aria-hidden="true">⌁</span></article>)}
      </section>
      <div className="owner-summary-row"><article className="revenue-card"><div className="panel-heading"><div><span className="panel-overline">TODAY’S SALES</span><h2>Revenue overview</h2></div><span className="revenue-period">Today</span></div><strong className="revenue-value">{money(data.revenueToday)}</strong><span className="revenue-caption">Paid transactions recorded today</span><div className="revenue-chart" aria-label="Hourly confirmed payment revenue"><div className="chart-gridline gridline-one" /><div className="chart-gridline gridline-two" /><div className="chart-gridline gridline-three" /><div className="chart-bars">{hourly.map((amount, index) => <i key={index} title={`${index + 8}:00 — ${money(amount)}`} style={{ height: peakHour ? `${Math.max(3, amount / peakHour * 100)}%` : "3%" }} />)}</div><div className="chart-labels"><span>8 AM</span><span>11 AM</span><span>2 PM</span><span>5 PM</span><span>7 PM</span></div></div><small className="chart-data-note">Hourly view · based on confirmed payments{peakHour === 0 ? " · no payments yet today" : ""}</small></article>
        <article className="quick-services-card"><div className="panel-heading"><div><span className="panel-overline">WHAT YOU OFFER</span><h2>Services &amp; pricing</h2></div><Link href="/owner/services" className="panel-arrow" aria-label="View all services">↗</Link></div><div className="quick-service-count"><strong>{data.services.length}</strong><span>{data.services.length === 1 ? "service" : "services"} listed</span></div>{data.services.length ? <div className="quick-service-list">{data.services.slice(0, 4).map((service) => <div className="quick-service-item" key={service.id}><span className="quick-service-icon">{service.category === "printing" ? "▤" : "✳"}</span><span><strong>{service.service_name}</strong><small>{service.is_available ? "Available" : "Currently unavailable"}</small></span><span className={`service-state-dot ${service.is_available ? "on" : "off"}`} /></div>)}</div> : <p className="empty-services-note">Add a service and its prices to start accepting print orders.</p>}<Link href="/owner/services" className="all-services-link">View all services <span>→</span></Link></article></div>
      <section className="recent-orders-panel"><div className="panel-heading"><div><span className="panel-overline">LATEST ACTIVITY</span><h2>Recent print orders</h2></div><span className="recent-total">{data.recentJobs.length} recent</span></div>{data.recentJobs.length ? <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>JOB</th><th>DOCUMENT</th><th>TYPE</th><th>STATUS</th><th>TOTAL</th><th>RECEIVED</th></tr></thead><tbody>{data.recentJobs.map((job) => <tr key={job.job_code}><td><strong className="job-code">{job.job_code}</strong></td><td><span className="document-cell"><span>PDF</span>{job.document_name ?? "Document"}</span></td><td><span className={`job-type ${job.print_type}`}>{job.print_type}</span></td><td><span className={`job-status ${job.status.replaceAll("_", "-")}`}>{titleStatus(job.status)}</span></td><td>{money(Number(job.total_price))}</td><td>{new Date(job.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</td></tr>)}</tbody></table></div> : <div className="owner-empty-state"><span>▤</span><strong>No print orders yet</strong><p>New customer orders for your shop will show up here.</p></div>}</section>
      <div className="owner-bottom-note"><span>i</span> Dashboard data is scoped to {owner.shopName}. Only payments confirmed by your shop appear in today’s sales.</div>
    </div>
  </OwnerShell>;
}

export default function OwnerDashboardPage() {
  return <Suspense fallback={<div className="owner-loading">Loading your shop dashboard…</div>}><DashboardContent /></Suspense>;
}
