"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function ShopRegistrationPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function registerShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/auth/register-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not register the shop.");
      if (!result.ok) throw new Error(result.error ?? "Shop registered. Sign in to continue.");
      router.replace(result.redirectTo ?? "/owner");
      router.refresh();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Could not register the shop.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="register-page">
      <header className="register-topbar"><Link href="/" className="order-brand" aria-label="QPrint home"><span className="order-brand-mark"><i /><i /><i /><i /></span><span>qprint<span>.</span></span></Link><div>Already have a shop account? <Link href="/login">Sign in</Link></div></header>
      <section className="register-shell">
        <div className="register-intro"><div className="login-eyebrow">JOIN THE QPRINT NETWORK</div><h1>Bring your shop<br />to <em>QPrint.</em></h1><p>Create an owner account and shop profile, or use an existing owner account to add a shop after a reset.</p><div className="register-steps"><div><span>01</span><strong>Your account</strong></div><i /><div><span>02</span><strong>Your shop</strong></div><i /><div><span>03</span><strong>Set your rates</strong></div></div></div>
        <form className="register-card" onSubmit={registerShop}>
          <div className="register-card-heading"><div><span className="step-overline">SHOP OWNER REGISTRATION</span><h2>Tell us about your shop</h2><p>Fields marked with * are required.</p></div><span className="card-heading-icon">✳</span></div>
          <div className="register-section-label">OWNER ACCOUNT</div>
          <div className="register-grid"><div className="register-field"><label htmlFor="ownerName">FULL NAME *</label><input id="ownerName" name="ownerName" autoComplete="name" required minLength={2} maxLength={150} placeholder="Your full name" /></div><div className="register-field"><label htmlFor="email">EMAIL ADDRESS *</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={190} placeholder="you@example.com" /></div><div className="register-field"><label htmlFor="password">PASSWORD *</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} placeholder="At least 8 characters" /><small>Use at least 8 characters. Existing owners can use their current password.</small></div><div className="register-field"><label htmlFor="ownerContact">OWNER CONTACT NUMBER</label><input id="ownerContact" name="ownerContact" autoComplete="tel" maxLength={30} placeholder="Optional" /></div></div>
          <div className="register-section-label shop-details-label">SHOP DETAILS</div>
          <div className="register-grid"><div className="register-field"><label htmlFor="shopName">SHOP NAME *</label><input id="shopName" name="shopName" required minLength={2} maxLength={150} placeholder="Your print shop name" /></div><div className="register-field"><label htmlFor="shopAddress">SHOP ADDRESS *</label><input id="shopAddress" name="shopAddress" required minLength={5} maxLength={10000} placeholder="Street, city, region" /></div><div className="register-field"><label htmlFor="shopContact">SHOP CONTACT NUMBER</label><input id="shopContact" name="shopContact" maxLength={30} placeholder="Optional" /></div><div className="register-field"><label htmlFor="shopEmail">SHOP EMAIL</label><input id="shopEmail" name="shopEmail" type="email" maxLength={190} placeholder="Optional" /></div><div className="register-field full-width"><label htmlFor="description">SHOP DESCRIPTION</label><textarea id="description" name="description" rows={3} maxLength={20000} placeholder="Optional" /></div></div>
          <div className="register-privacy"><span>i</span><p>Your password is stored as a secure hash. After registration, you’ll go to your shop dashboard to add services and prices.</p></div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="login-submit register-submit" type="submit" disabled={busy}>{busy ? "Creating your shop…" : "Create shop account"}<span>→</span></button>
          <p className="register-terms">By registering, you agree to QPrint’s terms and privacy policy.</p>
        </form>
      </section>
      <footer className="login-footer">QPrint · Local printing, made simple</footer>
    </main>
  );
}
