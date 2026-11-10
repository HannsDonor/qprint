import Link from "next/link";
import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext, getOwnerServices } from "@/lib/owner-data";

function money(amount: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function ServicesContent() {
  const owner = await getOwnerContext();
  const services = await getOwnerServices(owner.shopId);
  const priceCount = services.reduce((sum, service) => sum + service.prices.length, 0);

  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="services">
    <div className="owner-page-content">
      <div className="owner-page-heading"><div><div className="owner-date-line">SHOP CATALOG</div><h1>Services &amp; pricing</h1><p>See the services and current prices customers can order from {owner.shopName}.</p></div><Link href="/owner" className="owner-secondary-link">← Back to dashboard</Link></div>
      <div className="catalog-summary"><div className="catalog-summary-icon">☷</div><div><strong>{services.length} {services.length === 1 ? "service" : "services"}</strong><span>{priceCount} price {priceCount === 1 ? "option" : "options"} · Changes here apply to new orders</span></div><span className="catalog-shop-label">{owner.shopName}</span></div>
      {services.length ? <div className="owner-service-list">{services.map((service) => <article className="owner-service-card" key={service.id}>
        <div className="owner-service-header"><div className="owner-service-icon">{service.category === "printing" ? "▤" : "✳"}</div><div className="owner-service-title"><h2>{service.service_name}</h2><span>{label(service.category)} · {label(service.pricing_type)}</span></div><span className={`owner-availability ${service.is_available ? "available" : "unavailable"}`}><i />{service.is_available ? "Available" : "Unavailable"}</span></div>
        {service.description && <p className="owner-service-description">{service.description}</p>}
        {service.prices.length ? <div className="service-price-table"><div className="service-price-heading"><span>OPTION</span><span>PRINT DETAILS</span><span>PRICE</span><span>STATUS</span></div>{service.prices.map((option, index) => <div className="service-price-row" key={`${service.id}-${index}`}><strong>{option.option_name ?? "Standard option"}</strong><span>{[option.paper_size, option.color_mode ? label(option.color_mode) : null, option.duplex === null ? null : option.duplex ? "Double-sided" : "Single-sided"].filter(Boolean).join(" · ") || "Shop configured option"}</span><b>{money(option.price)} <small>{service.pricing_type === "per_page" ? "/ page" : service.pricing_type === "per_sheet" ? "/ sheet" : service.pricing_type === "per_copy" ? "/ copy" : ""}</small></b><span className={`price-availability ${option.is_available ? "" : "off"}`}>{option.is_available ? "Active" : "Paused"}</span></div>)}</div> : <div className="service-no-prices">No price options are currently set for this service.</div>}
      </article>)}</div> : <section className="owner-no-services"><span>☷</span><h2>No services listed yet</h2><p>When your shop’s services and prices are added to QPrint, they’ll appear here and in the customer order flow.</p><Link href="/owner">Back to dashboard</Link></section>}
      <p className="catalog-note"><span>i</span> Prices shown come from the shop’s current catalog. Existing orders keep their saved price snapshots.</p>
    </div>
  </OwnerShell>;
}

export default function OwnerServicesPage() {
  return <Suspense fallback={<div className="owner-loading">Loading shop services…</div>}><ServicesContent /></Suspense>;
}
