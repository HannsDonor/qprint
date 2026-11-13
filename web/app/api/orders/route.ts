import { createHash, randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { cleanupExpiredDocuments, documentExpiresAt } from "@/lib/document-cleanup";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ORDER_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_PAGES_PER_FILE = 10_000;
const allowedPapers = new Set(["A4", "A3", "A5", "A2", "A1", "A0", "Short", "Long", "Letter", "Legal"]);
const allowedColors = new Set(["black_white", "colored"]);

type UploadedDocument = { file: File; bytes: Buffer; pageCount: number; storedName: string; path: string };

function mysqlBoolean(value: unknown) {
  if (value === true || value === 1 || value === "1") return true;
  return Buffer.isBuffer(value) && value.length > 0 && value[0] === 1;
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function POST(request: Request) {
  await cleanupExpiredDocuments().catch((error: unknown) => console.error("Could not clean up expired documents before order creation", error));
  const origin = request.headers.get("origin");
  const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.toLowerCase();
  if (origin && requestHost) {
    let originHost = "";
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed origin */ }
    if (!originHost || originHost !== requestHost) {
      return NextResponse.json({ error: "Cross-site order submissions are not allowed." }, { status: 403 });
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ORDER_SIZE + 1024 * 1024) {
    return NextResponse.json({ error: "This order is too large. The total upload limit is 50 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded files." }, { status: 400 });
  }

  const shopId = Number(formData.get("shopId"));
  const paperSize = String(formData.get("paperSize") ?? "");
  const colorMode = String(formData.get("colorMode") ?? "");
  const copies = Number(formData.get("copies"));
  const orientation = String(formData.get("orientation") ?? "");
  const priority = formData.get("priority") === "true";
  const quotedTotalCents = Number(formData.get("quotedTotalCents"));
  const files = formData.getAll("documents").filter((item): item is File => item instanceof File);

  if (!Number.isSafeInteger(shopId) || shopId < 1) return NextResponse.json({ error: "Choose a valid print shop." }, { status: 400 });
  if (!allowedPapers.has(paperSize) || !allowedColors.has(colorMode)) return NextResponse.json({ error: "Choose valid print settings." }, { status: 400 });
  if (!Number.isInteger(copies) || copies < 1 || copies > 999) return NextResponse.json({ error: "Copies must be a whole number between 1 and 999." }, { status: 400 });
  if (!Number.isSafeInteger(quotedTotalCents) || quotedTotalCents < 0) return NextResponse.json({ error: "Review the order total before submitting." }, { status: 400 });
  if (orientation !== "portrait" && orientation !== "landscape") return NextResponse.json({ error: "Choose a valid page orientation." }, { status: 400 });
  if (files.length < 1 || files.length > MAX_FILES) return NextResponse.json({ error: `Upload between 1 and ${MAX_FILES} PDF files.` }, { status: 400 });

  const documents: UploadedDocument[] = [];
  let totalBytes = 0;
  const storageDirectory = path.join(process.cwd(), "storage", "documents");
  await mkdir(storageDirectory, { recursive: true, mode: 0o700 });

  try {
    for (const file of files) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error(`${file.name} is not a PDF file.`);
      if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error(`${file.name} must be smaller than 20 MB.`);
      totalBytes += file.size;
      if (totalBytes > MAX_ORDER_SIZE) throw new Error("The total upload limit is 50 MB.");

      const bytes = Buffer.from(await file.arrayBuffer());
      const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
      const pageCount = pdf.getPageCount();
      if (pageCount < 1 || pageCount > MAX_PAGES_PER_FILE) throw new Error(`${file.name} must contain between 1 and ${MAX_PAGES_PER_FILE} pages.`);
      documents.push({ file, bytes, pageCount, storedName: `${randomBytes(24).toString("hex")}.pdf`, path: "" });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "A PDF could not be processed." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof db.getConnection>>;
  try {
    connection = await db.getConnection();
  } catch (error) {
    console.error("Could not connect to QPrint MySQL", error);
    return NextResponse.json({ error: "Could not connect to the QPrint database." }, { status: 503 });
  }
  const writtenPaths: string[] = [];
  try {
    await connection.beginTransaction();

    const [shopRows] = await connection.query<(RowDataPacket & {
      id: number;
      shop_name: string;
      is_active: number;
      priority_enabled: number;
      priority_fee: string;
    })[]>(`SELECT s.id, s.shop_name, s.is_active,
                 COALESCE(ps.is_enabled, 0) AS priority_enabled,
                 COALESCE(ps.priority_fee, 0.00) AS priority_fee
          FROM shops s
          LEFT JOIN shop_priority_settings ps ON ps.shop_id = s.id
          WHERE s.id = ? FOR UPDATE`, [shopId]);
    const shop = shopRows[0];
    if (!shop || !shop.is_active) throw new Error("This print shop is no longer available.");
    if (priority && !mysqlBoolean(shop.priority_enabled)) throw new Error("Priority printing is no longer available at this shop.");

    const [priceRows] = await connection.query<(RowDataPacket & {
      service_id: number;
      service_name: string;
      price_id: number;
      color_mode: "black_white" | "colored";
      price: string;
    })[]>(`SELECT ss.id AS service_id, ss.service_name, sp.id AS price_id, sp.color_mode, sp.price
          FROM shop_services ss
          INNER JOIN shop_service_prices sp ON sp.service_id = ss.id
          WHERE ss.shop_id = ? AND ss.service_name = 'Document Printing' AND ss.category = 'printing'
            AND ss.pricing_type = 'per_page' AND ss.is_available = 1 AND ss.is_archived = 0
            AND sp.color_mode = ? AND sp.is_available = 1
          ORDER BY sp.id ASC LIMIT 1 FOR UPDATE`, [shopId, colorMode]);
    const priceOption = priceRows[0];
    if (!priceOption) throw new Error("That print option is no longer available at the selected shop. Go back and choose another option.");

    const selectedPages = documents.reduce((sum, document) => sum + document.pageCount, 0);
    const quantity = selectedPages * copies;
    const unitPriceCents = Math.round(Number(priceOption.price) * 100);
    const printTotalCents = quantity * unitPriceCents;
    const priorityFeeCents = priority ? Math.round(Number(shop.priority_fee) * 100) : 0;
    const totalCents = printTotalCents + priorityFeeCents;
    if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 9_999_999_999) throw new Error("The calculated order amount is outside the supported range.");
    if (quotedTotalCents !== totalCents) throw new Error("The shop's price changed while you were reviewing. Go back to review the updated total.");

    const jobCode = `QP-${randomBytes(5).toString("hex").toUpperCase()}`;
    const qrToken = randomBytes(32).toString("base64url");
    const qrTokenHash = createHash("sha256").update(qrToken).digest("hex");
    const expiresAt = documentExpiresAt();

    const [jobResult] = await connection.execute<import("mysql2").ResultSetHeader>(`INSERT INTO print_jobs
      (job_code, customer_id, shop_id, print_type, status, base_price, priority_fee, total_price, qr_token_hash, expires_at)
      VALUES (?, NULL, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?)`, [jobCode, shopId, priority ? "priority" : "standard", money(printTotalCents), money(priorityFeeCents), money(totalCents), qrTokenHash, expiresAt]);
    const jobId = jobResult.insertId;

    for (const document of documents) {
      const absolutePath = path.join(storageDirectory, document.storedName);
      await writeFile(absolutePath, document.bytes, { flag: "wx", mode: 0o600 });
      writtenPaths.push(absolutePath);
      document.path = path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
      const originalFilename = document.file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "document.pdf";
      await connection.execute(`INSERT INTO documents
        (job_id, original_filename, stored_filename, file_path, file_size, mime_type, page_count, expires_at)
        VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?)`, [jobId, originalFilename, document.storedName, document.path, document.file.size, document.pageCount, expiresAt]);
    }

    await connection.execute(`INSERT INTO print_settings (job_id, paper_size, color_mode, copies, orientation)
      VALUES (?, ?, ?, ?, ?)`, [jobId, paperSize, colorMode, copies, orientation]);

    for (const document of documents) {
      const documentQuantity = document.pageCount * copies;
      await connection.execute(`INSERT INTO print_job_items
        (job_id, service_id, service_price_id, service_name, option_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [jobId, priceOption.service_id, priceOption.price_id, priceOption.service_name, colorMode === "black_white" ? "Black & White" : "Colored", documentQuantity, money(unitPriceCents), money(documentQuantity * unitPriceCents)]);
    }

    await connection.execute(`INSERT INTO payments (job_id, amount, payment_method, payment_status)
      VALUES (?, ?, 'cash', 'pending')`, [jobId, money(totalCents)]);
    await connection.execute(`INSERT INTO job_status_history (job_id, previous_status, new_status, remarks)
      VALUES (?, NULL, 'awaiting_payment', 'Print order submitted; awaiting in-shop payment.')`, [jobId]);
    await connection.commit();

    return NextResponse.json({
      jobCode,
      qrToken,
      shopName: shop.shop_name,
      status: "awaiting_payment",
      expiresAt: expiresAt.toISOString(),
      price: { printing: money(printTotalCents), priority: money(priorityFeeCents), total: money(totalCents), currency: "PHP" },
      documents: documents.map((document) => ({ name: document.file.name, pages: document.pageCount })),
      settings: { paperSize, colorMode, copies, orientation, priority },
    }, { status: 201 });
  } catch (error) {
    await connection.rollback().catch((rollbackError: unknown) => console.error("Could not roll back QPrint order", rollbackError));
    await Promise.all(writtenPaths.map((filePath) => rm(filePath, { force: true })));
    const message = error instanceof Error ? error.message : "Could not create the print order.";
    const expected = ["This print shop", "Priority printing", "That print option", "The calculated order", "The shop's price changed"];
    if (expected.some((prefix) => message.startsWith(prefix))) return NextResponse.json({ error: message }, { status: 409 });
    console.error("Could not create QPrint order", error);
    return NextResponse.json({ error: "Could not create this order. Please try again." }, { status: 500 });
  } finally {
    connection.release();
  }
}
