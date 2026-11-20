"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ShopStatusToggle({ initialActive }: { initialActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const nextActive = !active;
    if (active && !window.confirm("Turn off your shop? Customers won't see it or be able to place new orders until you turn it back on.")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/shop-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update your shop status.");
      setActive(nextActive);
      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update your shop status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shop-status">
      <button
        type="button"
        className={`shop-status-toggle ${active ? "active" : "inactive"}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={active}
        title={active ? "Your shop is visible to customers. Click to turn it off." : "Your shop is hidden from customers. Click to turn it on."}
      >
        <span className="shop-status-switch" aria-hidden="true"><i /></span>
        <span className="shop-status-label">{busy ? "Saving…" : active ? "Shop active" : "Shop inactive"}</span>
      </button>
      {error && <span className="shop-status-error" role="alert">{error}</span>}
    </div>
  );
}
