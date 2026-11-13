import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
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

function verifyPassword(password: string, storedHash: string) {
  return new Promise<boolean>((resolve, reject) => {
    const [algorithm, salt, encoded] = storedHash.split("$");
    if (algorithm !== "scrypt" || !salt || !/^[a-f\d]{128}$/i.test(encoded ?? "")) return resolve(false);
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) return reject(error);
      const expected = Buffer.from(encoded, "hex");
      resolve(expected.length === derived.length && timingSafeEqual(expected, derived));
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

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try { connection = await db.getConnection(); } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }

  let userId: number;
  let sessionName = ownerName;
  try {
    await connection.beginTransaction();
    const [existingUsers] = await connection.query<(import("mysql2").RowDataPacket & { id: number; full_name: string; password: string; role: string; is_active: number })[]>(
      `SELECT id, full_name, password, role, is_active FROM users WHERE email = ? LIMIT 1 FOR UPDATE`, [email]);
    if (existingUsers[0]) {
      const existingUser = existingUsers[0];
      if (existingUser.role !== "shop_owner" || !existingUser.is_active || !(await verifyPassword(password, existingUser.password))) {
        await connection.rollback();
        return NextResponse.json({ error: "That email already has an account. Check the account details or sign in." }, { status: 409 });
      }
      const [existingShops] = await connection.query<(import("mysql2").RowDataPacket & { id: number })[]>(
        `SELECT id FROM shops WHERE owner_id = ? LIMIT 1 FOR UPDATE`, [existingUser.id]);
      if (existingShops[0]) {
        await connection.rollback();
        return NextResponse.json({ error: "This account already has a shop. Sign in to manage it." }, { status: 409 });
      }
      userId = existingUser.id;
      sessionName = existingUser.full_name;
    } else {
      const salt = randomBytes(16).toString("hex");
      const passwordHash = await hashPassword(password, salt);
      const [userResult] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO users
        (full_name, email, password, role, contact_number, is_active)
        VALUES (?, ?, ?, 'shop_owner', ?, 1)`, [ownerName, email, passwordHash, ownerContact || null]);
      userId = userResult.insertId;
    }

    const [shopResult] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO shops
      (owner_id, shop_name, description, address, contact_number, email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)`, [userId, shopName, description || null, shopAddress, shopContact || null, shopEmail || null]);

    await connection.execute(`INSERT INTO shop_priority_settings (shop_id, is_enabled, priority_fee) VALUES (?, 0, 0.00)`, [shopResult.insertId]);
    await connection.execute(`INSERT INTO shop_services
      (shop_id, service_name, category, description, pricing_type, is_available, is_archived)
      VALUES (?, 'Document Printing', 'printing', 'Basic document printing.', 'per_page', 1, 0)`, [shopResult.insertId]);
    const [serviceResult] = await connection.query<(import("mysql2").RowDataPacket & { id: number })[]>(`SELECT id FROM shop_services
      WHERE shop_id = ? AND service_name = 'Document Printing' AND category = 'printing' ORDER BY id DESC LIMIT 1`, [shopResult.insertId]);
    const serviceId = serviceResult[0]?.id;
    if (!serviceId) throw new Error("Could not create the default Document Printing service.");
    await connection.execute(`INSERT INTO shop_service_prices (service_id, color_mode, price, is_available)
      VALUES (?, 'black_white', 0.00, 0), (?, 'colored', 0.00, 0)`, [serviceId, serviceId]);
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
    session.fullName = sessionName;
    await session.save();
  } catch (error) {
    console.error("Shop was registered but session could not be created", error);
    return NextResponse.json({ error: "Your shop was registered. Sign in with your new account to continue." }, { status: 201 });
  }

  return NextResponse.json({ ok: true, redirectTo: "/owner" }, { status: 201 });
}
