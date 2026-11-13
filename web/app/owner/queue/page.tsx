import { Suspense } from "react";
import OwnerShell from "@/components/owner-shell";
import { getOwnerContext, getOwnerQueue } from "@/lib/owner-data";
import QueueList from "./queue-list";

async function QueueContent() {
  const owner = await getOwnerContext();
  const queue = await getOwnerQueue(owner.shopId);
  return <OwnerShell ownerName={owner.fullName} shopName={owner.shopName} active="queue">
    <div className="owner-page-content"><div className="owner-page-heading"><div><div className="owner-date-line">SHOP WORKSPACE</div><h1>Printing queue</h1><p>Paid jobs are ordered by processing type, then by payment time.</p></div></div><QueueList initialQueue={queue} /></div>
  </OwnerShell>;
}

export default function OwnerQueuePage() {
  return <Suspense fallback={<div className="owner-loading">Loading your printing queue…</div>}><QueueContent /></Suspense>;
}
