import Link from "next/link";
import type { ReactNode } from "react";
import OwnerLogout from "@/components/owner-logout";

export default function OwnerShell({ children, ownerName, shopName, active }: { children: ReactNode; ownerName: string; shopName: string; active: "dashboard" | "services" | "orders" | "scanner" | "queue" }) {
  return (
    <main className="owner-app">
      <aside className="owner-sidebar">
        <Link href="/" className="owner-logo"><span className="order-brand-mark"><i /><i /><i /><i /></span><span>qprint<span>.</span></span></Link>
        <div className="owner-shop-switch"><span className="owner-shop-avatar">{shopName.slice(0, 1).toUpperCase()}</span><span><small>YOUR SHOP</small><strong>{shopName}</strong></span></div>
        <div className="owner-nav-label">WORKSPACE</div>
        <nav className="owner-nav" aria-label="Shop owner navigation">
          <Link className={active === "dashboard" ? "active" : ""} href="/owner"><span className="owner-nav-icon">▦</span>Dashboard</Link>
          <Link className={active === "services" ? "active" : ""} href="/owner/services"><span className="owner-nav-icon">☷</span>Services &amp; pricing</Link>
          <Link className={active === "orders" ? "active" : ""} href="/owner/orders"><span className="owner-nav-icon">▤</span>Print orders</Link>
          <Link className={active === "scanner" ? "active" : ""} href="/owner/scanner"><span className="owner-nav-icon">⌕</span>QR scanner</Link>
          <Link className={active === "queue" ? "active" : ""} href="/owner/queue"><span className="owner-nav-icon">≋</span>Printing queue</Link>
        </nav>
        <div className="owner-sidebar-bottom"><div className="owner-support-card"><span>?</span><strong>Need help?</strong><small>We’re here to help you get set up.</small></div><div className="owner-profile"><span className="owner-profile-avatar">{ownerName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><strong>{ownerName}</strong><small>Shop owner</small></span><OwnerLogout /></div></div>
      </aside>
      <section className="owner-workspace"><header className="owner-topbar"><div><span className="owner-topbar-shop">{shopName}</span><span className="owner-online"><i /> Shop active</span></div><Link href="/" className="owner-view-site">View public site <span>↗</span></Link></header>{children}</section>
    </main>
  );
}
