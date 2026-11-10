import { randomBytes, scrypt } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOwnerSession } from "@/lib/session";

function hashPassword(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(`scrypt$${salt}$${derived.toString("hex")}`);
    });
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.toLowerCase();
  if (origin && host) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed origin */ }
    if (!originHost || originHost !== host) return NextResponse.json({ error: "Cross-site registration is not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your owner and shop details." }, { status: 400 }); }
  const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ownerContact = typeof body.ownerContact === "string" ? body.ownerContact.trim() : "";
  const shopName = typeof body.shopName === "string" ? body.shopName.trim() : "";
  const shopAddress = typeof body.shopAddress === "string" ? body.shopAddress.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const shopContact = typeof body.shopContact === "string" ? body.shopContact.trim() : "";
  const shopEmail = typeof body.shopEmail === "string" ? body.shopEmail.trim().toLowerCase() : "";

  if (ownerName.length < 2 || ownerName.length > 150) return NextResponse.json({ error: "Enter the owner’s name (2–150 characters)." }, { status: 400 });
  if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8 || password.length > 1024) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  if (ownerContact.length > 30 || shopContact.length > 30) return NextResponse.json({ error: "Phone numbers must be 30 characters or fewer." }, { status: 400 });
  if (shopName.length < 2 || shopName.length > 150) return NextResponse.json({ error: "Enter a shop name (2–150 characters)." }, { status: 400 });
  if (shopAddress.length < 5 || shopAddress.length > 10_000) return NextResponse.json({ error: "Enter the shop’s full address." }, { status: 400 });
  if (description.length > 20_000) return NextResponse.json({ error: "The shop description is too long." }, { status: 400 });
  if (shopEmail && (shopEmail.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopEmail))) return NextResponse.json({ error: "Enter a valid shop email address." }, { status: 400 });

  const salt = randomBytes(16).toString("hex");
  let passwordHash: string;
  try { passwordHash = await hashPassword(password, salt); } catch (error) {
    console.error("Could not hash QPrint registration password", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }

  let userId: number;
  try {
    await connection.beginTransaction();
    const [userResult] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO users
      (full_name, email, password, role, contact_number, is_active)
      VALUES (?, ?, ?, 'shop_owner', ?, 1)`, [ownerName, email, passwordHash, ownerContact || null]);
    userId = userResult.insertId;

    const [shopResult] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO shops
      (owner_id, shop_name, description, address, contact_number, email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)`, [userId, shopName, description || null, shopAddress, shopContact || null, shopEmail || null]);

    await connection.execute(`INSERT INTO shop_priority_settings (shop_id, is_enabled, priority_fee) VALUES (?, 0, 0.00)`, [shopResult.insertId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back QPrint registration", rollbackError));
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "An account already exists for this email. Sign in instead." }, { status: 409 });
    }
    console.error("Could not create QPrint shop registration", error);
    return NextResponse.json({ error: "Could not create the shop registration. Please try again." }, { status: 500 });
  } finally {
    connection.release();
  }

  try {
    const session = await getOwnerSession();
    session.userId = userId;
    session.role = "shop_owner";
    session.fullName = ownerName;
    await session.save();
  } catch (error) {
    console.error("Shop was registered but session could not be created", error);
    return NextResponse.json({ error: "Your shop was registered. Sign in with your new account to continue." }, { status: 201 });
  }

  return NextResponse.json({ ok: true, redirectTo: "/owner" }, { status: 201 });
}
