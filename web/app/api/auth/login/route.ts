import { scrypt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

const DUMMY_HASH = `scrypt$qprint-login-dummy-salt$${"0".repeat(128)}`;

function derivePasswordHash(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}
const attemptsByAddress = new Map<string, { count: number; resetAt: number }>();

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, encoded] = storedHash.split("$");
  const supported = algorithm === "scrypt" && Boolean(salt) && /^[a-f\d]{128}$/i.test(encoded ?? "");
  const candidateHash = await derivePasswordHash(password, supported ? salt! : "qprint-login-dummy-salt");
  if (!supported) return false;
  const expectedHash = Buffer.from(encoded ?? "", "hex");
  return expectedHash.length === candidateHash.length && timingSafeEqual(expectedHash, candidateHash);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.toLowerCase();
  if (origin && host) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed origin */ }
    if (!originHost || originHost !== host) return NextResponse.json({ error: "Cross-site sign in is not allowed." }, { status: 403 });
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "local";
  const now = Date.now();
  const attempts = attemptsByAddress.get(address);
  if (attempts && attempts.resetAt > now && attempts.count >= 10) {
    return NextResponse.json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." }, { status: 429 });
  }
  if (attemptsByAddress.size > 5000) {
    for (const [key, attempt] of attemptsByAddress) if (attempt.resetAt <= now) attemptsByAddress.delete(key);
  }

  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your email and password." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length < 3 || email.length > 190 || password.length < 1 || password.length > 1024) {
    return NextResponse.json({ error: "Enter your shop-owner email and password." }, { status: 400 });
  }

  try {
    const [users] = await db.query<(RowDataPacket & {
      id: number;
      full_name: string;
      email: string;
      password: string;
      role: string;
      is_active: number;
    })[]>(`SELECT id, full_name, email, password, role, is_active FROM users WHERE email = ? LIMIT 1`, [email]);
    const user = users[0];
    const passwordMatches = await verifyPassword(password, user?.password ?? DUMMY_HASH);

    if (!user || !user.is_active || user.role !== "shop_owner" || !passwordMatches) {
      if (attempts && attempts.resetAt > now) attempts.count += 1;
      else attemptsByAddress.set(address, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const [shops] = await db.query<(RowDataPacket & { id: number })[]>(`SELECT id FROM shops WHERE owner_id = ? AND is_active = 1 ORDER BY id LIMIT 1`, [user.id]);
    if (!shops[0]) return NextResponse.json({ error: "This account has no active shop. Contact QPrint support." }, { status: 403 });

    const session = await getOwnerSession();
    session.userId = user.id;
    session.role = "shop_owner";
    session.fullName = user.full_name;
    await session.save();
    attemptsByAddress.delete(address);

    return NextResponse.json({ ok: true, redirectTo: "/owner" });
  } catch (error) {
    console.error("QPrint owner sign in failed", error);
    return NextResponse.json({ error: "Could not sign in. Check the database and session configuration." }, { status: 503 });
  }
}
