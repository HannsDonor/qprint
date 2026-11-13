"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type InitialPrices = { black_white: string; colored: string };

export default function ServiceCreateForm({ initialPrices }: { initialPrices: InitialPrices }) {
  const router = useRouter();
  const [prices, setPrices] = useState(initialPrices);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSavedMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/owner/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save printing prices.");
      setSavedMessage("Black & white and colored prices saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save printing prices.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="service-create-form" onSubmit={submit}>
    <p className="standard-print-note">Set the price per page for each printing mode. A price of ₱0.00 is treated as unavailable for checkout.</p>
    <div className="service-option-list">
      <label className="service-option-editor standard-print-rate-editor">
        <span className="service-option-index">01</span>
        <span className="standard-print-option"><strong>Black &amp; white</strong><small>Shop-specific price per page</small></span>
        <span className="service-create-field option-price-field"><span>PRICE / PAGE (PHP)</span><input type="number" min="0" max="99999999.99" step="0.01" required value={prices.black_white} onChange={(event) => setPrices((current) => ({ ...current, black_white: event.target.value }))} placeholder="0.00" /></span>
      </label>
      <label className="service-option-editor standard-print-rate-editor">
        <span className="service-option-index">02</span>
        <span className="standard-print-option"><strong>Colored</strong><small>Shop-specific price per page</small></span>
        <span className="service-create-field option-price-field"><span>PRICE / PAGE (PHP)</span><input type="number" min="0" max="99999999.99" step="0.01" required value={prices.colored} onChange={(event) => setPrices((current) => ({ ...current, colored: event.target.value }))} placeholder="0.00" /></span>
      </label>
    </div>
    {error && <p className="service-form-error" role="alert">{error}</p>}
    {savedMessage && <p className="service-form-success" role="status">{savedMessage}</p>}
    <div className="service-form-footer"><span>Existing orders keep their historical prices.</span><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save prices"}<span>→</span></button></div>
  </form>;
}
