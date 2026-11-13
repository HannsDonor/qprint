"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useEffect } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!active || !response.ok) return;
      const body = await response.json();
      if (body.authenticated) router.replace("/owner");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not sign in.");
      router.replace(body.redirectTo ?? "/owner");
      router.refresh();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-card">
    <div className="login-icon"><span className="order-brand-mark"><i /><i /><i /><i /></span></div>
    <div className="login-eyebrow">SHOP OWNER PORTAL</div>
    <h1>Welcome <em>back.</em></h1>
    <p className="login-intro">Sign in to manage your print shop, orders, and services.</p>
    <form className="login-form" onSubmit={signIn}>
      <label htmlFor="owner-email">EMAIL ADDRESS</label>
      <input id="owner-email" type="email" autoComplete="username" required maxLength={190} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourshop.com" />
      <div className="login-password-label"><label htmlFor="owner-password">PASSWORD</label></div>
      <input id="owner-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
      {error && <div className="login-error" role="alert">{error}</div>}
      <button type="submit" className="login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to your shop"}<span>→</span></button>
    </form>
    <div className="login-divider"><span />SECURE SHOP ACCESS<span /></div>
    <p className="login-help">Use the email and password for your registered QPrint shop-owner account.</p>
    <p className="login-register-link">New to QPrint? <Link href="/register/shop">Register your shop</Link></p>
  </section>;
}
