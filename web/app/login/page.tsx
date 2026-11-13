"use client";

import Link from "next/link";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <main className="login-page">
    <div className="login-ambient login-ambient-one" /><div className="login-ambient login-ambient-two" />
    <header className="login-topbar"><Link href="/" className="order-brand" aria-label="QPrint home"><span className="order-brand-mark"><i /><i /><i /><i /></span><span>qprint<span>.</span></span></Link><Link href="/" className="login-back">← Back to QPrint</Link></header>
    <LoginForm />
    <footer className="login-footer">QPrint · Local printing, made simple</footer>
  </main>;
}
