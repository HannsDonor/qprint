"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OwnerLogout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
      setBusy(false);
    }
  }

  return <button className="owner-logout" type="button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}<span>↗</span></button>;
}
