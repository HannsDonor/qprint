import Link from "next/link";
import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext, getOwnerPriority, getOwnerServices } from "@/lib/owner-data";
import ServiceCreateForm from "./service-create-form";
import PrioritySettingsForm from "./priority-settings-form";

function money(amount: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount));
}

async function ServicesContent() {
  const owner = await getOwnerContext();
  const [services, priority] = await Promise.all([getOwnerServices(owner.shopId), getOwnerPriority(owner.shopId)]);
  const service = services[0];
  const prices = new Map((service?.prices ?? []).map((price) => [price.color_mode, price]));
  const initialPrices = {
    black_white: prices.get("black_white")?.price ?? "0.00",
    colored: prices.get("colored")?.price ?? "0.00",
  };

  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="services">
    <div className="owner-page-content">
      <div className="owner-page-heading"><div><div className="owner-date-line">SHOP CATALOG</div><h1>Printing prices</h1><p>Configure the two prices customers can use at {owner.shopName}.</p></div><Link href="/owner" className="owner-secondary-link">← Back to dashboard</Link></div>
      <div className="catalog-summary"><div className="catalog-summary-icon">▤</div><div><strong>Document Printing</strong><span>Two color modes · prices are per page</span></div><span className="catalog-shop-label">{owner.shopName}</span></div>
      <section className="catalog-setup-section"><div className="catalog-setup-heading"><div><span>DEFAULT QPRINT SERVICE</span><h2>Document printing</h2><p>Paper size and orientation are customer selections and do not change these prices.</p></div></div><ServiceCreateForm initialPrices={initialPrices} /></section>
      <section className="owner-service-list"><article className="owner-service-card">
        <div className="owner-service-header"><div className="owner-service-icon">▤</div><div className="owner-service-title"><h2>Document Printing</h2><span>Black &amp; white and colored · per page</span></div><span className={`owner-availability ${service?.is_available ? "available" : "unavailable"}`}><i />{service?.is_available ? "Available" : "Unavailable"}</span></div>
        <div className="service-price-table"><div className="service-price-heading"><span>PRINTING MODE</span><span>DESCRIPTION</span><span>PRICE</span><span>STATUS</span></div>{(["black_white", "colored"] as const).map((mode) => {
          const price = prices.get(mode);
          return <div className="service-price-row" key={mode}><strong>{mode === "black_white" ? "Black & white" : "Colored"}</strong><span>All supported paper sizes and orientations</span><b>{money(price?.price ?? "0")} <small>/ page</small></b><span className={`price-availability ${price?.is_available ? "" : "off"}`}>{price?.is_available ? "Active" : "Unconfigured"}</span></div>;
        })}</div>
      </article></section>
      <p className="catalog-note"><span>i</span> Existing orders keep their saved price snapshots. A mode with no configured price cannot be ordered.</p>
      <section className="priority-settings-section"><div className="catalog-setup-heading"><div><span>QUEUE SETTINGS</span><h2>Priority printing</h2><p>Give customers an optional paid processing choice while keeping standard orders in their normal FIFO queue.</p></div></div><PrioritySettingsForm initialEnabled={priority.enabled} initialFee={priority.fee.toFixed(2)} /></section>
    </div>
  </OwnerShell>;
}

export default function OwnerServicesPage() {
  return <Suspense fallback={<div className="owner-loading">Loading printing prices…</div>}><ServicesContent /></Suspense>;
}
