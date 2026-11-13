import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext } from "@/lib/owner-data";
import Scanner from "./scanner";

async function ScannerContent() {
  const owner = await getOwnerContext();
  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="scanner">
    <div className="owner-page-content">
      <div className="owner-page-heading"><div><div className="owner-date-line">SHOP WORKSPACE</div><h1>QR scanner</h1><p>Scan a customer pickup QR code to confirm payment and add the order to your paid queue.</p></div></div>
      <Scanner />
    </div>
  </OwnerShell>;
}

export default function OwnerScannerPage() {
  return <Suspense fallback={<div className="owner-loading">Loading QR scanner…</div>}><ScannerContent /></Suspense>;
}
