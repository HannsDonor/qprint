import { rm } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export const DOCUMENT_EXPIRY_MINUTES = 30;
export const DOCUMENT_EXPIRY_MS = DOCUMENT_EXPIRY_MINUTES * 60 * 1000;

export function documentExpiresAt() {
  return new Date(Date.now() + DOCUMENT_EXPIRY_MS);
}

export async function cleanupExpiredDocuments() {
  const [documents] = await db.query<(RowDataPacket & { id: number; file_path: string })[]>(`SELECT id, file_path
    FROM documents WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP() AND deleted_at IS NULL
    LIMIT 100`);
  const storageRoot = path.resolve(process.cwd(), "storage", "documents") + path.sep;
  for (const document of documents) {
    const resolvedPath = path.resolve(process.cwd(), document.file_path);
    if (!resolvedPath.startsWith(storageRoot)) {
      console.error("Skipped expired document outside storage directory", document.id);
      continue;
    }
    await rm(resolvedPath, { force: true });
    await db.execute(`UPDATE documents SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL`, [document.id]);
  }
}
