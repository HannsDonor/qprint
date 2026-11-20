"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PrioritySettingsForm({ initialEnabled, initialFee }: { initialEnabled: boolean; initialFee: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [fee, setFee] = useState(initialFee);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/owner/priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, fee }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save priority settings.");
      setMessage("Priority settings saved.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save priority settings.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="priority-settings-form" onSubmit={submit}>
    <div className="priority-settings-copy"><strong>Priority Processing</strong><span>Paid priority orders are placed ahead of standard waiting orders. They are not guaranteed an exact completion time.</span></div>
    <label className={`priority-toggle ${enabled ? "is-on" : "is-off"}`}>
      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      <span className="priority-toggle-switch" aria-hidden="true"><i /></span>
      <span className="priority-toggle-copy"><b>{enabled ? "Priority is ON" : "Priority is OFF"}</b><small>New customers {enabled ? "can select" : "cannot select"} priority processing.</small></span>
    </label>
    <label className="priority-fee-field"><span>ADDITIONAL FEE (PHP)</span><input type="number" min="0" max="99999999.99" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} required /></label>
    {error && <p className="service-form-error" role="alert">{error}</p>}
    {message && <p className="service-form-success" role="status">{message}</p>}
    <button className="priority-save-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save priority settings"}<span>→</span></button>
  </form>;
}
